import { Elysia } from "elysia";

import { buildPublisherContext } from "../../plugins/auth";
import { VerificationService } from "./verification.service";
import {
  verificationErrorResponseSchema,
  verifyDomainBodySchema,
  verifyDomainParamsSchema,
  verifyDomainSuccessSchema,
} from "./verification.model";

export const createVerificationRoutes = (service: VerificationService) =>
  new Elysia({ name: "verification-routes" }).post(
    "/:agentId/verify-domain",
    async ({ params, body, request }) =>
      service.verifyDomain(
        params.agentId,
        body,
        buildPublisherContext(request),
      ),
    {
      params: verifyDomainParamsSchema,
      body: verifyDomainBodySchema,
      response: {
        200: verifyDomainSuccessSchema,
        400: verificationErrorResponseSchema,
        401: verificationErrorResponseSchema,
        403: verificationErrorResponseSchema,
        404: verificationErrorResponseSchema,
        409: verificationErrorResponseSchema,
      },
      detail: {
        summary: "Verify domain ownership for a pending publication",
        tags: ["Verification"],
      },
    },
  );
