import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { Pool } from "pg";

import { env } from "../config/env";

export const visibilityEnum = pgEnum("agent_visibility", [
  "public",
  "restricted",
]);
export const accessModeEnum = pgEnum("agent_access_mode", [
  "public",
  "protected",
]);
export const publicationStatusEnum = pgEnum("publication_status", [
  "pending_verification",
  "active",
  "inactive",
  "invalid",
]);
export const verificationMethodEnum = pgEnum("verification_method", [
  "well_known_token",
]);
export const factsRefTypeEnum = pgEnum("facts_ref_type", [
  "public_url",
  "brokered_url",
]);

export const namespacesTable = pgTable("namespaces", {
  namespace: text("namespace").primaryKey(),
  ownerSubject: text("owner_subject").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const publicationsTable = pgTable(
  "agent_publications",
  {
    agentId: text("agent_id").primaryKey(),
    namespace: text("namespace")
      .notNull()
      .references(() => namespacesTable.namespace),
    sourceUrl: text("source_url").notNull(),
    accessUrl: text("access_url").notNull(),
    accessMode: accessModeEnum("access_mode").notNull(),
    visibility: visibilityEnum("visibility").notNull(),
    status: publicationStatusEnum("status").notNull(),
    factsRefType: factsRefTypeEnum("facts_ref_type"),
    factsRefUrl: text("facts_ref_url"),
    summaryProvider: text("summary_provider"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastError: text("last_error"),
    etag: text("etag"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sourceUrlIdx: uniqueIndex("agent_publications_source_url_idx").on(table.sourceUrl),
  }),
);

export const snapshotsTable = pgTable("agent_snapshots", {
  agentId: text("agent_id")
    .primaryKey()
    .references(() => publicationsTable.agentId),
  displayName: text("display_name").notNull(),
  provider: text("provider"),
  skills: jsonb("skills").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  supportedBindings: jsonb("supported_bindings")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  ttlSeconds: integer("ttl_seconds").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const verificationChallengesTable = pgTable(
  "verification_challenges",
  {
    agentId: text("agent_id")
      .primaryKey()
      .references(() => publicationsTable.agentId),
    method: verificationMethodEnum("method").notNull(),
    url: text("url").notNull(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("verification_challenges_token_idx").on(table.token),
  }),
);

export const schema = {
  namespacesTable,
  publicationsTable,
  snapshotsTable,
  verificationChallengesTable,
};

let pool: Pool | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

export const getDb = () => {
  if (!env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({ connectionString: env.DATABASE_URL });
  }

  if (!database) {
    database = drizzle({ client: pool, schema });
  }

  return database;
};

export const closeDb = async () => {
  if (pool) {
    await pool.end();
  }

  pool = null;
  database = null;
};
