import { Elysia } from "elysia";

import { AppError } from "./common/errors/app-error";
import { HttpError } from "./common/errors/http-error";
import { errorEnvelopeSchema } from "./common/types/api";
import { authPlugin } from "./plugins/auth";
import { corsPlugin } from "./plugins/cors";
import { docsPlugin } from "./plugins/docs";
import { loggerPlugin } from "./plugins/logger";
import { healthRoute } from "./modules/health/health.route";
import { publicationPlugin } from "./modules/publication/publication.plugin";
import { verificationPlugin } from "./modules/verification/verification.plugin";
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

const readValidationContext = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return null;
  }

  const direct = error as {
    on?: string;
    property?: string;
    message?: string;
  };

  if (direct.on || direct.property) {
    return direct;
  }

  if (!direct.message) {
    return null;
  }

  try {
    const parsed = JSON.parse(direct.message) as {
      on?: string;
      property?: string;
    };

    return parsed;
  } catch {
    return null;
  }
};

export const buildApp = () =>
  new Elysia()
    .model({
      ErrorEnvelope: errorEnvelopeSchema,
    })
    .use(loggerPlugin)
    .use(corsPlugin)
    .use(docsPlugin)
    .use(authPlugin)
    .use(healthRoute)
    .use(publicationPlugin)
    .use(verificationPlugin)
    .use(discoveryPlugin)
    .onError(({ code, error, set }) => {
      if (code === "VALIDATION") {
        const validationErrorContext = readValidationContext(error);
        const isAgentIdError =
          validationErrorContext?.on === "params" &&
          validationErrorContext?.property === "/agentId";
        const validationError = HttpError.badRequest(
          isAgentIdError ? "invalid_agent_id" : "invalid_request_body",
          isAgentIdError
            ? "The provided agent_id is invalid."
            : "The request failed validation.",
          { cause: error.message },
        );

        set.status = validationError.status;
        return validationError.toResponse();
      }

      const appError = mapUnknownError(error);
      set.status = appError.status;
      return appError.toResponse();
    });
