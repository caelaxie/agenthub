CREATE TYPE "public"."agent_access_mode" AS ENUM('public', 'protected');--> statement-breakpoint
CREATE TYPE "public"."facts_ref_type" AS ENUM('public_url', 'brokered_url');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('pending_verification', 'active', 'inactive', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('well_known_token');--> statement-breakpoint
CREATE TYPE "public"."agent_visibility" AS ENUM('public', 'restricted');--> statement-breakpoint
CREATE TABLE "namespaces" (
	"namespace" text PRIMARY KEY NOT NULL,
	"owner_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_publications" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"namespace" text NOT NULL,
	"source_url" text NOT NULL,
	"access_url" text NOT NULL,
	"access_mode" "agent_access_mode" NOT NULL,
	"visibility" "agent_visibility" NOT NULL,
	"status" "publication_status" NOT NULL,
	"facts_ref_type" "facts_ref_type",
	"facts_ref_url" text,
	"summary_provider" text,
	"last_validated_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"last_error" text,
	"etag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_snapshots" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"provider" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supported_bindings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ttl_seconds" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_challenges" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"method" "verification_method" NOT NULL,
	"url" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_publications" ADD CONSTRAINT "agent_publications_namespace_namespaces_namespace_fk" FOREIGN KEY ("namespace") REFERENCES "public"."namespaces"("namespace") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_snapshots" ADD CONSTRAINT "agent_snapshots_agent_id_agent_publications_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_publications"("agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_challenges" ADD CONSTRAINT "verification_challenges_agent_id_agent_publications_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_publications"("agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_publications_source_url_idx" ON "agent_publications" USING btree ("source_url");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_challenges_token_idx" ON "verification_challenges" USING btree ("token");