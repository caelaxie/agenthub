import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";

import {
  APP_NAME,
  APP_VERSION,
  DOCS_JSON_PATH,
  DOCS_PATH,
} from "../config/constants";

export const docsPlugin = new Elysia({ name: "docs-plugin" }).use(
  openapi({
    path: DOCS_PATH,
    specPath: DOCS_JSON_PATH,
    provider: "scalar",
    documentation: {
      info: {
        title: `${APP_NAME} API`,
        version: APP_VERSION,
        description: "Architecture-first scaffold for the AgentHub registry API.",
      },
      tags: [
        { name: "Health", description: "Service health and readiness routes." },
        {
          name: "Publication",
          description: "Publisher write and administrative routes.",
        },
        {
          name: "Verification",
          description: "Domain verification routes for pending publications.",
        },
        {
          name: "Discovery",
          description: "Public lookup and search routes.",
        },
      ],
    },
  }),
);
