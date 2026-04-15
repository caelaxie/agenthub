import {
  agentIdParamsSchema,
  errorEnvelopeSchema,
  verifyDomainRequestSchema,
  verifyDomainResponseSchema,
} from "../../common/types/api";

export const verifyDomainParamsSchema = agentIdParamsSchema;
export const verifyDomainBodySchema = verifyDomainRequestSchema;
export const verifyDomainSuccessSchema = verifyDomainResponseSchema;
export const verificationErrorResponseSchema = errorEnvelopeSchema;
