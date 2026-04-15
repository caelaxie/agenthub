import {
  agentIdParamsSchema,
  agentIndexRecordSchema,
  errorEnvelopeSchema,
  searchEnvelopeSchema,
  searchResponseSchema,
} from "../../common/types/api";

export const discoveryParamsSchema = agentIdParamsSchema;
export const getAgentResponseSchema = agentIndexRecordSchema;
export const searchAgentsBodySchema = searchEnvelopeSchema;
export const searchAgentsResponseSchema = searchResponseSchema;
export const discoveryErrorResponseSchema = errorEnvelopeSchema;
