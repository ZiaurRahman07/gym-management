export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: unknown) =>
  new HttpError(400, code, message, details);

export const notFound = (message = 'Resource not found') => new HttpError(404, 'NOT_FOUND', message);

export const conflict = (message: string, details?: unknown) =>
  new HttpError(409, 'CONFLICT', message, details);

export const forbidden = (message = 'You do not have permission to do that') =>
  new HttpError(403, 'FORBIDDEN', message);
