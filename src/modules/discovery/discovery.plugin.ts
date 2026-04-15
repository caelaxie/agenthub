import { Elysia } from "elysia";

import { createDiscoveryRoutes } from "./discovery.route";
import { DrizzleDiscoveryRepository } from "./discovery.repo";
import { DiscoveryService } from "./discovery.service";

const discoveryRepo = new DrizzleDiscoveryRepository();
const discoveryService = new DiscoveryService(discoveryRepo);

export const discoveryPlugin = new Elysia({
  name: "discovery-plugin",
  prefix: "/v1/agents",
}).use(createDiscoveryRoutes(discoveryService));
