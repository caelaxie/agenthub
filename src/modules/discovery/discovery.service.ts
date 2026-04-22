import type { PublisherContext, SearchEnvelope, SearchResponse } from "../../common/types/api";
import { HttpError } from "../../common/errors/http-error";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../config/constants";
import type {
  DiscoveryAccessScope,
  DiscoveryRepository,
  DiscoverySearchCursor,
  DiscoverySearchQuery,
} from "./discovery.repo";

interface CanonicalSearchQuery extends DiscoverySearchQuery {
  pageToken: string | null;
}

interface DiscoveryPageTokenPayload {
  queryKey: string;
  scope: DiscoveryAccessScope;
  position: DiscoverySearchCursor;
}

const TOKEN_SPLIT_PATTERN = /[\s\p{P}\p{S}]+/u;

export class DiscoveryService {
  constructor(private readonly discoveryRepo: DiscoveryRepository) {}

  async getAgentById(agentId: string, caller: PublisherContext) {
    const record = await this.discoveryRepo.getByAgentId(agentId);

    if (!record) {
      throw HttpError.notFound(
        "agent_not_found",
        `No active discoverable entry found for agent_id '${agentId}'.`,
      );
    }

    if (record.visibility === "restricted" && !caller.isAuthenticated) {
      throw HttpError.forbidden(
        "restricted_entry_forbidden",
        "The caller is not authorized to view this restricted entry.",
      );
    }

    return record;
  }

  async searchAgents(
    payload: SearchEnvelope,
    caller: PublisherContext,
  ): Promise<SearchResponse> {
    const query = this.canonicalizeQuery(payload);
    const scope = this.resolveScope(query, caller);
    const queryKey = this.serializeQueryKey(query);
    const pageToken = this.decodePageToken(query.pageToken);

    if (pageToken && (pageToken.queryKey !== queryKey || pageToken.scope !== scope)) {
      throw HttpError.badRequest(
        "invalid_page_token",
        "The page token is invalid for this query or caller scope.",
      );
    }

    const page = await this.discoveryRepo.search({
      query,
      scope,
      cursor: pageToken?.position ?? null,
    });

    return {
      results: page.results,
      next_page_token: page.nextCursor
        ? this.encodePageToken({
            queryKey,
            scope,
            position: page.nextCursor,
          })
        : null,
    };
  }

  private canonicalizeQuery(payload: SearchEnvelope): CanonicalSearchQuery {
    const query = payload.query;
    const pageSize =
      typeof query.page_size === "number"
        ? Math.max(1, Math.min(MAX_PAGE_SIZE, query.page_size))
        : DEFAULT_PAGE_SIZE;
    const pageToken =
      typeof query.page_token === "string" ? query.page_token : null;
    const provider = query.provider?.trim() || undefined;
    const visibility = query.visibility;

    return {
      textTokens: this.normalizeDistinct(query.text, (value) =>
        this.tokenizeText(value),
      ),
      skills: this.normalizeDistinct(query.skills, (value) =>
        this.normalizeSkillIdentifier(value),
      ),
      tags: this.normalizeDistinct(query.tags, (value) =>
        this.normalizeTag(value),
      ),
      supportedBindings: this.normalizeDistinct(query.supported_bindings, (value) => {
        const trimmed = value.trim();
        return trimmed || null;
      }),
      ...(provider ? { provider } : {}),
      ...(visibility ? { visibility } : {}),
      pageSize,
      pageToken,
    };
  }

  private resolveScope(
    query: CanonicalSearchQuery,
    caller: PublisherContext,
  ): DiscoveryAccessScope {
    if (query.visibility === "restricted") {
      if (!caller.isAuthenticated) {
        throw HttpError.unauthorized(
          "restricted_search_requires_auth",
          "Authentication is required to search restricted entries.",
        );
      }

      return "restricted_only";
    }

    if (query.visibility === "public") {
      return "public_only";
    }

    return caller.isAuthenticated ? "all" : "public_only";
  }

  private serializeQueryKey(query: CanonicalSearchQuery): string {
    return JSON.stringify({
      textTokens: query.textTokens,
      skills: query.skills,
      tags: query.tags,
      supportedBindings: query.supportedBindings,
      provider: query.provider ?? null,
      visibility: query.visibility ?? null,
      pageSize: query.pageSize,
    });
  }

  private encodePageToken(payload: DiscoveryPageTokenPayload): string {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  }

  private decodePageToken(token: string | null): DiscoveryPageTokenPayload | null {
    if (token === null) {
      return null;
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(token, "base64url").toString("utf8"),
      ) as Partial<DiscoveryPageTokenPayload>;

      if (
        !decoded ||
        typeof decoded.queryKey !== "string" ||
        !this.isAccessScope(decoded.scope) ||
        !this.isCursor(decoded.position)
      ) {
        throw new Error("invalid");
      }

      return decoded as DiscoveryPageTokenPayload;
    } catch {
      throw HttpError.badRequest(
        "invalid_page_token",
        "The page token is invalid for this query or caller scope.",
      );
    }
  }

  private isAccessScope(value: unknown): value is DiscoveryAccessScope {
    return value === "public_only" || value === "restricted_only" || value === "all";
  }

  private isCursor(value: unknown): value is DiscoverySearchCursor {
    if (!value || typeof value !== "object") {
      return false;
    }

    const cursor = value as Record<string, unknown>;
    return (
      typeof cursor.score === "number" &&
      Number.isFinite(cursor.score) &&
      typeof cursor.agentId === "string" &&
      cursor.agentId.length > 0
    );
  }

  private normalizeDistinct(
    values: string[] | string | undefined,
    normalize: (value: string) => string[] | string | null,
  ): string[] {
    const items = Array.isArray(values)
      ? values
      : typeof values === "string"
        ? [values]
        : [];

    const normalized = new Set<string>();

    for (const value of items) {
      const next = normalize(value);

      if (Array.isArray(next)) {
        for (const entry of next) {
          if (entry) {
            normalized.add(entry);
          }
        }
        continue;
      }

      if (next) {
        normalized.add(next);
      }
    }

    return [...normalized].sort((left, right) => left.localeCompare(right));
  }

  private tokenizeText(value: string): string[] {
    return value
      .trim()
      .toLowerCase()
      .split(TOKEN_SPLIT_PATTERN)
      .filter((token) => token.length > 0);
  }

  private normalizeSkillIdentifier(value: string): string | null {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return normalized || null;
  }

  private normalizeTag(value: string): string | null {
    const normalized = value.trim().toLowerCase();
    return normalized || null;
  }
}
