import { Elysia } from "elysia";

import { createPublicationRoutes } from "./publication.route";
import { DrizzlePublicationRepository } from "./publication.repo";
import { PublicationService } from "./publication.service";

export const createPublicationService = () =>
  new PublicationService(new DrizzlePublicationRepository());

export const createPublicationPlugin = (
  service: PublicationService = createPublicationService(),
) =>
  new Elysia({
    name: "publication-plugin",
    prefix: "/v1/publish/agents",
  }).use(createPublicationRoutes(service));

export const publicationPlugin = createPublicationPlugin();
