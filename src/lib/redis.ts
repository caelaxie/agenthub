import { env } from "../config/env";

export interface RedisClient {
  readonly isConfigured: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  ping(): Promise<string>;
}

class NoopRedisClient implements RedisClient {
  readonly isConfigured: boolean;

  constructor(isConfigured: boolean) {
    this.isConfigured = isConfigured;
  }

  async get(_key: string): Promise<string | null> {
    return null;
  }

  async set(_key: string, _value: string, _ttlSeconds?: number): Promise<void> {}

  async del(_key: string): Promise<void> {}

  async ping(): Promise<string> {
    return this.isConfigured ? "deferred" : "disabled";
  }
}

const redisClient = new NoopRedisClient(Boolean(env.REDIS_URL));

export const getRedisClient = (): RedisClient => redisClient;
