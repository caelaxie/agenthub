import { HttpError } from "../../common/errors/http-error";
import type {
  PublisherContext,
  VerifyDomainRequest,
} from "../../common/types/api";

export class VerificationService {
  async verifyDomain(
    agentId: string,
    payload: VerifyDomainRequest,
    publisher: PublisherContext,
  ): Promise<never> {
    void agentId;
    void payload;
    void publisher;

    throw HttpError.notImplemented(
      "domain_verification_not_implemented",
      "Domain verification has not been implemented yet.",
    );
  }
}
