import { Elysia } from "elysia";

import { env } from "../config/env";

const shouldLog = env.NODE_ENV !== "test";

export const loggerPlugin = new Elysia({ name: "logger-plugin" })
  .onRequest(({ request }) => {
    if (!shouldLog) {
      return;
    }

    console.log(`[request] ${request.method} ${new URL(request.url).pathname}`);
  })
  .onAfterHandle(({ request, set }) => {
    if (!shouldLog) {
      return;
    }

    console.log(
      `[response] ${request.method} ${new URL(request.url).pathname} ${set.status}`,
    );
  })
  .onError(({ request, error }) => {
    if (!shouldLog) {
      return;
    }

    console.error(
      `[error] ${request.method} ${new URL(request.url).pathname}`,
      error,
    );
  });
