import {
  DEFAULT_DEV_PUBLISHER_SUBJECT,
  DEFAULT_LOG_LEVEL,
  DEFAULT_PORT,
} from "./constants";

export type NodeEnv = "development" | "test" | "production";

export interface AppEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  LOG_LEVEL: string;
  DATABASE_URL?: string;
  REDIS_URL?: string;
  DEV_PUBLISHER_SUBJECT: string;
  CORS_ORIGIN: string;
}

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
};

const parseNodeEnv = (value: string | undefined): NodeEnv => {
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
};

export const env: AppEnv = {
  NODE_ENV: parseNodeEnv(process.env.NODE_ENV),
  PORT: parsePort(process.env.PORT),
  LOG_LEVEL: process.env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  DEV_PUBLISHER_SUBJECT:
    process.env.DEV_PUBLISHER_SUBJECT ?? DEFAULT_DEV_PUBLISHER_SUBJECT,
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "*",
};
