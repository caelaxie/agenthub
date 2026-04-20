ALTER TABLE "agent_publications" DROP CONSTRAINT "agent_publications_namespace_namespaces_namespace_fk";
--> statement-breakpoint
DROP INDEX "agent_publications_source_url_idx";--> statement-breakpoint
ALTER TABLE "agent_publications" ADD COLUMN "pending_owner_subject" text;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_publications_source_url_active_idx" ON "agent_publications" USING btree ("source_url") WHERE "agent_publications"."status" = 'active';