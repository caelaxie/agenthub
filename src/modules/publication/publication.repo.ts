import { and, eq } from "drizzle-orm";

import { HttpError } from "../../common/errors/http-error";
import {
  getDb,
  namespacesTable,
  publicationsTable,
  snapshotsTable,
  verificationChallengesTable,
} from "../../lib/db";
import type {
  StoredPublicationRecord,
  UpsertPublicationRecord,
} from "./publication.entity";

export interface PublicationRepository {
  getByAgentId(agentId: string): Promise<StoredPublicationRecord | null>;
  getNamespaceOwner(namespace: string): Promise<string | null>;
  findActiveBySourceUrl(sourceUrl: string): Promise<{ agentId: string } | null>;
  upsert(record: UpsertPublicationRecord): Promise<void>;
  completeVerification(
    agentId: string,
    publisherSubject: string,
    verifiedAt: string,
  ): Promise<void>;
  deactivate(agentId: string): Promise<void>;
}

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

const toIso = (value: Date | null): string | null => value?.toISOString() ?? null;

export class DrizzlePublicationRepository implements PublicationRepository {
  async getByAgentId(agentId: string): Promise<StoredPublicationRecord | null> {
    const db = requireDb();
    const [row] = await db
      .select({
        publication: publicationsTable,
        snapshot: snapshotsTable,
        challenge: verificationChallengesTable,
        namespaceOwner: namespacesTable.ownerSubject,
      })
      .from(publicationsTable)
      .leftJoin(
        snapshotsTable,
        eq(snapshotsTable.agentId, publicationsTable.agentId),
      )
      .leftJoin(
        verificationChallengesTable,
        eq(verificationChallengesTable.agentId, publicationsTable.agentId),
      )
      .leftJoin(
        namespacesTable,
        eq(namespacesTable.namespace, publicationsTable.namespace),
      )
      .where(eq(publicationsTable.agentId, agentId))
      .limit(1);

    if (!row) {
      return null;
    }

    const { publication, challenge, namespaceOwner } = row;
    const factsRef =
      publication.factsRefType && publication.factsRefUrl
        ? {
            type: publication.factsRefType,
            url: publication.factsRefUrl,
          }
        : null;

    const summaryOverrides = publication.summaryProvider
      ? { provider: publication.summaryProvider }
      : undefined;

    return {
      agentId: publication.agentId,
      namespace: publication.namespace,
      publication: {
        agent_card_url: publication.sourceUrl,
        visibility: publication.visibility,
        facts_ref: factsRef,
        ...(summaryOverrides ? { summary_overrides: summaryOverrides } : {}),
      },
      status: publication.status,
      agentCardRef: {
        source_url: publication.sourceUrl,
        access_url: publication.accessUrl,
        access_mode: publication.accessMode,
        last_validated_at:
          toIso(publication.lastValidatedAt) ?? new Date(0).toISOString(),
        ...(publication.etag ? { etag: publication.etag } : {}),
      },
      namespaceOwnerSubject: namespaceOwner ?? null,
      pendingOwnerSubject: publication.pendingOwnerSubject,
      challenge: challenge
        ? {
            method: challenge.method,
            url: challenge.url,
            token: challenge.token,
            expires_at: challenge.expiresAt.toISOString(),
          }
        : undefined,
      lastValidatedAt:
        toIso(publication.lastValidatedAt) ?? new Date(0).toISOString(),
      verifiedAt: toIso(publication.verifiedAt),
      lastError: publication.lastError,
    };
  }

  async getNamespaceOwner(namespace: string): Promise<string | null> {
    const db = requireDb();
    const [row] = await db
      .select({ ownerSubject: namespacesTable.ownerSubject })
      .from(namespacesTable)
      .where(eq(namespacesTable.namespace, namespace))
      .limit(1);

    return row?.ownerSubject ?? null;
  }

