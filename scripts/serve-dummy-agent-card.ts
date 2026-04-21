import { access } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.join(import.meta.dir, "..");
const DEFAULT_CERT_PATH = path.join(REPO_ROOT, ".certs", "localhost.pem");
const DEFAULT_KEY_PATH = path.join(REPO_ROOT, ".certs", "localhost-key.pem");
const DEFAULT_HOST = "localhost";
const DEFAULT_BIND_HOST = "0.0.0.0";
const DEFAULT_PORT = 8443;

const publicHost = process.env.DUMMY_AGENT_CARD_HOST ?? DEFAULT_HOST;
const bindHost = process.env.DUMMY_AGENT_CARD_BIND_HOST ?? DEFAULT_BIND_HOST;
const port = Number.parseInt(process.env.DUMMY_AGENT_CARD_PORT ?? "", 10) || DEFAULT_PORT;
const certPath = process.env.DUMMY_AGENT_CARD_CERT_PATH ?? DEFAULT_CERT_PATH;
const keyPath = process.env.DUMMY_AGENT_CARD_KEY_PATH ?? DEFAULT_KEY_PATH;

const baseUrl = `https://${publicHost}:${port}`;
const cardPath = "/.well-known/agent-card.json";
const cardUrl = `${baseUrl}${cardPath}`;

const cardPayload = {
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
};

const ensureTlsFiles = async () => {
  try {
    await access(certPath);
    await access(keyPath);
  } catch {
    console.error("Missing TLS certificate or key for the dummy Agent Card server.");
    console.error(`Expected cert: ${certPath}`);
    console.error(`Expected key:  ${keyPath}`);
    console.error("");
    console.error("Generate them with mkcert:");
    console.error("  mkdir -p .certs");
    console.error("  mkcert -install");
    console.error(
      "  mkcert -cert-file .certs/localhost.pem -key-file .certs/localhost-key.pem localhost 127.0.0.1 ::1",
    );
    process.exit(1);
  }
};

await ensureTlsFiles();

const server = Bun.serve({
  hostname: bindHost,
  port,
  tls: {
    cert: Bun.file(certPath),
    key: Bun.file(keyPath),
  },
  fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === cardPath) {
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

    if (pathname === "/") {
      return Response.json({
        card_url: cardUrl,
        supported_paths: [cardPath, "/a2a"],
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Dummy Agent Card server listening on https://${publicHost}:${server.port}`);
console.log(`Agent Card URL: ${cardUrl}`);
