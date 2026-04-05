/**
 * Authentication Middleware
 *
 * Enforces bearer-token auth on protected routes.
 *
 * Two modes (controlled by environment variables):
 *
 * 1. SERVER_API_SECRET (simple shared secret — good for personal/LAN use)
 *    Set SERVER_API_SECRET=<some-long-random-value> in .env.local
 *    Client must send: Authorization: Bearer <secret>
 *
 * 2. Disabled (default — backward compatible while Firebase ID-token auth is wired up)
 *    When neither env var is set, all requests pass through with a dev warning.
 *
 * Migration path to Firebase ID tokens:
 *   - Install firebase-admin: pnpm add firebase-admin --filter @studio/server
 *   - Replace the secret check below with:
 *       import admin from 'firebase-admin';
 *       const decoded = await admin.auth().verifyIdToken(token);
 *   - Update the frontend to attach: Authorization: Bearer <await user.getIdToken()>
 */
import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@studio/shared/src/services/infrastructure/logger.js';

const authLog = createLogger('Auth');

const API_SECRET = process.env.SERVER_API_SECRET;

if (!API_SECRET) {
  authLog.warn(
    'SERVER_API_SECRET is not set — all API routes are unauthenticated. ' +
    'Set SERVER_API_SECRET in .env.local to enable bearer-token auth.',
  );
}

/**
 * Extract the bearer token from the Authorization header.
 * Returns null if the header is absent or malformed.
 */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/**
 * requireAuth — apply this to any route that should be protected.
 *
 * - When SERVER_API_SECRET is set: validates the bearer token and rejects
 *   requests that are missing or use the wrong token.
 * - When SERVER_API_SECRET is not set: passes all requests through (with a
 *   one-time startup warning above so the dev knows auth is off).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!API_SECRET) {
    // Auth disabled — pass through
    next();
    return;
  }

  const token = extractBearerToken(req);

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Send Authorization: Bearer <token>.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(token, API_SECRET)) {
    authLog.warn(`Rejected request with invalid token from ${req.ip}`);
    res.status(403).json({
      success: false,
      error: 'Invalid authentication token.',
      code: 'AUTH_INVALID',
    });
    return;
  }

  next();
}

/**
 * Constant-time string comparison (mitigates timing-based token guessing).
 * Falls back to simple comparison if lengths differ (safe — length is not secret).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
