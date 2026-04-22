import { HttpError } from "../../common/errors/http-error";
import { nowIso } from "../../common/utils/time";
import type {
  PublisherContext,
  VerifyDomainRequest,
  VerifyDomainResponse,
} from "../../common/types/api";
import type { FetchLike } from "../publication/publication.service";
import {
  DrizzlePublicationRepository,
  type PublicationRepository,
} from "../publication/publication.repo";
import type { StoredPublicationRecord } from "../publication/publication.entity";

export class VerificationService {
  constructor(
    private readonly publicationRepo: PublicationRepository = new DrizzlePublicationRepository(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async verifyDomain(
    agentId: string,
    payload: VerifyDomainRequest,
    publisher: PublisherContext,
  ): Promise<VerifyDomainResponse> {
    this.assertAuthenticated(publisher);
    this.assertSupportedMethod(payload);

    const record = await this.requirePublication(agentId);
    this.assertCanAdminister(record, publisher);
    this.assertEligibleForVerification(record);

    const challenge = record.challenge;

    if (!challenge || this.isExpired(challenge.expires_at)) {
      throw HttpError.conflict(
        "verification_challenge_expired",
        "The stored verification challenge is no longer active.",
      );
    }

    await this.verifyChallengeResponse(record, challenge.url, challenge.token);

    const verifiedAt = nowIso();
    await this.publicationRepo.completeVerification(
      record.agentId,
      publisher.subject,
      verifiedAt,
    );

    return {
      agent_id: record.agentId,
      status: "active",
      verified_at: verifiedAt,
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

  private assertSupportedMethod(payload: VerifyDomainRequest): void {
    if (payload.method !== "well_known_token") {
      throw HttpError.badRequest(
        "invalid_request_body",
        "The request failed validation.",
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

  private assertEligibleForVerification(record: StoredPublicationRecord): void {
    if (record.status !== "pending_verification") {
      throw HttpError.conflict(
        "verification_challenge_expired",
        "The stored verification challenge is no longer active.",
      );
    }
  }

  private isExpired(expiresAt: string): boolean {
    return Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now();
  }

  private async verifyChallengeResponse(
    record: StoredPublicationRecord,
    verificationUrl: string,
    token: string,
  ): Promise<void> {
    const expectedOrigin = new URL(record.agentCardRef.source_url).origin;
    const expectedBody = `agent_id=${record.agentId}\ntoken=${token}`;

    let currentUrl = verificationUrl;

    for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
      let response: Response;

      try {
        response = await this.fetchImpl(currentUrl, {
          method: "GET",
          redirect: "manual",
          headers: {
            accept: "text/plain",
          },
        });
      } catch (error) {
        throw new HttpError({
          status: 403,
          code: "domain_verification_failed",
          message: "Domain ownership proof could not be verified.",
          retryable: true,
          details: {
            cause: error instanceof Error ? error.message : "unknown",
          },
        });
      }

      if (this.isRedirect(response.status)) {
        const location = response.headers.get("location");

        if (!location) {
          throw HttpError.forbidden(
            "domain_verification_failed",
            "Domain ownership proof could not be verified.",
          );
        }

        const nextUrl = new URL(location, currentUrl);

        if (nextUrl.protocol !== "https:" || nextUrl.origin !== expectedOrigin) {
          throw HttpError.forbidden(
            "domain_verification_failed",
            "Domain ownership proof could not be verified.",
          );
        }

        currentUrl = nextUrl.toString();
        continue;
      }

      if (response.status !== 200) {
        throw HttpError.forbidden(
          "domain_verification_failed",
          "Domain ownership proof could not be verified.",
        );
      }

      const body = await response.text();

      if (body !== expectedBody && body !== `${expectedBody}\n`) {
        throw HttpError.forbidden(
          "domain_verification_failed",
          "Domain ownership proof could not be verified.",
        );
      }

      return;
    }

    throw HttpError.forbidden(
      "domain_verification_failed",
      "Domain ownership proof could not be verified.",
    );
  }

  private isRedirect(status: number): boolean {
    return status >= 300 && status < 400;
  }
}
