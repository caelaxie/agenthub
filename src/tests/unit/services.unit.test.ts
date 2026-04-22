import { beforeEach, describe, expect, it } from "bun:test";

import { HttpError } from "../../common/errors/http-error";
import {
  PublicationService,
  type FetchLike,
} from "../../modules/publication/publication.service";
import { VerificationService } from "../../modules/verification/verification.service";
import { DiscoveryService } from "../../modules/discovery/discovery.service";
import type { SearchEnvelope, VerifyDomainRequest } from "../../common/types/api";
import {
  createJsonFetchResponse,
  createTextFetchResponse,
  createStoredRecord,
  InMemoryPublicationRepository,
  testPublisher,
  validAgentCard,
  validPublicationBody,
} from "../helpers/publication-test-helpers";

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
      testPublisher,
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
      service.getPublication("acme.travel-planner", testPublisher),
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

  it("keeps discovery service as a typed placeholder", async () => {
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

    await expect(discoveryService.searchAgents(searchPayload)).rejects.toBeInstanceOf(
      HttpError,
    );
  });
});

describe("verification service", () => {
  let repo: InMemoryPublicationRepository;

  beforeEach(() => {
    repo = new InMemoryPublicationRepository();
  });

  it("activates a pending record after exact same-origin proof and claims the namespace", async () => {
    repo.seed(createStoredRecord());
    const service = new VerificationService(
      repo,
      async () =>
        createTextFetchResponse(
          "agent_id=acme.travel-planner\ntoken=ahv1_testtoken",
        ),
    );

    const result = await service.verifyDomain(
      "acme.travel-planner",
      verifyPayload,
      testPublisher,
    );

    expect(result.status).toBe("active");
    expect(result.verified_at).toBeString();

    const stored = await repo.getByAgentId("acme.travel-planner");
    expect(stored?.status).toBe("active");
    expect(stored?.namespaceOwnerSubject).toBe("publisher:test");
    expect(stored?.pendingOwnerSubject).toBeNull();
    expect(stored?.challenge).toBeUndefined();
    expect(stored?.verifiedAt).toBeString();
  });

  it("rejects expired challenges", async () => {
    repo.seed(
      createStoredRecord({
        challenge: {
          method: "well_known_token",
          url: "https://travel.example.com/.well-known/agenthub-verification/acme.travel-planner",
          token: "ahv1_testtoken",
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        },
      }),
    );
    const service = new VerificationService(repo, async () =>
      createTextFetchResponse("unexpected"),
    );

    await expect(
      service.verifyDomain(
        "acme.travel-planner",
        verifyPayload,
        testPublisher,
      ),
    ).rejects.toMatchObject({
      code: "verification_challenge_expired",
      status: 409,
    });
  });

  it("rejects wrong verification bodies", async () => {
    repo.seed(createStoredRecord());
    const service = new VerificationService(repo, async () =>
      createTextFetchResponse("agent_id=acme.travel-planner\ntoken=wrong"),
    );

    await expect(
      service.verifyDomain(
        "acme.travel-planner",
        verifyPayload,
        testPublisher,
      ),
    ).rejects.toMatchObject({
      code: "domain_verification_failed",
      status: 403,
    });
  });

  it("rejects missing verification files", async () => {
    repo.seed(createStoredRecord());
    const service = new VerificationService(
      repo,
      async () => new Response("not found", { status: 404 }),
    );

    await expect(
      service.verifyDomain(
        "acme.travel-planner",
        verifyPayload,
        testPublisher,
      ),
    ).rejects.toMatchObject({
      code: "domain_verification_failed",
      status: 403,
    });
  });

  it("rejects redirects that change origin", async () => {
    repo.seed(createStoredRecord());
    const service = new VerificationService(
      repo,
      async () =>
        new Response(null, {
          status: 302,
          headers: {
            location:
              "https://other.example.com/.well-known/agenthub-verification/acme.travel-planner",
          },
        }),
    );

    await expect(
      service.verifyDomain(
        "acme.travel-planner",
        verifyPayload,
        testPublisher,
      ),
    ).rejects.toMatchObject({
      code: "domain_verification_failed",
      status: 403,
    });
  });

  it("rejects later verification attempts by a different subject", async () => {
    repo.seed(
      createStoredRecord({
        namespaceOwnerSubject: "publisher:claimed-owner",
        pendingOwnerSubject: null,
      }),
    );
    const service = new VerificationService(
      repo,
      async () =>
        createTextFetchResponse(
          "agent_id=acme.travel-planner\ntoken=ahv1_testtoken",
        ),
    );

    await expect(
      service.verifyDomain(
        "acme.travel-planner",
        verifyPayload,
        testPublisher,
      ),
    ).rejects.toMatchObject({
      code: "publication_forbidden",
      status: 403,
    });
  });

  it("keeps discovery service as a typed placeholder", async () => {
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
