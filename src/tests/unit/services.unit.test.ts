import { describe, expect, it } from "bun:test";

import { HttpError } from "../../common/errors/http-error";
import { PublicationService } from "../../modules/publication/publication.service";
import { VerificationService } from "../../modules/verification/verification.service";
import { DiscoveryService } from "../../modules/discovery/discovery.service";
import type {
  AgentPublication,
  PublisherContext,
  SearchEnvelope,
  VerifyDomainRequest,
} from "../../common/types/api";

const publisher: PublisherContext = {
  subject: "publisher:test",
  isAuthenticated: true,
};

const publication: AgentPublication = {
  agent_card_url: "https://travel.example.com/.well-known/agent-card.json",
  visibility: "public",
};

const verifyPayload: VerifyDomainRequest = {
  method: "well_known_token",
};

const searchPayload: SearchEnvelope = {
  query: {
    text: "travel",
  },
};

describe("service placeholders", () => {
  it("publication service throws a typed 501", async () => {
    const service = new PublicationService({
      async getByAgentId() {
        return null;
      },
      async upsert() {},
      async deactivate() {},
    });

    await expect(
      service.publishAgent("acme.travel-planner", publication, publisher),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("verification service throws a typed 501", async () => {
    const service = new VerificationService();

    await expect(
      service.verifyDomain("acme.travel-planner", verifyPayload, publisher),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("discovery service throws a typed 501", async () => {
    const service = new DiscoveryService({
      async getByAgentId() {
        return null;
      },
      async search() {
        return {
          results: [],
          next_page_token: null,
        };
      },
    });

    await expect(service.searchAgents(searchPayload)).rejects.toBeInstanceOf(
      HttpError,
    );
  });
});
