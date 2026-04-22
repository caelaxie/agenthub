import { and, eq, sql, type SQL } from "drizzle-orm";

import type {
  AgentIndexRecord,
  Visibility,
} from "../../common/types/api";
import { HttpError } from "../../common/errors/http-error";
import { getDb, publicationsTable, snapshotsTable } from "../../lib/db";

export type DiscoveryAccessScope = "public_only" | "restricted_only" | "all";

export interface DiscoverySearchQuery {
  textTokens: string[];
  skills: string[];
  tags: string[];
  supportedBindings: string[];
  provider?: string;
  visibility?: Visibility;
  pageSize: number;
}

export interface DiscoverySearchCursor {
  score: number;
  agentId: string;
}

export interface DiscoverySearchRequest {
  query: DiscoverySearchQuery;
  scope: DiscoveryAccessScope;
  cursor?: DiscoverySearchCursor | null;
}

export interface DiscoverySearchPage {
  results: AgentIndexRecord[];
  nextCursor: DiscoverySearchCursor | null;
}

export interface DiscoveryRepository {
  getByAgentId(agentId: string): Promise<AgentIndexRecord | null>;
  search(request: DiscoverySearchRequest): Promise<DiscoverySearchPage>;
}

interface DiscoveryCandidate {
  record: AgentIndexRecord;
  score: number;
}

interface DiscoveryRow {
  agentId: string;
  displayName: string;
  provider: string | null;
  sourceUrl: string;
  accessUrl: string;
  accessMode: "public" | "protected";
  lastValidatedAt: Date | null;
  etag: string | null;
  skills: string[];
  tags: string[];
  supportedBindings: string[];
  visibility: Visibility;
  ttlSeconds: number;
  updatedAt: Date;
  status: "active";
  factsRefType: "public_url" | "brokered_url" | null;
  factsRefUrl: string | null;
}

const TOKEN_SPLIT_PATTERN = /[\s\p{P}\p{S}]+/u;

const requireDb = () => {
  const db = getDb();

  if (!db) {
    throw HttpError.internal(
      "database_unavailable",
      "The database is not configured.",
    );
  }

  return db;
};

const toIso = (value: Date | null): string =>
  value?.toISOString() ?? new Date(0).toISOString();

const jsonbContainsAll = (column: SQL<unknown>, values: string[]) =>
  sql`${column} @> ${JSON.stringify(values)}::jsonb`;

