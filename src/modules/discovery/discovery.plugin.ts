import { Elysia } from "elysia";

import { createDiscoveryRoutes } from "./discovery.route";
import { DrizzleDiscoveryRepository } from "./discovery.repo";
import { DiscoveryService } from "./discovery.service";

export const createDiscoveryService = () =>
  new DiscoveryService(new DrizzleDiscoveryRepository());

export const createDiscoveryPlugin = (
  service: DiscoveryService = createDiscoveryService(),
) =>
  new Elysia({
    name: "discovery-plugin",
    prefix: "/v1/agents",
  }).use(createDiscoveryRoutes(service));

export const discoveryPlugin = createDiscoveryPlugin();
