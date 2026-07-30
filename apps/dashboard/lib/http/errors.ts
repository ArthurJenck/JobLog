export interface ApiErrorOptions {
  details?: unknown;
  extra?: Record<string, unknown>;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  extra?: Record<string, unknown>;
  retryAfter?: number;

  constructor(status: number, code: string, message: string, options?: ApiErrorOptions) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = options?.details;
    this.extra = options?.extra;
  }

  toBody(): Record<string, unknown> {
    return {
      error: this.message,
      code: this.code,
      ...(this.details !== undefined ? { details: this.details } : {}),
      ...(this.extra ?? {}),
    };
  }

  static unauthorized(message = 'Non authentifié'): ApiError {
    return new ApiError(401, 'unauthorized', message);
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError(404, 'not_found', message);
  }

  static validation(details: unknown, message = 'Requête invalide'): ApiError {
    return new ApiError(400, 'validation_error', message, { details });
  }

  static methodNotAllowed(message = 'Method not allowed'): ApiError {
    return new ApiError(405, 'method_not_allowed', message);
  }

  static rateLimited(retryAfter?: number, message = 'Trop de requêtes'): ApiError {
    const err = new ApiError(429, 'rate_limited', message);
    err.retryAfter = retryAfter;
    return err;
  }

  static badRequest(message: string, code = 'bad_request', options?: ApiErrorOptions): ApiError {
    return new ApiError(400, code, message, options);
  }
}
