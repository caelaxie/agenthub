import { Elysia } from "elysia";

import { AppError } from "./common/errors/app-error";
import { HttpError } from "./common/errors/http-error";
import { errorEnvelopeSchema } from "./common/types/api";
import { authPlugin } from "./plugins/auth";
import { corsPlugin } from "./plugins/cors";
import { docsPlugin } from "./plugins/docs";
import { loggerPlugin } from "./plugins/logger";
import { healthRoute } from "./modules/health/health.route";
import {
  createPublicationPlugin,
} from "./modules/publication/publication.plugin";
import type { PublicationService } from "./modules/publication/publication.service";
import {
  createVerificationPlugin,
} from "./modules/verification/verification.plugin";
import type { VerificationService } from "./modules/verification/verification.service";
import { discoveryPlugin } from "./modules/discovery/discovery.plugin";

const mapUnknownError = (error: unknown) => {
  if (error instanceof AppError) {
    return error;
  }

  return HttpError.internal(
    "internal_server_error",
    "The server encountered an unexpected error.",
  );
};

const readValidationDetails = (error: unknown): Record<string, unknown> => {
  if (!error || typeof error !== "object") {
    return {};
  }

  const direct = error as Record<string, unknown>;
  const directMessage =
    typeof direct.message === "string" ? direct.message : undefined;

  if (directMessage) {
    try {
      const parsed = JSON.parse(directMessage) as unknown;

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      return { cause: directMessage };
    }
  }

  const details: Record<string, unknown> = {};

  for (const key of [
    "type",
    "on",
    "property",
    "message",
    "summary",
    "expected",
    "found",
    "errors",
  ]) {
    const value = direct[key];

    if (value !== undefined) {
      details[key] = value;
    }
  }

  return details;
};

export interface AppDependencies {
  publicationService?: PublicationService;
  verificationService?: VerificationService;
}

export const buildApp = (dependencies: AppDependencies = {}) =>
  new Elysia()
    .model({
      ErrorEnvelope: errorEnvelopeSchema,
    })
    .use(loggerPlugin)
    .use(corsPlugin)
    .use(docsPlugin)
    .use(authPlugin)
    .use(healthRoute)
    .use(createPublicationPlugin(dependencies.publicationService))
    .use(createVerificationPlugin(dependencies.verificationService))
    .use(discoveryPlugin)
    .onError(({ code, error, set }) => {
      if (code === "VALIDATION") {
        const validationDetails = readValidationDetails(error);
        const isAgentIdError =
          validationDetails.on === "params" &&
          validationDetails.property === "/agentId";
        const validationError = HttpError.badRequest(
          isAgentIdError ? "invalid_agent_id" : "invalid_request_body",
          isAgentIdError
            ? "The provided agent_id is invalid."
            : "The request failed validation.",
          validationDetails,
        );

        set.status = validationError.status;
        return validationError.toResponse();
      }

      const appError = mapUnknownError(error);
      set.status = appError.status;
      return appError.toResponse();
    });
