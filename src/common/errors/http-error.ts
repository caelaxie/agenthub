import { AppError } from "./app-error";

export class HttpError extends AppError {
  static badRequest(code: string, message: string, details?: unknown): HttpError {
    return new HttpError({ status: 400, code, message, details });
  }

  static unauthorized(
    code: string,
    message: string,
    details?: unknown,
  ): HttpError {
    return new HttpError({ status: 401, code, message, details });
  }

  static forbidden(code: string, message: string, details?: unknown): HttpError {
    return new HttpError({ status: 403, code, message, details });
  }

  static notFound(code: string, message: string, details?: unknown): HttpError {
    return new HttpError({ status: 404, code, message, details });
  }

  static conflict(code: string, message: string, details?: unknown): HttpError {
    return new HttpError({ status: 409, code, message, details });
  }

  static unprocessable(
    code: string,
    message: string,
    details?: unknown,
  ): HttpError {
    return new HttpError({ status: 422, code, message, details });
  }

  static notImplemented(
    code: string,
    message: string,
    details?: unknown,
  ): HttpError {
    return new HttpError({ status: 501, code, message, details });
  }

  static internal(code: string, message: string, details?: unknown): HttpError {
    return new HttpError({
      status: 500,
      code,
      message,
      details,
      retryable: true,
    });
  }
}
