/**
 * Standardized error codes used across the API surface.
 *
 * Use these string constants instead of free-form strings so that clients
 * can programmatically distinguish between error categories.
 */
export const ErrorCodes = {
  // Auth
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_FIELD: 'INVALID_FIELD',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  SESSION_INVALID: 'SESSION_INVALID',

  // Quota / Rate limits
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // AI / Generation
  GENERATION_FAILED: 'GENERATION_FAILED',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  CONFIG_MISSING: 'CONFIG_MISSING',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
