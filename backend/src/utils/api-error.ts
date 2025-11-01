export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, details);

export const unauthorized = (message = "Unauthorized") => new ApiError(401, message);

export const forbidden = (message = "Forbidden") => new ApiError(403, message);

export const notFound = (message = "Not Found") => new ApiError(404, message);

export const internalError = (message = "Internal Server Error", details?: unknown) =>
  new ApiError(500, message, details);

export const tooManyRequests = (message = "Too Many Requests") => new ApiError(429, message);

export const serviceUnavailable = (message = "Service Unavailable", details?: unknown) =>
  new ApiError(503, message, details);
