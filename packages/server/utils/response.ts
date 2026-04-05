/**
 * Standardized API response helpers.
 *
 * All routes should use these instead of calling res.json() directly so that
 * the response envelope stays consistent across the entire API surface.
 *
 * Envelope shape:
 *   { success: true,  data: T }
 *   { success: false, error: string, code?: string }
 */
import type { Response } from 'express';

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

/**
 * Send a 2xx success response.
 * @param res     Express Response object
 * @param data    Payload to include under `data`
 * @param status  HTTP status code (default 200)
 */
export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data } satisfies SuccessResponse<T>);
}

/**
 * Send an error response.
 * @param res     Express Response object
 * @param error   Human-readable error message
 * @param status  HTTP status code (default 500)
 * @param code    Optional machine-readable error code (e.g. 'VALIDATION_FAILED')
 */
export function sendError(
  res: Response,
  error: string,
  status = 500,
  code?: string,
): void {
  const body: ErrorResponse = { success: false, error };
  if (code) body.code = code;
  res.status(status).json(body);
}
