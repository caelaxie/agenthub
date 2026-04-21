import { HttpError } from "../../common/errors/http-error";
import type {
  AgentPublicationInput,
  AgentPublication,
  PublishAcceptedResponse,
  PublisherContext,
  PublisherAgentRecord,
} from "../../common/types/api";
import {
  DEFAULT_SNAPSHOT_TTL_SECONDS,
  VERIFICATION_CHALLENGE_TTL_MINUTES,
} from "../../config/constants";
import { addMinutes, nowIso } from "../../common/utils/time";
import { generateOpaqueToken } from "../../common/utils/crypto";
import type { PublicationRepository } from "./publication.repo";
import type { PublicationSnapshot, StoredPublicationRecord } from "./publication.entity";

interface PublishAgentResult {
  created: boolean;
  response: PublishAcceptedResponse;
}

interface NormalizedAgentCardResult {
  snapshot: PublicationSnapshot;
  etag?: string;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class PublicationService {
  constructor(
    private readonly publicationRepo: PublicationRepository,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async publishAgent(
    agentId: string,
    publication: AgentPublicationInput,
    publisher: PublisherContext,
  ): Promise<PublishAgentResult> {
    this.assertAuthenticated(publisher);

    const sourceUrl = this.normalizeAgentCardUrl(publication.agent_card_url);
    const namespace = this.extractNamespace(agentId);
    const existingRecord = await this.publicationRepo.getByAgentId(agentId);
    const namespaceOwner = await this.publicationRepo.getNamespaceOwner(namespace);

    if (existingRecord) {
      this.assertCanAdminister(existingRecord, publisher);

      if (
        this.getOrigin(existingRecord.agentCardRef.source_url) !==
        this.getOrigin(sourceUrl)
      ) {
        throw HttpError.badRequest(
          "invalid_request_body",
          "Cross-origin republish is not supported for an existing agent_id.",
        );
      }
    } else if (namespaceOwner && namespaceOwner !== publisher.subject) {
      throw HttpError.forbidden(
        "namespace_forbidden",
        "The caller is not allowed to publish into this namespace.",
      );
    }

    const normalizedCard = await this.fetchAndNormalizeAgentCard(
      sourceUrl,
      publication.summary_overrides?.provider,
    );
    const duplicate = await this.publicationRepo.findActiveBySourceUrl(sourceUrl);

    if (duplicate && duplicate.agentId !== agentId) {
      throw HttpError.conflict(
        "duplicate_publication_conflict",
        "Another active publication already owns this canonical Agent Card.",
      );
    }

    const lastValidatedAt = nowIso();
    const challenge = this.buildChallenge(sourceUrl, agentId);
    const normalizedPublication: AgentPublication = {
      agent_card_url: sourceUrl,
      visibility: publication.visibility,
      facts_ref: publication.facts_ref ?? null,
      ...(publication.summary_overrides
        ? { summary_overrides: publication.summary_overrides }
        : {}),
    };

    await this.publicationRepo.upsert({
      agentId,
      namespace,
      publication: normalizedPublication,
      pendingOwnerSubject: namespaceOwner ? null : publisher.subject,
      status: "pending_verification",
      agentCardRef: {
        source_url: sourceUrl,
        access_url: sourceUrl,
        access_mode:
          publication.visibility === "public" ? "public" : "protected",
        last_validated_at: lastValidatedAt,
        ...(normalizedCard.etag ? { etag: normalizedCard.etag } : {}),
      },
      snapshot: {
        ...normalizedCard.snapshot,
        updatedAt: lastValidatedAt,
      },
      challenge,
    });

    return {
      created: existingRecord === null,
      response: {
        agent_id: agentId,
        status: "pending_verification",
        challenge,
      },
    };
  }

  async getPublication(
    agentId: string,
    publisher: PublisherContext,
  ): Promise<PublisherAgentRecord> {
    this.assertAuthenticated(publisher);

    const record = await this.requirePublication(agentId);
    this.assertCanAdminister(record, publisher);

    return this.toPublisherAgentRecord(record);
  }

  async deactivateAgent(
    agentId: string,
    publisher: PublisherContext,
  ): Promise<{ agent_id: string; status: "inactive" }> {
    this.assertAuthenticated(publisher);

    const record = await this.requirePublication(agentId);
    this.assertCanAdminister(record, publisher);
    await this.publicationRepo.deactivate(agentId);

    return {
      agent_id: agentId,
      status: "inactive",
    };
  }

  private assertAuthenticated(publisher: PublisherContext): void {
    if (!publisher.isAuthenticated) {
      throw HttpError.unauthorized(
        "publisher_auth_required",
        "Publisher authentication is required.",
      );
    }
  }

  private async requirePublication(
    agentId: string,
  ): Promise<StoredPublicationRecord> {
    const record = await this.publicationRepo.getByAgentId(agentId);

    if (!record) {
      throw HttpError.notFound(
        "agent_not_found",
        `No publication found for agent_id '${agentId}'.`,
      );
    }

    return record;
  }

  private assertCanAdminister(
    record: StoredPublicationRecord,
    publisher: PublisherContext,
  ): void {
    const ownerSubject =
      record.namespaceOwnerSubject ?? record.pendingOwnerSubject;

    if (!ownerSubject || ownerSubject !== publisher.subject) {
      throw HttpError.forbidden(
        "publication_forbidden",
        "The caller does not own this publication record.",
      );
    }
  }

  private toPublisherAgentRecord(
    record: StoredPublicationRecord,
  ): PublisherAgentRecord {
    const ownerSubject =
      record.namespaceOwnerSubject ?? record.pendingOwnerSubject;

    if (!ownerSubject) {
      throw HttpError.internal(
        "publication_owner_missing",
        "Publication ownership state is incomplete.",
      );
    }

    return {
      agent_id: record.agentId,
      publication: record.publication,
      status: record.status,
      agent_card_ref: record.agentCardRef,
      ownership: {
        namespace: record.namespace,
        owner_subject: ownerSubject,
      },
      ...(record.challenge ? { challenge: record.challenge } : {}),
      last_validated_at: record.lastValidatedAt,
      verified_at: record.verifiedAt,
      last_error: record.lastError,
    };
  }

  private normalizeAgentCardUrl(agentCardUrl: string): string {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(agentCardUrl);
    } catch {
      throw HttpError.badRequest(
        "invalid_agent_card_url",
        "The agent_card_url must be a valid HTTPS URL.",
      );
    }

    if (parsedUrl.protocol !== "https:") {
      throw HttpError.badRequest(
        "invalid_agent_card_url",
        "The agent_card_url must use HTTPS.",
      );
    }

    return parsedUrl.toString();
  }

  private extractNamespace(agentId: string): string {
    return agentId.split(".").slice(0, -1).join(".");
  }

  private getOrigin(url: string): string {
    return new URL(url).origin;
  }

  private async fetchAndNormalizeAgentCard(
    sourceUrl: string,
    providerOverride?: string,
  ): Promise<NormalizedAgentCardResult> {
    let response: Response;

    try {
      response = await this.fetchImpl(sourceUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          accept: "application/json",
        },
      });
    } catch (error) {
      throw new HttpError({
        status: 502,
        code: "agent_card_fetch_failed",
        message: "Unable to fetch canonical Agent Card.",
        retryable: true,
        details: {
          cause: error instanceof Error ? error.message : "unknown",
        },
      });
    }

