import type {
  PublisherContext,
  AgentPublicationInput,
  DomainVerificationChallenge,
} from "../../common/types/api";
import type {
  PublicationRepository,
} from "../../modules/publication/publication.repo";
import type {
  StoredPublicationRecord,
  UpsertPublicationRecord,
} from "../../modules/publication/publication.entity";

import { HttpError } from "../../common/errors/http-error";

export const validPublicationBody: AgentPublicationInput = {
  agent_card_url: "https://travel.example.com/.well-known/agent-card.json",
  visibility: "public",
};

export const testPublisher: PublisherContext = {
  subject: "publisher:test",
  isAuthenticated: true,
};

export const validAgentCard = {
  name: "Acme Travel Planner",
  provider: "Acme Travel",
  supportedInterfaces: [
    {
      url: "https://travel.example.com/a2a",
      protocolBinding: "HTTP+JSON",
      protocolVersion: "1.0",
    },
    {
      url: "https://travel.example.com/jsonrpc",
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    },
  ],
  skills: [
    {
      id: "flight-search",
      tags: ["Travel", "Booking"],
    },
    {
      name: "Itinerary Builder",
      tags: ["Travel"],
    },
  ],
};

export class InMemoryPublicationRepository implements PublicationRepository {
  readonly records = new Map<string, StoredPublicationRecord>();
  readonly namespaceOwners = new Map<string, string>();

  async getByAgentId(agentId: string): Promise<StoredPublicationRecord | null> {
    return this.records.get(agentId) ?? null;
  }

  async getNamespaceOwner(namespace: string): Promise<string | null> {
    return this.namespaceOwners.get(namespace) ?? null;
  }

  async findActiveBySourceUrl(
    sourceUrl: string,
  ): Promise<{ agentId: string } | null> {
    for (const record of this.records.values()) {
      if (
        record.agentCardRef.source_url === sourceUrl &&
        record.status === "active"
      ) {
        return {
          agentId: record.agentId,
        };
      }
    }

    return null;
  }

  async upsert(record: UpsertPublicationRecord): Promise<void> {
    const namespaceOwner = this.namespaceOwners.get(record.namespace) ?? null;

    this.records.set(record.agentId, {
      agentId: record.agentId,
      namespace: record.namespace,
      publication: record.publication,
      status: record.status,
      agentCardRef: record.agentCardRef,
      namespaceOwnerSubject: namespaceOwner,
      pendingOwnerSubject: record.pendingOwnerSubject,
      challenge: record.challenge,
      lastValidatedAt: record.agentCardRef.last_validated_at,
      verifiedAt: null,
      lastError: null,
    });
  }

  async completeVerification(
    agentId: string,
    publisherSubject: string,
    verifiedAt: string,
  ): Promise<void> {
    const record = this.records.get(agentId);

    if (!record) {
      return;
    }

    const currentOwner = this.namespaceOwners.get(record.namespace) ?? null;

    if (currentOwner && currentOwner !== publisherSubject) {
      throw HttpError.forbidden(
        "publication_forbidden",
        "The caller does not own this publication record.",
      );
    }

    this.namespaceOwners.set(record.namespace, publisherSubject);
    this.records.set(agentId, {
      ...record,
      status: "active",
      namespaceOwnerSubject: publisherSubject,
      pendingOwnerSubject: null,
      challenge: undefined,
      verifiedAt,
      lastError: null,
    });
  }

  async deactivate(agentId: string): Promise<void> {
    const record = this.records.get(agentId);

    if (!record) {
      return;
    }

    this.records.set(agentId, {
      ...record,
      status: "inactive",
    });
  }

  setNamespaceOwner(namespace: string, ownerSubject: string): void {
    this.namespaceOwners.set(namespace, ownerSubject);

    for (const [agentId, record] of this.records.entries()) {
      if (record.namespace !== namespace) {
        continue;
      }

      this.records.set(agentId, {
        ...record,
        namespaceOwnerSubject: ownerSubject,
        pendingOwnerSubject: null,
      });
    }
  }

  seed(record: StoredPublicationRecord): void {
    this.records.set(record.agentId, record);
  }
}

export const createJsonFetchResponse = (
  payload: unknown,
  init: ResponseInit = {},
): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
    ...init,
  });

export const createTextFetchResponse = (
  payload: string,
  init: ResponseInit = {},
): Response =>
  new Response(payload, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...init.headers,
    },
    ...init,
  });

export const createStoredRecord = (
  overrides: Partial<StoredPublicationRecord> = {},
): StoredPublicationRecord => {
  const issuedAt = new Date();
  const verifiedAt = overrides.verifiedAt;
  const challenge: DomainVerificationChallenge = {
    method: "well_known_token",
    url: "https://travel.example.com/.well-known/agenthub-verification/acme.travel-planner",
    token: "ahv1_testtoken",
    expires_at: new Date(issuedAt.getTime() + 30 * 60_000).toISOString(),
  };
  const lastValidatedAt =
    overrides.lastValidatedAt ?? new Date(issuedAt.getTime() - 60_000).toISOString();

  return {
    agentId: "acme.travel-planner",
    namespace: "acme",
    publication: {
      ...validPublicationBody,
      facts_ref: null,
    },
    status: "pending_verification",
    agentCardRef: {
      source_url: validPublicationBody.agent_card_url,
      access_url: validPublicationBody.agent_card_url,
      access_mode: "public",
      last_validated_at: lastValidatedAt,
      etag: "\"etag-1\"",
    },
    namespaceOwnerSubject: null,
    pendingOwnerSubject: "publisher:test",
    challenge,
    lastValidatedAt,
    verifiedAt: verifiedAt ?? null,
    lastError: null,
    ...overrides,
  };
};
