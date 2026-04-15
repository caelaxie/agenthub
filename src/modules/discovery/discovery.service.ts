import { HttpError } from "../../common/errors/http-error";
import type { AgentIndexRecord, SearchEnvelope, SearchResponse } from "../../common/types/api";
import type { DiscoveryRepository } from "./discovery.repo";

export class DiscoveryService {
  constructor(private readonly discoveryRepo: DiscoveryRepository) {}

  async getAgentById(agentId: string): Promise<AgentIndexRecord> {
    void this.discoveryRepo;
    void agentId;

    throw HttpError.notImplemented(
      "discovery_lookup_not_implemented",
      "Exact agent lookup has not been implemented yet.",
    );
  }

  async searchAgents(query: SearchEnvelope): Promise<SearchResponse> {
    void this.discoveryRepo;
    void query;

    throw HttpError.notImplemented(
      "discovery_search_not_implemented",
      "Agent search has not been implemented yet.",
    );
  }
}
