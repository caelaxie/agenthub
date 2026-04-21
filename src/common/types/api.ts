import { t } from "elysia";

import {
  AGENT_ID_PATTERN,
  APP_NAME,
  APP_VERSION,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../../config/constants";

export interface PublisherContext {
  subject: string;
  isAuthenticated: boolean;
}

export const appErrorDetailsSchema = t.Object({}, { additionalProperties: true });

export const appErrorSchema = t.Object({
  code: t.String(),
  message: t.String(),
  retryable: t.Boolean(),
  details: appErrorDetailsSchema,
});

export const errorEnvelopeSchema = t.Object({
  error: appErrorSchema,
});

export const healthResponseSchema = t.Object({
  status: t.Literal("ok"),
  service: t.String({ default: APP_NAME }),
  version: t.String({ default: APP_VERSION }),
  timestamp: t.String({ format: "date-time" }),
});

export const visibilitySchema = t.Union([
  t.Literal("public"),
  t.Literal("restricted"),
]);

export const accessModeSchema = t.Union([
  t.Literal("public"),
  t.Literal("protected"),
]);

export const publicationStatusSchema = t.Union([
  t.Literal("pending_verification"),
  t.Literal("active"),
  t.Literal("inactive"),
  t.Literal("invalid"),
]);

export const factsRefSchema = t.Object(
  {
    type: t.Union([t.Literal("public_url"), t.Literal("brokered_url")]),
    url: t.String({ format: "uri" }),
  },
  { additionalProperties: false },
);

export const summaryOverridesSchema = t.Object(
  {
    provider: t.Optional(t.String()),
  },
  { additionalProperties: false },
);

const httpsUriStringSchema = t.String({
  format: "uri",
  pattern: "^https://",
});

export const agentPublicationInputSchema = t.Object(
  {
    agent_card_url: t.String(),
    visibility: visibilitySchema,
    facts_ref: t.Optional(t.Union([factsRefSchema, t.Null()])),
    summary_overrides: t.Optional(summaryOverridesSchema),
  },
  { additionalProperties: false },
);

export const agentPublicationSchema = t.Object(
  {
    agent_card_url: httpsUriStringSchema,
    visibility: visibilitySchema,
    facts_ref: t.Optional(t.Union([factsRefSchema, t.Null()])),
    summary_overrides: t.Optional(summaryOverridesSchema),
  },
  { additionalProperties: false },
);

export const agentCardRefSchema = t.Object(
  {
    source_url: t.String({ format: "uri" }),
    access_url: t.String({ format: "uri" }),
    access_mode: accessModeSchema,
    last_validated_at: t.String({ format: "date-time" }),
    etag: t.Optional(t.String()),
  },
  { additionalProperties: false },
);

export const domainVerificationChallengeSchema = t.Object(
  {
    method: t.Literal("well_known_token"),
    url: t.String({ format: "uri" }),
    token: t.String(),
    expires_at: t.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export const agentIndexRecordSchema = t.Object(
  {
    agent_id: t.String({ pattern: AGENT_ID_PATTERN }),
    display_name: t.String(),
    provider: t.Optional(t.String()),
    agent_card_ref: agentCardRefSchema,
    skills: t.Array(t.String()),
    tags: t.Array(t.String()),
    supported_bindings: t.Array(t.String()),
    visibility: visibilitySchema,
    ttl_seconds: t.Number(),
    updated_at: t.String({ format: "date-time" }),
    status: publicationStatusSchema,
    facts_ref: t.Optional(t.Union([factsRefSchema, t.Null()])),
  },
  { additionalProperties: false },
);

export const publisherAgentRecordSchema = t.Object(
  {
    agent_id: t.String({ pattern: AGENT_ID_PATTERN }),
    publication: agentPublicationSchema,
    status: publicationStatusSchema,
    agent_card_ref: agentCardRefSchema,
    ownership: t.Object(
      {
        namespace: t.String(),
        owner_subject: t.String(),
      },
      { additionalProperties: false },
    ),
    challenge: t.Optional(domainVerificationChallengeSchema),
    last_validated_at: t.String({ format: "date-time" }),
    verified_at: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
    last_error: t.Optional(t.Union([t.String(), t.Null()])),
  },
  { additionalProperties: false },
);

export const agentIdParamsSchema = t.Object({
  agentId: t.String({ pattern: AGENT_ID_PATTERN }),
});

export const verifyDomainRequestSchema = t.Object(
  {
    method: t.Literal("well_known_token"),
  },
  { additionalProperties: false },
);

export const publishAcceptedResponseSchema = t.Object(
  {
    agent_id: t.String({ pattern: AGENT_ID_PATTERN }),
    status: t.Literal("pending_verification"),
    challenge: t.Optional(domainVerificationChallengeSchema),
  },
  { additionalProperties: false },
);

export const deactivateResponseSchema = t.Object(
  {
    agent_id: t.String({ pattern: AGENT_ID_PATTERN }),
    status: t.Literal("inactive"),
  },
  { additionalProperties: false },
);

export const verifyDomainResponseSchema = t.Object(
  {
    agent_id: t.String({ pattern: AGENT_ID_PATTERN }),
    status: t.Literal("active"),
    verified_at: t.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export const searchQuerySchema = t.Object(
  {
    text: t.Optional(t.String()),
    skills: t.Optional(t.Array(t.String())),
    tags: t.Optional(t.Array(t.String())),
    provider: t.Optional(t.String()),
    visibility: t.Optional(visibilitySchema),
    supported_bindings: t.Optional(t.Array(t.String())),
    page_size: t.Optional(
      t.Numeric({
        minimum: 1,
        maximum: MAX_PAGE_SIZE,
        default: DEFAULT_PAGE_SIZE,
      }),
    ),
    page_token: t.Optional(t.Union([t.String(), t.Null()])),
  },
  { additionalProperties: false },
);

export const searchEnvelopeSchema = t.Object(
  {
    query: searchQuerySchema,
  },
  { additionalProperties: false },
);

export const searchResponseSchema = t.Object(
  {
    results: t.Array(agentIndexRecordSchema),
    next_page_token: t.Union([t.String(), t.Null()]),
  },
  { additionalProperties: false },
);

export type AppErrorPayload = typeof appErrorSchema.static;
export type ErrorEnvelope = typeof errorEnvelopeSchema.static;
export type HealthResponse = typeof healthResponseSchema.static;
export type AgentPublicationInput = typeof agentPublicationInputSchema.static;
export type AgentPublication = typeof agentPublicationSchema.static;
export type AgentCardRef = typeof agentCardRefSchema.static;
export type DomainVerificationChallenge =
  typeof domainVerificationChallengeSchema.static;
export type AgentIndexRecord = typeof agentIndexRecordSchema.static;
export type PublisherAgentRecord = typeof publisherAgentRecordSchema.static;
export type PublicationStatus = typeof publicationStatusSchema.static;
export type PublishAcceptedResponse = typeof publishAcceptedResponseSchema.static;
export type DeactivateResponse = typeof deactivateResponseSchema.static;
export type VerifyDomainRequest = typeof verifyDomainRequestSchema.static;
export type VerifyDomainResponse = typeof verifyDomainResponseSchema.static;
export type SearchEnvelope = typeof searchEnvelopeSchema.static;
export type SearchResponse = typeof searchResponseSchema.static;
