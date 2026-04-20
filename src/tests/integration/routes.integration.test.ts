import { beforeEach, describe, expect, it } from "bun:test";

import { buildApp } from "../../app";
import {
  PublicationService,
  type FetchLike,
} from "../../modules/publication/publication.service";
import {
  createJsonFetchResponse,
  createStoredRecord,
  InMemoryPublicationRepository,
  validAgentCard,
  validPublicationBody,
} from "../helpers/publication-test-helpers";

describe("route validation and publication behavior", () => {
  let repo: InMemoryPublicationRepository;
  let fetchStub: FetchLike;

  beforeEach(() => {
    repo = new InMemoryPublicationRepository();
    fetchStub = async () =>
      createJsonFetchResponse(validAgentCard, {
        headers: {
          etag: "\"etag-1\"",
        },
      });
  });

  it("rejects invalid agent ids", async () => {
    const app = buildApp();
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/InvalidId", {
        method: "GET",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_agent_id");
  });

  it("rejects malformed publish bodies", async () => {
    const app = buildApp();
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ visibility: "public" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_request_body");
  });

  it("rejects non-https agent card urls", async () => {
    const app = buildApp({
      publicationService: new PublicationService(repo, fetchStub),
    });
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer publisher-token",
        },
        body: JSON.stringify({
          agent_card_url: "http://travel.example.com/.well-known/agent-card.json",
          visibility: "public",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_agent_card_url");
  });

  it("rejects unsupported verification methods", async () => {
    const app = buildApp();
    const response = await app.handle(
      new Request(
        "http://localhost/v1/publish/agents/acme.travel-planner/verify-domain",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ method: "dns_txt" }),
        },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_request_body");
  });

  it("publishes a valid agent and returns pending_verification", async () => {
    const app = buildApp({
      publicationService: new PublicationService(repo, fetchStub),
    });
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer publisher-token",
        },
        body: JSON.stringify(validPublicationBody),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.status).toBe("pending_verification");
    expect(payload.challenge.url).toBe(
      "https://travel.example.com/.well-known/agenthub-verification/acme.travel-planner",
    );
  });

  it("updates an existing publication on the same origin and returns 200", async () => {
    repo.seed(
      createStoredRecord({
        pendingOwnerSubject: "Bearer publisher-token",
      }),
    );
    const app = buildApp({
      publicationService: new PublicationService(repo, fetchStub),
    });
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer publisher-token",
        },
        body: JSON.stringify(validPublicationBody),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("returns owner-only publication state", async () => {
    repo.seed(
      createStoredRecord({
        pendingOwnerSubject: "Bearer publisher-token",
      }),
    );
    const app = buildApp({
      publicationService: new PublicationService(repo, fetchStub),
    });
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "GET",
        headers: {
          authorization: "Bearer publisher-token",
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.agent_id).toBe("acme.travel-planner");
    expect(payload.ownership.owner_subject).toBe("Bearer publisher-token");
  });

  it("deactivates an owned publication", async () => {
    repo.seed(
      createStoredRecord({
        pendingOwnerSubject: "Bearer publisher-token",
      }),
    );
    const app = buildApp({
      publicationService: new PublicationService(repo, fetchStub),
    });
    const response = await app.handle(
      new Request(
        "http://localhost/v1/publish/agents/acme.travel-planner/deactivate",
        {
          method: "POST",
          headers: {
            authorization: "Bearer publisher-token",
          },
        },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("inactive");
  });

  it("rejects unauthorized admin access with 403", async () => {
    repo.seed(
      createStoredRecord({
        pendingOwnerSubject: "Bearer publisher-token",
      }),
    );
    const app = buildApp({
      publicationService: new PublicationService(repo, fetchStub),
    });
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "GET",
        headers: {
          authorization: "Bearer other-token",
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("publication_forbidden");
  });

  it("rejects publishes into a namespace claimed by another owner", async () => {
    repo.setNamespaceOwner("acme", "publisher:claimed-owner");
    const app = buildApp({
      publicationService: new PublicationService(repo, fetchStub),
    });
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer publisher-token",
        },
        body: JSON.stringify(validPublicationBody),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("namespace_forbidden");
  });

  it("rejects cross-origin republish for an existing agent_id", async () => {
    repo.seed(
      createStoredRecord({
        pendingOwnerSubject: "Bearer publisher-token",
      }),
    );
    const app = buildApp({
      publicationService: new PublicationService(repo, fetchStub),
    });
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer publisher-token",
        },
        body: JSON.stringify({
          ...validPublicationBody,
          agent_card_url: "https://other.example.com/.well-known/agent-card.json",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_request_body");
  });

  it("rejects duplicate active canonical source_url", async () => {
    repo.seed(
      createStoredRecord({
        agentId: "acme.other-agent",
        pendingOwnerSubject: "Bearer other-token",
        status: "active",
      }),
    );
    const app = buildApp({
      publicationService: new PublicationService(repo, fetchStub),
    });
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer publisher-token",
        },
        body: JSON.stringify(validPublicationBody),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("duplicate_publication_conflict");
  });

  it("maps upstream fetch failures to agent_card_fetch_failed", async () => {
    const failingFetch: FetchLike = async () =>
      new Response("upstream unavailable", { status: 503 });
    const app = buildApp({
      publicationService: new PublicationService(repo, failingFetch),
    });
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer publisher-token",
        },
        body: JSON.stringify(validPublicationBody),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error.code).toBe("agent_card_fetch_failed");
  });

  it("maps malformed cards to agent_card_invalid", async () => {
    const invalidFetch: FetchLike = async () =>
      createJsonFetchResponse({
        name: "",
        supportedInterfaces: [],
      });
    const app = buildApp({
      publicationService: new PublicationService(repo, invalidFetch),
    });
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer publisher-token",
        },
        body: JSON.stringify(validPublicationBody),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe("agent_card_invalid");
  });

  it("requires auth on owner-only publication routes", async () => {
    repo.seed(createStoredRecord());
    const app = buildApp({
      publicationService: new PublicationService(repo, fetchStub),
    });
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "GET",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("publisher_auth_required");
  });

  it("returns typed 501 placeholders for discovery routes", async () => {
    const app = buildApp();
    const response = await app.handle(
      new Request("http://localhost/v1/agents/search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: {
            text: "travel",
          },
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(501);
    expect(payload.error.code).toBe("discovery_search_not_implemented");
  });
});
