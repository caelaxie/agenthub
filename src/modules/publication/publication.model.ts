import {
  agentIdParamsSchema,
  agentPublicationSchema,
  deactivateResponseSchema,
  errorEnvelopeSchema,
  publishAcceptedResponseSchema,
  publisherAgentRecordSchema,
} from "../../common/types/api";

export const publishAgentParamsSchema = agentIdParamsSchema;
export const publishAgentBodySchema = agentPublicationSchema;
export const publishAgentResponseSchema = publishAcceptedResponseSchema;
export const getPublicationResponseSchema = publisherAgentRecordSchema;
export const deactivateAgentResponseSchema = deactivateResponseSchema;
export const publicationErrorResponseSchema = errorEnvelopeSchema;
