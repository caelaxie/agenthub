import type { ErrorEnvelope } from "../types/api";

export interface AppErrorOptions {
  status: number;
  code: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }

  toResponse(): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        details: this.details,
      },
    };
  }
}
