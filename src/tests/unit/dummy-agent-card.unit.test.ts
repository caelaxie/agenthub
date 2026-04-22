import { describe, expect, it } from "bun:test";

import {
  buildVerificationBody,
  createDummyAgentCardFetchHandler,
  dummyVerificationAdminPath,
  dummyVerificationPathPrefix,
} from "../../../scripts/lib/dummy-agent-card-server";

describe("dummy agent card server handler", () => {
  const baseUrl = "https://localhost:8443";
  const handler = createDummyAgentCardFetchHandler({
    baseUrl,
    cardUrl: `${baseUrl}/.well-known/agent-card.json`,
  });

  it("serves the dummy agent card", async () => {
    const response = await handler(
      new Request(`${baseUrl}/.well-known/agent-card.json`),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.name).toBe("Local Dummy Agent");
  });

  it("configures and serves verification bodies", async () => {
    const configureResponse = await handler(
      new Request(`${baseUrl}${dummyVerificationAdminPath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agent_id: "acme.travel-planner",
          token: "ahv1_testtoken",
        }),
      }),
    );

    expect(configureResponse.status).toBe(200);

    const verificationResponse = await handler(
      new Request(
        `${baseUrl}${dummyVerificationPathPrefix}acme.travel-planner`,
      ),
    );

    expect(verificationResponse.status).toBe(200);
    expect(await verificationResponse.text()).toBe(
      buildVerificationBody("acme.travel-planner", "ahv1_testtoken"),
    );
  });

  it("rejects invalid verification configuration payloads", async () => {
    const response = await handler(
      new Request(`${baseUrl}${dummyVerificationAdminPath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agent_id: "",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
