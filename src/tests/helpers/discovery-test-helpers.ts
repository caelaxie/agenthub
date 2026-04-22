import type { AgentIndexRecord, Visibility } from "../../common/types/api";
import type {
  DiscoveryRepository,
  DiscoverySearchRequest,
  DiscoverySearchPage,
} from "../../modules/discovery/discovery.repo";

export const createDiscoveryRecord = (
  overrides: Partial<AgentIndexRecord> = {},
): AgentIndexRecord => {
  const agentId = overrides.agent_id ?? "acme.travel-planner";
  const visibility = overrides.visibility ?? "public";
  const sourceUrl =
    overrides.agent_card_ref?.source_url ??
    `https://${agentId.replaceAll(".", "-")}.example.com/.well-known/agent-card.json`;
  const accessUrl =
    overrides.agent_card_ref?.access_url ??
    (visibility === "public"
      ? sourceUrl
      : `https://registry.example.com/protected/cards/${agentId}`);

  return {
    agent_id: agentId,
    display_name: "Acme Travel Planner",
    provider: "Acme Travel Systems",
    agent_card_ref: {
      source_url: sourceUrl,
      access_url: accessUrl,
      access_mode: visibility === "public" ? "public" : "protected",
      last_validated_at: "2026-04-14T10:00:00.000Z",
      etag: "\"etag-1\"",
      ...overrides.agent_card_ref,
    },
    skills: ["flight-search", "itinerary-builder"],
    tags: ["booking", "travel"],
    supported_bindings: ["HTTP+JSON", "JSONRPC"],
    visibility,
    ttl_seconds: 300,
    updated_at: "2026-04-14T10:00:00.000Z",
    status: "active",
    facts_ref: null,
    ...overrides,
  };
};

export class InMemoryDiscoveryRepository implements DiscoveryRepository {
  constructor(private readonly records: AgentIndexRecord[] = []) {}

  async getByAgentId(agentId: string): Promise<AgentIndexRecord | null> {
    return (
      this.records.find(
        (record) => record.agent_id === agentId && record.status === "active",
      ) ?? null
    );
  }

  async search(request: DiscoverySearchRequest): Promise<DiscoverySearchPage> {
    const ranked = this.records
      .filter((record) => record.status === "active")
      .filter((record) => this.matchesScope(record.visibility, request.scope))
      .filter((record) =>
        request.query.visibility ? record.visibility === request.query.visibility : true,
      )
      .filter((record) =>
        request.query.provider ? record.provider === request.query.provider : true,
      )
      .filter((record) =>
        request.query.skills.every((skill) => record.skills.includes(skill)),
      )
      .filter((record) =>
        request.query.tags.every((tag) => record.tags.includes(tag)),
      )
      .filter((record) =>
        request.query.supportedBindings.every((binding) =>
          record.supported_bindings.includes(binding),
        ),
      )
      .map((record) => ({
        record,
        score: this.score(record, request.query.textTokens),
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
      ? ranked.filter(
          ({ record, score }) =>
            score < request.cursor!.score ||
            (score === request.cursor!.score &&
              record.agent_id.localeCompare(request.cursor!.agentId) > 0),
        )
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

  private matchesScope(visibility: Visibility, scope: DiscoverySearchRequest["scope"]) {
    if (scope === "all") {
      return true;
    }

    if (scope === "public_only") {
      return visibility === "public";
    }

    return visibility === "restricted";
  }

  private score(record: AgentIndexRecord, queryTokens: string[]): number {
    if (queryTokens.length === 0) {
      return 0;
    }

    const searchableTokens = new Set(
      [record.display_name, ...record.skills, ...record.tags]
        .flatMap((value) => value.toLowerCase().split(/[\s\p{P}\p{S}]+/u))
        .filter((token) => token.length > 0),
    );

    return queryTokens.reduce(
      (total, token) => total + (searchableTokens.has(token) ? 1 : 0),
      0,
    );
  }
}
