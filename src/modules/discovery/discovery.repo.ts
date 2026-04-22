import { getDb } from "../../lib/db";
import type {
  AgentIndexRecord,
  SearchEnvelope,
  SearchResponse,
} from "../../common/types/api";

export interface DiscoveryRepository {
  getByAgentId(agentId: string): Promise<AgentIndexRecord | null>;
  search(query: SearchEnvelope): Promise<SearchResponse>;
}

export class DrizzleDiscoveryRepository implements DiscoveryRepository {
  async getByAgentId(_agentId: string): Promise<AgentIndexRecord | null> {
    const db = getDb();
    void db;
    return null;
  }

  async search(_query: SearchEnvelope): Promise<SearchResponse> {
    const db = getDb();
    void db;
    return {
      results: [],
      next_page_token: null,
    };
  }
}
