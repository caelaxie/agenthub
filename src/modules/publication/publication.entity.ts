import type {
  AgentPublication,
  PublicationStatus,
  PublisherAgentRecord,
} from "../../common/types/api";

export interface PublicationEntity {
  agentId: string;
  namespace: string;
  publication: AgentPublication;
  status: PublicationStatus;
}

export type PublicationAdminView = PublisherAgentRecord;
