import { getDb } from "../../lib/db";
import type {
  AgentPublication,
  PublisherAgentRecord,
  PublisherContext,
} from "../../common/types/api";

export interface PublicationRepository {
  getByAgentId(agentId: string): Promise<PublisherAgentRecord | null>;
  upsert(
    agentId: string,
    publication: AgentPublication,
    publisher: PublisherContext,
  ): Promise<void>;
  deactivate(agentId: string, publisher: PublisherContext): Promise<void>;
}

export class DrizzlePublicationRepository implements PublicationRepository {
  async getByAgentId(_agentId: string): Promise<PublisherAgentRecord | null> {
    const db = getDb();
    void db;
    return null;
  }

  async upsert(
    _agentId: string,
    _publication: AgentPublication,
    _publisher: PublisherContext,
  ): Promise<void> {
    const db = getDb();
    void db;
  }

  async deactivate(
    _agentId: string,
    _publisher: PublisherContext,
  ): Promise<void> {
    const db = getDb();
    void db;
  }
}
