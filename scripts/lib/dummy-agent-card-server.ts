export const dummyAgentCardPath = "/.well-known/agent-card.json";
export const dummyVerificationPathPrefix =
  "/.well-known/agenthub-verification/";
export const dummyVerificationAdminPath = "/__admin/verification";

interface DummyAgentCardServerOptions {
  baseUrl: string;
  cardUrl: string;
}

interface VerificationPayload {
  agent_id: string;
  token: string;
}

export const buildVerificationBody = (
  agentId: string,
  token: string,
): string => `agent_id=${agentId}\ntoken=${token}\n`;

const isVerificationPayload = (
  payload: unknown,
): payload is VerificationPayload => {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const value = payload as Record<string, unknown>;

  return (
    typeof value.agent_id === "string" &&
    value.agent_id.trim().length > 0 &&
    typeof value.token === "string" &&
    value.token.trim().length > 0
  );
};

const createCardPayload = (baseUrl: string) => ({
  name: "Local Dummy Agent",
  provider: "AgentHub Manual Testing",
  supportedInterfaces: [
    {
      url: `${baseUrl}/a2a`,
      protocolBinding: "HTTP+JSON",
      protocolVersion: "1.0",
    },
  ],
  skills: [
    {
      id: "manual-test",
      tags: ["Testing", "Local"],
    },
  ],
});

export const createDummyAgentCardFetchHandler = ({
  baseUrl,
  cardUrl,
}: DummyAgentCardServerOptions) => {
  const verificationTokens = new Map<string, string>();
  const cardPayload = createCardPayload(baseUrl);

  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);

    if (pathname === dummyAgentCardPath) {
      return Response.json(cardPayload, {
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    if (pathname === "/a2a") {
      return Response.json({
        ok: true,
        agent: cardPayload.name,
      });
    }

    if (pathname === dummyVerificationAdminPath && request.method === "POST") {
      let payload: unknown;

      try {
        payload = await request.json();
      } catch {
        return Response.json(
          {
            error: "invalid_json",
          },
          { status: 400 },
        );
      }

      if (!isVerificationPayload(payload)) {
        return Response.json(
          {
            error: "invalid_verification_payload",
            expected: {
              agent_id: "acme.travel-planner",
              token: "ahv1_...",
            },
          },
          { status: 400 },
        );
      }

      verificationTokens.set(payload.agent_id, payload.token);

      return Response.json({
        status: "configured",
        agent_id: payload.agent_id,
        verification_url: `${baseUrl}${dummyVerificationPathPrefix}${payload.agent_id}`,
      });
    }

    if (pathname === dummyVerificationAdminPath && request.method === "GET") {
      return Response.json({
        configured_agent_ids: [...verificationTokens.keys()],
      });
    }

    if (pathname.startsWith(dummyVerificationPathPrefix)) {
      const agentId = decodeURIComponent(
        pathname.slice(dummyVerificationPathPrefix.length),
      );
      const token = verificationTokens.get(agentId);

      if (!token) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(buildVerificationBody(agentId, token), {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (pathname === "/") {
      return Response.json({
        card_url: cardUrl,
        supported_paths: [
          dummyAgentCardPath,
          "/a2a",
          `${dummyVerificationPathPrefix}{agent_id}`,
          dummyVerificationAdminPath,
        ],
      });
    }

    return new Response("Not found", { status: 404 });
  };
};
