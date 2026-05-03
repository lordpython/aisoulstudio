import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Rate limiter for the heavy POST /api/production/start endpoint.
 *
 * Skip predicate uses an EXACT path match (`req.path === '/start'`) rather
 * than a substring check, so future routes containing the substring (e.g.
 * `/restart`, `/start-batch`) are not silently affected.
 */
export function createProductionLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: 'Production run limit reached (5/hour). Try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    skip: (req) => !(req.method === 'POST' && req.path === '/start'),
  });
}
