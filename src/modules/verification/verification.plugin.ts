import { Elysia } from "elysia";

import { createVerificationRoutes } from "./verification.route";
import { VerificationService } from "./verification.service";

const verificationService = new VerificationService();

export const verificationPlugin = new Elysia({
  name: "verification-plugin",
  prefix: "/v1/publish/agents",
}).use(createVerificationRoutes(verificationService));
