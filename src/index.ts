import { env } from "./config/env";
import { buildApp } from "./app";

const app = buildApp();

app.listen(env.PORT);

console.log(`AgentHub listening on http://localhost:${env.PORT}`);
