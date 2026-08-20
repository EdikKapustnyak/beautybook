/**
 * All expected/handled errors in the app should throw an `AppError` (or a
 * subclass) rather than a bare `Error`. The central error handler in
 * `app.ts` maps `AppError` to `{ success: false, error: { code, message } }`
 * with the right HTTP status, and never leaks internals for anything else.
 */
export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  /** Safe to send to the client as-is. Never put secrets/internals here. */
  readonly publicMessage: string;

  constructor(httpStatus: number, code: string, publicMessage: string) {
    super(publicMessage);
    this.name = 'AppError';
    this.httpStatus = httpStatus;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'The request was invalid.') {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required.') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do this.') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The request conflicts with existing state.') {
    super(409, 'CONFLICT', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(429, 'TOO_MANY_REQUESTS', message);
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
