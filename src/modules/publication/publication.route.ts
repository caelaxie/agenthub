import { Elysia } from "elysia";

import { buildPublisherContext } from "../../plugins/auth";
import { PublicationService } from "./publication.service";
import {
  deactivateAgentResponseSchema,
  getPublicationResponseSchema,
  publicationErrorResponseSchema,
  publishAgentBodySchema,
  publishAgentParamsSchema,
  publishAgentResponseSchema,
} from "./publication.model";

const publicationResponseSchemas = {
  200: publishAgentResponseSchema,
  201: publishAgentResponseSchema,
  400: publicationErrorResponseSchema,
  401: publicationErrorResponseSchema,
  403: publicationErrorResponseSchema,
  404: publicationErrorResponseSchema,
  409: publicationErrorResponseSchema,
  422: publicationErrorResponseSchema,
  502: publicationErrorResponseSchema,
};

export const createPublicationRoutes = (service: PublicationService) =>
  new Elysia({ name: "publication-routes" })
    .put(
      "/:agentId",
      async ({ params, body, request, set }) => {
        const result = await service.publishAgent(
          params.agentId,
          body,
          buildPublisherContext(request),
        );

        set.status = result.created ? 201 : 200;
        return result.response;
      },
      {
        params: publishAgentParamsSchema,
        body: publishAgentBodySchema,
        response: publicationResponseSchemas,
        detail: {
          summary: "Publish or update an agent",
          tags: ["Publication"],
        },
      },
    )
    .get(
      "/:agentId",
      async ({ params, request }) =>
        service.getPublication(params.agentId, buildPublisherContext(request)),
      {
        params: publishAgentParamsSchema,
        response: {
          200: getPublicationResponseSchema,
          400: publicationErrorResponseSchema,
          401: publicationErrorResponseSchema,
          403: publicationErrorResponseSchema,
          404: publicationErrorResponseSchema,
        },
        detail: {
          summary: "Retrieve owner-only publication state",
          tags: ["Publication"],
        },
      },
    )
    .post(
      "/:agentId/deactivate",
      async ({ params, request }) =>
        service.deactivateAgent(
          params.agentId,
          buildPublisherContext(request),
        ),
      {
        params: publishAgentParamsSchema,
        response: {
          200: deactivateAgentResponseSchema,
          400: publicationErrorResponseSchema,
          401: publicationErrorResponseSchema,
          403: publicationErrorResponseSchema,
          404: publicationErrorResponseSchema,
        },
        detail: {
          summary: "Deactivate a published agent",
          tags: ["Publication"],
        },
      },
    );
