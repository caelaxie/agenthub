import { Elysia } from "elysia";

import { DiscoveryService } from "./discovery.service";
import {
  discoveryErrorResponseSchema,
  discoveryParamsSchema,
  getAgentResponseSchema,
  searchAgentsBodySchema,
  searchAgentsResponseSchema,
} from "./discovery.model";

export const createDiscoveryRoutes = (service: DiscoveryService) =>
  new Elysia({ name: "discovery-routes" })
    .get(
      "/:agentId",
      async ({ params }) => service.getAgentById(params.agentId),
      {
        params: discoveryParamsSchema,
        response: {
          200: getAgentResponseSchema,
          400: discoveryErrorResponseSchema,
          403: discoveryErrorResponseSchema,
          404: discoveryErrorResponseSchema,
          501: discoveryErrorResponseSchema,
        },
        detail: {
          summary: "Lookup a discoverable agent by id",
          tags: ["Discovery"],
        },
      },
    )
    .post(
      "/search",
      async ({ body }) => service.searchAgents(body),
      {
        body: searchAgentsBodySchema,
        response: {
          200: searchAgentsResponseSchema,
          400: discoveryErrorResponseSchema,
          401: discoveryErrorResponseSchema,
          501: discoveryErrorResponseSchema,
        },
        detail: {
          summary: "Search discoverable agents",
          tags: ["Discovery"],
        },
      },
    );