    if (!response.ok) {
      throw new HttpError({
        status: 502,
        code: "agent_card_fetch_failed",
        message: "Unable to fetch canonical Agent Card.",
        retryable: true,
        details: {
          status: response.status,
        },
      });
    }

    const rawBody = await response.text();
    let payload: unknown;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw HttpError.unprocessable(
        "agent_card_invalid",
        "The fetched document is not a valid A2A discovery card.",
      );
    }

    return {
      snapshot: this.normalizeAgentCard(payload, providerOverride),
      etag: response.headers.get("etag") ?? undefined,
    };
  }

  private normalizeAgentCard(
    payload: unknown,
    providerOverride?: string,
  ): PublicationSnapshot {
    if (!payload || typeof payload !== "object") {
      throw HttpError.unprocessable(
        "agent_card_invalid",
        "The fetched document is not a valid A2A discovery card.",
      );
    }

    const card = payload as Record<string, unknown>;
    const displayName =
      typeof card.name === "string" ? card.name.trim() : "";

    if (!displayName) {
      throw HttpError.unprocessable(
        "agent_card_invalid",
        "The fetched document is not a valid A2A discovery card.",
      );
    }

    const supportedInterfaces = Array.isArray(card.supportedInterfaces)
      ? card.supportedInterfaces
      : [];
    const supportedBindings = this.extractSupportedBindings(supportedInterfaces);

    if (supportedBindings.length === 0) {
      throw HttpError.unprocessable(
        "agent_card_invalid",
        "The fetched document is not a valid A2A discovery card.",
      );
    }

    const { skills, tags } = this.extractSkillsAndTags(card.skills);
    const provider =
      providerOverride?.trim() ||
      (typeof card.provider === "string" && card.provider.trim()
        ? card.provider.trim()
        : undefined);

    return {
      displayName,
      ...(provider ? { provider } : {}),
      skills,
      tags,
      supportedBindings,
      ttlSeconds: DEFAULT_SNAPSHOT_TTL_SECONDS,
      updatedAt: nowIso(),
    };
  }

  private extractSupportedBindings(interfaces: unknown[]): string[] {
    const bindings: string[] = [];

    for (const entry of interfaces) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const value = entry as Record<string, unknown>;
      const url = typeof value.url === "string" ? value.url.trim() : "";
      const protocolBinding =
        typeof value.protocolBinding === "string"
          ? value.protocolBinding.trim()
          : "";
      const protocolVersion =
        typeof value.protocolVersion === "string"
          ? value.protocolVersion.trim()
          : "";

      if (!url || !protocolBinding || !protocolVersion) {
        continue;
      }

      if (!bindings.includes(protocolBinding)) {
        bindings.push(protocolBinding);
      }
    }

    return bindings;
  }

  private extractSkillsAndTags(input: unknown): {
    skills: string[];
    tags: string[];
  } {
    if (!Array.isArray(input)) {
      return {
        skills: [],
        tags: [],
      };
    }

    const skills: string[] = [];
    const tags = new Set<string>();

    for (const entry of input) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const skill = entry as Record<string, unknown>;
      const normalizedSkill =
        this.normalizeSkillIdentifier(skill.id) ??
        this.normalizeSkillIdentifier(skill.name);

      if (normalizedSkill && !skills.includes(normalizedSkill)) {
        skills.push(normalizedSkill);
      }

      const skillTags = Array.isArray(skill.tags) ? skill.tags : [];

      for (const tag of skillTags) {
        if (typeof tag !== "string") {
          continue;
        }

        const normalizedTag = tag.trim().toLowerCase();

        if (normalizedTag) {
          tags.add(normalizedTag);
        }
      }
    }

    return {
      skills,
      tags: [...tags],
    };
  }

  private normalizeSkillIdentifier(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return normalized || null;
  }

  private buildChallenge(sourceUrl: string, agentId: string) {
    const origin = this.getOrigin(sourceUrl);
    const issuedAt = new Date();

    return {
      method: "well_known_token" as const,
      url: `${origin}/.well-known/agenthub-verification/${agentId}`,
      token: generateOpaqueToken(),
      expires_at: addMinutes(issuedAt, VERIFICATION_CHALLENGE_TTL_MINUTES),
    };
  }
}
