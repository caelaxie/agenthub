import { beforeEach, describe, expect, it } from "bun:test";

import { HttpError } from "../../common/errors/http-error";
import {
  PublicationService,
  type FetchLike,
} from "../../modules/publication/publication.service";
import { VerificationService } from "../../modules/verification/verification.service";
import { DiscoveryService } from "../../modules/discovery/discovery.service";
import type { PublisherContext, SearchEnvelope, VerifyDomainRequest } from "../../common/types/api";
import {
  createJsonFetchResponse,
  createStoredRecord,
  InMemoryPublicationRepository,
  validAgentCard,
  validPublicationBody,
} from "../helpers/publication-test-helpers";

const publisher: PublisherContext = {
  subject: "publisher:test",
  isAuthenticated: true,
};

const verifyPayload: VerifyDomainRequest = {
  method: "well_known_token",
};

const searchPayload: SearchEnvelope = {
  query: {
    text: "travel",
  },
};

describe("publication service", () => {
  let repo: InMemoryPublicationRepository;
  let fetchStub: FetchLike;

  beforeEach(() => {
    repo = new InMemoryPublicationRepository();
    fetchStub = async () => createJsonFetchResponse(validAgentCard);
  });

  it("publishes a valid card into pending_verification and normalizes the snapshot", async () => {
    const service = new PublicationService(repo, fetchStub);

    const result = await service.publishAgent(
      "acme.travel-planner",
      validPublicationBody,
      publisher,
    );

    expect(result.created).toBe(true);
    expect(result.response.status).toBe("pending_verification");
    expect(result.response.challenge?.url).toBe(
      "https://travel.example.com/.well-known/agenthub-verification/acme.travel-planner",
    );

    const stored = await repo.getByAgentId("acme.travel-planner");
    expect(stored?.pendingOwnerSubject).toBe("publisher:test");
    expect(stored?.publication.agent_card_url).toBe(
      validPublicationBody.agent_card_url,
    );
  });

  it("prefers namespace owner authorization once a namespace is claimed", async () => {
    const record = createStoredRecord({
      namespaceOwnerSubject: "publisher:claimed-owner",
      pendingOwnerSubject: null,
    });
    repo.seed(record);

    const service = new PublicationService(repo, fetchStub);

    await expect(
      service.getPublication("acme.travel-planner", publisher),
    ).rejects.toMatchObject({
      code: "publication_forbidden",
      status: 403,
    });

    const publication = await service.getPublication("acme.travel-planner", {
      subject: "publisher:claimed-owner",
      isAuthenticated: true,
    });

    expect(publication.ownership.owner_subject).toBe("publisher:claimed-owner");
  });

  it("rejects unauthenticated publish attempts", async () => {
    const service = new PublicationService(repo, fetchStub);

    await expect(
      service.publishAgent("acme.travel-planner", validPublicationBody, {
        subject: "publisher:test",
        isAuthenticated: false,
      }),
    ).rejects.toMatchObject({
      code: "publisher_auth_required",
      status: 401,
    });
  });

  it("keeps verification and discovery services as typed placeholders", async () => {
    const verificationService = new VerificationService();
    const discoveryService = new DiscoveryService({
      async getByAgentId() {
        return null;
      },
      async search() {
        return {
          results: [],
          next_page_token: null,
        };
      },
    });

    await expect(
      verificationService.verifyDomain(
        "acme.travel-planner",
        verifyPayload,
        publisher,
      ),
    ).rejects.toBeInstanceOf(HttpError);

    await expect(discoveryService.searchAgents(searchPayload)).rejects.toBeInstanceOf(
      HttpError,
    );
  });
});

describe("remaining service placeholders", () => {
  it("verification service throws a typed 501", async () => {
    const service = new VerificationService();

    await expect(
      service.verifyDomain("acme.travel-planner", verifyPayload, publisher),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("discovery service throws a typed 501", async () => {
    const service = new DiscoveryService({
      async getByAgentId() {
        return null;
      },
      async search() {
        return {
          results: [],
          next_page_token: null,
        };
      },
    });

    await expect(service.searchAgents(searchPayload)).rejects.toBeInstanceOf(
      HttpError,
    );
  });
});
