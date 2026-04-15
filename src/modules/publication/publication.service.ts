import { HttpError } from "../../common/errors/http-error";
import type {
  AgentPublication,
  PublisherContext,
  PublisherAgentRecord,
} from "../../common/types/api";
import type { PublicationRepository } from "./publication.repo";

export class PublicationService {
  constructor(private readonly publicationRepo: PublicationRepository) {}

  async publishAgent(
    agentId: string,
    publication: AgentPublication,
    publisher: PublisherContext,
  ): Promise<never> {
    void this.publicationRepo;
    void agentId;
    void publication;
    void publisher;

    throw HttpError.notImplemented(
      "publication_publish_not_implemented",
      "Publishing agents has not been implemented yet.",
    );
  }

  async getPublication(
    agentId: string,
    publisher: PublisherContext,
  ): Promise<never> {
    void this.publicationRepo;
    void agentId;
    void publisher;

    throw HttpError.notImplemented(
      "publication_get_not_implemented",
      "Publication administration retrieval has not been implemented yet.",
    );
  }

  async deactivateAgent(
    agentId: string,
    publisher: PublisherContext,
  ): Promise<never> {
    void this.publicationRepo;
    void agentId;
    void publisher;

    throw HttpError.notImplemented(
      "publication_deactivate_not_implemented",
      "Deactivating agents has not been implemented yet.",
    );
  }
}
