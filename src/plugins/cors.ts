import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

import { env } from "../config/env";

const origin = env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN;

export const corsPlugin = new Elysia({ name: "cors-plugin" }).use(
  cors({
    origin,
    credentials: true,
  }),
);
