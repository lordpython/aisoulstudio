import crypto from 'crypto';
import fs from 'fs';
import type { NextFunction, Request, Response } from 'express';

// ============================================================================
// Standardized response helpers
// ============================================================================

/** Send a successful JSON response with a consistent envelope */
export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

/** Send an error JSON response with a consistent envelope */
export function sendError(
  res: Response,
  error: string,
  status = 500,
  details?: unknown,
  code?: string,
): void {
  const body: Record<string, unknown> = { success: false, error };
  if (code !== undefined) body.code = code;
  if (details !== undefined) body.details = details;
  res.status(status).json(body);
}

type LoggerLike = {
  warn: (message: string, data?: unknown) => void;
};

export interface ProxyEndpointRule {
  methods?: string[];
  pattern: RegExp;
}

export interface RawBodyRequest extends Request {
  rawBody?: string;
}

export function createDeprecatedRouteMiddleware(
  log: LoggerLike,
  routeId: string,
  replacement?: string,
  sunset: string = 'Wed, 31 Dec 2026 23:59:59 GMT',
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', sunset);

    if (replacement) {
      res.setHeader('Link', `<${replacement}>; rel="successor-version"`);
    }

    log.warn('Deprecated route accessed', {
      routeId,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent') || 'unknown',
    });

    next();
  };
}

export function normalizeProxyEndpoint(rawPath: string): string {
  return rawPath.replace(/^\/+/, '').replace(/\/+$/, '');
}

export function isSafeProxyEndpoint(endpoint: string): boolean {
  if (!endpoint) return false;
  if (endpoint.includes('..')) return false;
  if (endpoint.includes('\\')) return false;
  return !/[<>"'\s]/.test(endpoint);
}

/**
 * Allowed hostnames for webhook callbacks forwarded to external APIs.
 * Configure via DEAPI_ALLOWED_WEBHOOK_HOSTS (comma-separated) to extend.
 */
const ALLOWED_WEBHOOK_HOSTS = new Set<string>(
    (process.env.DEAPI_ALLOWED_WEBHOOK_HOSTS || 'api.deapi.ai')
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean),
);

/**
 * Validates a webhook URL is safe to forward to an external service.
 * Prevents SSRF by requiring HTTPS and restricting to known-safe hosts.
 */
export function isAllowedWebhookUrl(raw: string): boolean {
    try {
        const parsed = new URL(raw);
        return parsed.protocol === 'https:' && ALLOWED_WEBHOOK_HOSTS.has(parsed.hostname);
    } catch {
        return false;
    }
}

/**
 * Deletes a file without throwing if it has already been removed.
 */
export async function safeUnlinkAsync(filePath: string): Promise<void> {
    try {
        await fs.promises.unlink(filePath);
    } catch {
        // Already deleted or never written — safe to ignore
    }
}

export function isAllowedProxyEndpoint(
  endpoint: string,
  method: string,
  rules: ProxyEndpointRule[],
): boolean {
  const normalizedMethod = method.toUpperCase();

  return rules.some((rule) => {
    const methods = rule.methods?.map((item) => item.toUpperCase());
    if (methods && !methods.includes(normalizedMethod)) {
      return false;
    }
    return rule.pattern.test(endpoint);
  });
}

export function buildProxyUrl(
  baseUrl: string,
  endpoint: string,
  query: Request['query'],
): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/${endpoint}`);

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      url.searchParams.append(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          url.searchParams.append(key, item);
        }
      }
    }
  }

  return url.toString();
}

function secureCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hmacHex(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function getSignatureCandidates(secret: string, payload: string): string[] {
  const digest = hmacHex(secret, payload);
  return [digest, `sha256=${digest}`];
}

/**
 * Reject deliveries whose timestamp is more than this many seconds away from
 * server time. DeAPI documents a 5-minute replay-protection window.
 */
const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function isFreshTimestamp(headerValue: string | undefined): boolean {
  if (!headerValue) return false;
  const numeric = Number(headerValue);
  if (!Number.isFinite(numeric)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - numeric) <= WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS;
}

export function isWebhookAuthorized(req: RawBodyRequest, secret?: string): boolean {
  if (!secret) {
    return false;
  }

  const authorization = req.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    if (secureCompare(token, secret)) {
      return true;
    }
  }

  const sharedSecretHeaders = [
    req.get('x-deapi-webhook-secret'),
    req.get('x-webhook-secret'),
  ].filter((value): value is string => Boolean(value));

  if (sharedSecretHeaders.some((value) => secureCompare(value, secret))) {
    return true;
  }

  const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});
  const signatureHeaders = [
    req.get('x-deapi-signature'),
    req.get('x-hub-signature-256'),
  ].filter((value): value is string => Boolean(value));

  if (signatureHeaders.length === 0) {
    return false;
  }

  // DeAPI signs `${timestamp}.${rawBody}` and requires the timestamp to be
  // within a 5-minute window. Fall back to body-only signing for legacy
  // GitHub-style senders that don't include a timestamp header.
  const timestampHeader = req.get('x-deapi-timestamp');
  const candidates: string[] = [];

  if (timestampHeader) {
    if (!isFreshTimestamp(timestampHeader)) {
      return false;
    }
    candidates.push(...getSignatureCandidates(secret, `${timestampHeader}.${rawBody}`));
  }

  candidates.push(...getSignatureCandidates(secret, rawBody));

  return signatureHeaders.some((headerValue) =>
    candidates.some((candidate) => secureCompare(headerValue, candidate))
  );
}
