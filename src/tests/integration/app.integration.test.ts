import { describe, expect, it } from "bun:test";

import { buildApp } from "../../app";

describe("app integration", () => {
  it("returns service health", async () => {
    const app = buildApp();
    const response = await app.handle(new Request("http://localhost/health"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
  });

  it("exposes openapi json", async () => {
    const app = buildApp();
    const response = await app.handle(
      new Request("http://localhost/docs/openapi.json"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.paths["/v1/publish/agents/{agentId}"]).toBeDefined();
    expect(payload.paths["/v1/agents/search"]).toBeDefined();
  });
});
