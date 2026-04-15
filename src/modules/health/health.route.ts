import { Elysia } from "elysia";

import { APP_NAME, APP_VERSION, HEALTH_PATH } from "../../config/constants";
import { nowIso } from "../../common/utils/time";
import { healthResponseSchema } from "../../common/types/api";

export const healthRoute = new Elysia({ name: "health-route" }).get(
  HEALTH_PATH,
  () => ({
    status: "ok" as const,
    service: APP_NAME,
    version: APP_VERSION,
    timestamp: nowIso(),
  }),
  {
    response: {
      200: healthResponseSchema,
    },
    detail: {
      summary: "Service health",
      tags: ["Health"],
    },
  },
);
