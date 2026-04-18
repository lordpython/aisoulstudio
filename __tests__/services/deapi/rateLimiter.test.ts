/**
 * Unit tests for the DeAPI rate limiter & typed errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RateBudgetExceededError,
  DeApiPayloadError,
  DeApiRateLimitError,
  withExponentialBackoff,
  detectTierInternal,
  getDetectedTier,
} from '../../../packages/shared/src/services/media/deapiService/config';

describe('DeAPI typed errors', () => {
  it('DeApiPayloadError carries status 422', () => {
    const err = new DeApiPayloadError('bad payload');
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(422);
    expect(err.name).toBe('DeApiPayloadError');
  });

  it('DeApiRateLimitError carries status 429', () => {
    const err = new DeApiRateLimitError();
    expect(err.status).toBe(429);
  });

  it('RateBudgetExceededError exposes resetMs', () => {
    const err = new RateBudgetExceededError(60_000);
    expect(err.resetMs).toBe(60_000);
    expect(err.name).toBe('RateBudgetExceededError');
  });
});

describe('withExponentialBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not retry DeApiPayloadError (422)', async () => {
    const fn = vi.fn(async () => {
      throw new DeApiPayloadError('invalid image');
    });

    await expect(withExponentialBackoff(fn, { maxRetries: 3, initialDelayMs: 10 }))
      .rejects.toBeInstanceOf(DeApiPayloadError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry RateBudgetExceededError', async () => {
    const fn = vi.fn(async () => {
      throw new RateBudgetExceededError(60_000);
    });

    await expect(withExponentialBackoff(fn, { maxRetries: 3, initialDelayMs: 10 }))
      .rejects.toBeInstanceOf(RateBudgetExceededError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry messages containing "422"', async () => {
    const fn = vi.fn(async () => {
      throw new Error('DeAPI request failed (422) Unprocessable Entity');
    });

    await expect(withExponentialBackoff(fn, { maxRetries: 3, initialDelayMs: 10 }))
      .rejects.toThrow(/422/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('marks tier as basic on a 429', async () => {
    const fn = vi.fn(async () => {
      throw new DeApiRateLimitError('rate limited');
    });

    const promise = withExponentialBackoff(fn, { maxRetries: 1, initialDelayMs: 10 })
      .catch(() => undefined);

    // Advance fake timers so the backoff delay resolves.
    await vi.advanceTimersByTimeAsync(50);
    await promise;

    expect(getDetectedTier()).toBe('basic');
    expect(fn).toHaveBeenCalledTimes(2); // initial + 1 retry
  });
});

describe('detectTierInternal', () => {
  it('flips to basic on rate limit', () => {
    const tier = detectTierInternal(true);
    expect(tier).toBe('basic');
  });
});
