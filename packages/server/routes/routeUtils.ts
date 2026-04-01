import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

// ============================================================================
// Standardized response helpers
// ============================================================================

/** Send a successful JSON response with a consistent envelope */
export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

/** Send an error JSON response with a consistent envelope */
export function sendError(res: Response, error: string, status = 500, details?: unknown): void {
  const body: Record<string, unknown> = { success: false, error };
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

function getSignatureCandidates(secret: string, payload: string): string[] {
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return [digest, `sha256=${digest}`];
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
  const signatureCandidates = getSignatureCandidates(secret, rawBody);
  const signatureHeaders = [
    req.get('x-deapi-signature'),
    req.get('x-hub-signature-256'),
  ].filter((value): value is string => Boolean(value));

  return signatureHeaders.some((headerValue) =>
    signatureCandidates.some((candidate) => secureCompare(headerValue, candidate))
  );
}
