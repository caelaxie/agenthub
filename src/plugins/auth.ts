import { Elysia } from "elysia";

import { env } from "../config/env";
import type { PublisherContext } from "../common/types/api";

export const buildPublisherContext = (request: Request): PublisherContext => {
  const headerSubject = request.headers.get("x-publisher-subject");
  const authorization = request.headers.get("authorization");

  return {
    subject: headerSubject ?? authorization ?? env.DEV_PUBLISHER_SUBJECT,
    isAuthenticated: Boolean(headerSubject || authorization),
  };
};

export const authPlugin = new Elysia({ name: "auth-plugin" }).derive(
  ({ request }) => ({
    publisher: buildPublisherContext(request),
  }),
);
