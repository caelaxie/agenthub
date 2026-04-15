import { Elysia } from "elysia";

import { createPublicationRoutes } from "./publication.route";
import { DrizzlePublicationRepository } from "./publication.repo";
import { PublicationService } from "./publication.service";

const publicationRepo = new DrizzlePublicationRepository();
const publicationService = new PublicationService(publicationRepo);

export const publicationPlugin = new Elysia({
  name: "publication-plugin",
  prefix: "/v1/publish/agents",
}).use(createPublicationRoutes(publicationService));
