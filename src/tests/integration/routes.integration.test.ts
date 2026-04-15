import { describe, expect, it } from "bun:test";

import { buildApp } from "../../app";

const validPublicationBody = {
  agent_card_url: "https://travel.example.com/.well-known/agent-card.json",
  visibility: "public",
};

describe("route validation and placeholder behavior", () => {
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
    const app = buildApp();
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agent_card_url: "http://travel.example.com/.well-known/agent-card.json",
          visibility: "public",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_request_body");
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

  it("returns typed 501 placeholders for publish routes", async () => {
    const app = buildApp();
    const response = await app.handle(
      new Request("http://localhost/v1/publish/agents/acme.travel-planner", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-publisher-subject": "publisher:test",
        },
        body: JSON.stringify(validPublicationBody),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(501);
    expect(payload.error.code).toBe("publication_publish_not_implemented");
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