  async findActiveBySourceUrl(
    sourceUrl: string,
  ): Promise<{ agentId: string } | null> {
    const db = requireDb();
    const [row] = await db
      .select({ agentId: publicationsTable.agentId })
      .from(publicationsTable)
      .where(
        and(
          eq(publicationsTable.sourceUrl, sourceUrl),
          eq(publicationsTable.status, "active"),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async upsert(record: UpsertPublicationRecord): Promise<void> {
    const db = requireDb();
    const timestamp = new Date(record.agentCardRef.last_validated_at);
    const snapshotUpdatedAt = new Date(record.snapshot.updatedAt);
    const challengeExpiresAt = new Date(record.challenge.expires_at);

    await db.transaction(async (tx) => {
      await tx
        .insert(publicationsTable)
        .values({
          agentId: record.agentId,
          namespace: record.namespace,
          pendingOwnerSubject: record.pendingOwnerSubject,
          sourceUrl: record.agentCardRef.source_url,
          accessUrl: record.agentCardRef.access_url,
          accessMode: record.agentCardRef.access_mode,
          visibility: record.publication.visibility,
          status: record.status,
          factsRefType: record.publication.facts_ref?.type,
          factsRefUrl: record.publication.facts_ref?.url,
          summaryProvider: record.publication.summary_overrides?.provider,
          lastValidatedAt: timestamp,
          verifiedAt: null,
          lastError: null,
          etag: record.agentCardRef.etag,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: publicationsTable.agentId,
          set: {
            namespace: record.namespace,
            pendingOwnerSubject: record.pendingOwnerSubject,
            sourceUrl: record.agentCardRef.source_url,
            accessUrl: record.agentCardRef.access_url,
            accessMode: record.agentCardRef.access_mode,
            visibility: record.publication.visibility,
            status: record.status,
            factsRefType: record.publication.facts_ref?.type ?? null,
            factsRefUrl: record.publication.facts_ref?.url ?? null,
            summaryProvider:
              record.publication.summary_overrides?.provider ?? null,
            lastValidatedAt: timestamp,
            verifiedAt: null,
            lastError: null,
            etag: record.agentCardRef.etag ?? null,
            updatedAt: timestamp,
          },
        });

      await tx
        .insert(snapshotsTable)
        .values({
          agentId: record.agentId,
          displayName: record.snapshot.displayName,
          provider: record.snapshot.provider,
          skills: record.snapshot.skills,
          tags: record.snapshot.tags,
          supportedBindings: record.snapshot.supportedBindings,
          ttlSeconds: record.snapshot.ttlSeconds,
          updatedAt: snapshotUpdatedAt,
        })
        .onConflictDoUpdate({
          target: snapshotsTable.agentId,
          set: {
            displayName: record.snapshot.displayName,
            provider: record.snapshot.provider ?? null,
            skills: record.snapshot.skills,
            tags: record.snapshot.tags,
            supportedBindings: record.snapshot.supportedBindings,
            ttlSeconds: record.snapshot.ttlSeconds,
            updatedAt: snapshotUpdatedAt,
          },
        });

      await tx
        .insert(verificationChallengesTable)
        .values({
          agentId: record.agentId,
          method: record.challenge.method,
          url: record.challenge.url,
          token: record.challenge.token,
          expiresAt: challengeExpiresAt,
          refreshedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: verificationChallengesTable.agentId,
          set: {
            method: record.challenge.method,
            url: record.challenge.url,
            token: record.challenge.token,
            expiresAt: challengeExpiresAt,
            refreshedAt: timestamp,
          },
        });
    });
  }

  async completeVerification(
    agentId: string,
    publisherSubject: string,
    verifiedAt: string,
  ): Promise<void> {
    const db = requireDb();
    const verifiedTimestamp = new Date(verifiedAt);

    await db.transaction(async (tx) => {
      const [publication] = await tx
        .select({ namespace: publicationsTable.namespace })
        .from(publicationsTable)
        .where(eq(publicationsTable.agentId, agentId))
        .limit(1);

      if (!publication) {
        throw HttpError.notFound(
          "agent_not_found",
          `No publication found for agent_id '${agentId}'.`,
        );
      }

      await tx
        .insert(namespacesTable)
        .values({
          namespace: publication.namespace,
          ownerSubject: publisherSubject,
        })
        .onConflictDoNothing();

      const [namespaceRow] = await tx
        .select({ ownerSubject: namespacesTable.ownerSubject })
        .from(namespacesTable)
        .where(eq(namespacesTable.namespace, publication.namespace))
        .limit(1);

      if (!namespaceRow || namespaceRow.ownerSubject !== publisherSubject) {
        throw HttpError.forbidden(
          "publication_forbidden",
          "The caller does not own this publication record.",
        );
      }

      await tx
        .update(publicationsTable)
        .set({
          status: "active",
          pendingOwnerSubject: null,
          verifiedAt: verifiedTimestamp,
          lastError: null,
          updatedAt: verifiedTimestamp,
        })
        .where(eq(publicationsTable.agentId, agentId));

      await tx
        .delete(verificationChallengesTable)
        .where(eq(verificationChallengesTable.agentId, agentId));
    });
  }

  async deactivate(agentId: string): Promise<void> {
    const db = requireDb();
    await db
      .update(publicationsTable)
      .set({
        status: "inactive",
        updatedAt: new Date(),
      })
      .where(eq(publicationsTable.agentId, agentId));
  }
}