export class DrizzleDiscoveryRepository implements DiscoveryRepository {
  async getByAgentId(agentId: string): Promise<AgentIndexRecord | null> {
    const db = requireDb();
    const [row] = await db
      .select({
        agentId: publicationsTable.agentId,
        displayName: snapshotsTable.displayName,
        provider: snapshotsTable.provider,
        sourceUrl: publicationsTable.sourceUrl,
        accessUrl: publicationsTable.accessUrl,
        accessMode: publicationsTable.accessMode,
        lastValidatedAt: publicationsTable.lastValidatedAt,
        etag: publicationsTable.etag,
        skills: snapshotsTable.skills,
        tags: snapshotsTable.tags,
        supportedBindings: snapshotsTable.supportedBindings,
        visibility: publicationsTable.visibility,
        ttlSeconds: snapshotsTable.ttlSeconds,
        updatedAt: snapshotsTable.updatedAt,
        status: publicationsTable.status,
        factsRefType: publicationsTable.factsRefType,
        factsRefUrl: publicationsTable.factsRefUrl,
      })
      .from(publicationsTable)
      .innerJoin(
        snapshotsTable,
        eq(snapshotsTable.agentId, publicationsTable.agentId),
      )
      .where(
        and(
          eq(publicationsTable.agentId, agentId),
          eq(publicationsTable.status, "active"),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return this.toIndexRecord(row as DiscoveryRow);
  }

  async search(request: DiscoverySearchRequest): Promise<DiscoverySearchPage> {
    const db = requireDb();
    const conditions: SQL<unknown>[] = [eq(publicationsTable.status, "active")];

    if (request.scope === "public_only") {
      conditions.push(eq(publicationsTable.visibility, "public"));
    } else if (request.scope === "restricted_only") {
      conditions.push(eq(publicationsTable.visibility, "restricted"));
    }

    if (request.query.visibility) {
      conditions.push(eq(publicationsTable.visibility, request.query.visibility));
    }

    if (request.query.provider) {
      conditions.push(eq(snapshotsTable.provider, request.query.provider));
    }

    if (request.query.skills.length > 0) {
      conditions.push(jsonbContainsAll(snapshotsTable.skills, request.query.skills));
    }

    if (request.query.tags.length > 0) {
      conditions.push(jsonbContainsAll(snapshotsTable.tags, request.query.tags));
    }

    if (request.query.supportedBindings.length > 0) {
      conditions.push(
        jsonbContainsAll(
          snapshotsTable.supportedBindings,
          request.query.supportedBindings,
        ),
      );
    }

    const rows = (await db
      .select({
        agentId: publicationsTable.agentId,
        displayName: snapshotsTable.displayName,
        provider: snapshotsTable.provider,
        sourceUrl: publicationsTable.sourceUrl,
        accessUrl: publicationsTable.accessUrl,
        accessMode: publicationsTable.accessMode,
        lastValidatedAt: publicationsTable.lastValidatedAt,
        etag: publicationsTable.etag,
        skills: snapshotsTable.skills,
        tags: snapshotsTable.tags,
        supportedBindings: snapshotsTable.supportedBindings,
        visibility: publicationsTable.visibility,
        ttlSeconds: snapshotsTable.ttlSeconds,
        updatedAt: snapshotsTable.updatedAt,
        status: publicationsTable.status,
        factsRefType: publicationsTable.factsRefType,
        factsRefUrl: publicationsTable.factsRefUrl,
      })
      .from(publicationsTable)
      .innerJoin(
        snapshotsTable,
        eq(snapshotsTable.agentId, publicationsTable.agentId),
      )
      .where(and(...conditions))) as DiscoveryRow[];

    const ranked = rows
      .map((row) => ({
        record: this.toIndexRecord(row),
        score: this.score(row, request.query.textTokens),
      }))
      .filter(({ score }) =>
        request.query.textTokens.length === 0 ? true : score > 0,
      )
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.record.agent_id.localeCompare(right.record.agent_id);
      });

    const afterCursor = request.cursor
      ? ranked.filter((candidate) => this.isAfterCursor(candidate, request.cursor!))
      : ranked;
    const page = afterCursor.slice(0, request.query.pageSize + 1);
    const hasMore = page.length > request.query.pageSize;
    const results = page.slice(0, request.query.pageSize);

    return {
      results: results.map(({ record }) => record),
      nextCursor:
        hasMore && results.length > 0
          ? {
              score: results[results.length - 1]!.score,
              agentId: results[results.length - 1]!.record.agent_id,
            }
          : null,
    };
  }

  private toIndexRecord(row: DiscoveryRow): AgentIndexRecord {
    return {
      agent_id: row.agentId,
      display_name: row.displayName,
      ...(row.provider ? { provider: row.provider } : {}),
      agent_card_ref: {
        source_url: row.sourceUrl,
        access_url: row.accessUrl,
        access_mode: row.accessMode,
        last_validated_at: toIso(row.lastValidatedAt),
        ...(row.etag ? { etag: row.etag } : {}),
      },
      skills: row.skills,
      tags: row.tags,
      supported_bindings: row.supportedBindings,
      visibility: row.visibility,
      ttl_seconds: row.ttlSeconds,
      updated_at: row.updatedAt.toISOString(),
      status: row.status,
      facts_ref:
        row.factsRefType && row.factsRefUrl
          ? {
              type: row.factsRefType,
              url: row.factsRefUrl,
            }
          : null,
    };
  }

  private score(row: DiscoveryRow, queryTokens: string[]): number {
    if (queryTokens.length === 0) {
      return 0;
    }

    const searchableTokens = new Set<string>();

    for (const value of [row.displayName, ...row.skills, ...row.tags]) {
      for (const token of value.toLowerCase().split(TOKEN_SPLIT_PATTERN)) {
        if (token) {
          searchableTokens.add(token);
        }
      }
    }

    return queryTokens.reduce(
      (total, token) => total + (searchableTokens.has(token) ? 1 : 0),
      0,
    );
  }

  private isAfterCursor(
    candidate: DiscoveryCandidate,
    cursor: DiscoverySearchCursor,
  ): boolean {
    return (
      candidate.score < cursor.score ||
      (candidate.score === cursor.score &&
        candidate.record.agent_id.localeCompare(cursor.agentId) > 0)
    );
  }
}
