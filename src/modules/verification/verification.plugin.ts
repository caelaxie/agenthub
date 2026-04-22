import { Elysia } from "elysia";

import { createVerificationRoutes } from "./verification.route";
import { VerificationService } from "./verification.service";

export const createVerificationService = () => new VerificationService();

export const createVerificationPlugin = (
  service: VerificationService = createVerificationService(),
) =>
  new Elysia({
    name: "verification-plugin",
    prefix: "/v1/publish/agents",
  }).use(createVerificationRoutes(service));

export const verificationPlugin = createVerificationPlugin();
