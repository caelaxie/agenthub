import type {
  AgentPublication,
  AgentCardRef,
  DomainVerificationChallenge,
  PublicationStatus,
  PublisherAgentRecord,
} from "../../common/types/api";

export interface PublicationEntity {
  agentId: string;
  namespace: string;
  publication: AgentPublication;
  status: PublicationStatus;
}

export interface PublicationSnapshot {
  displayName: string;
  provider?: string;
  skills: string[];
  tags: string[];
  supportedBindings: string[];
  ttlSeconds: number;
  updatedAt: string;
}

export interface StoredPublicationRecord {
  agentId: string;
  namespace: string;
  publication: AgentPublication;
  status: PublicationStatus;
  agentCardRef: AgentCardRef;
  namespaceOwnerSubject: string | null;
  pendingOwnerSubject: string | null;
  challenge?: DomainVerificationChallenge;
  lastValidatedAt: string;
  verifiedAt: string | null;
  lastError: string | null;
}

export interface UpsertPublicationRecord {
  agentId: string;
  namespace: string;
  publication: AgentPublication;
  pendingOwnerSubject: string | null;
  status: "pending_verification";
  agentCardRef: AgentCardRef;
  snapshot: PublicationSnapshot;
  challenge: DomainVerificationChallenge;
}

export type PublicationAdminView = PublisherAgentRecord;
