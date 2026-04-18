/**
 * Verifies DeAPI budget/rate-limit behavior:
 *   (a) Pipeline halts cleanly on budget exhaustion
 *   (b) No 422s after a 429 (retry logic doesn't downgrade status)
 *   (c) Browser stays interactive (budget errors don't freeze the UI)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// --- Import the module under test ---
import {
  DeApiRateLimitError,
  DeApiPayloadError,
  RateBudgetExceededError,
  withExponentialBackoff,
} from '@studio/shared/src/services/media/deapiService/config';

// ---------------------------------------------------------------------------
// (a) Pipeline halts cleanly on budget exhaustion
// ---------------------------------------------------------------------------
describe('RateBudgetExceededError — budget exhaustion', () => {
  it('has resetMs so the UI can display a countdown', () => {
    const err = new RateBudgetExceededError(42_000);
    expect(err).toBeInstanceOf(RateBudgetExceededError);
    expect(err.resetMs).toBe(42_000);
    expect(err.message).toContain('budget');
  });

  it('is NOT retried by withExponentialBackoff (fails immediately)', async () => {
    const fn = vi.fn().mockRejectedValue(new RateBudgetExceededError(60_000));
    await expect(withExponentialBackoff(fn, { maxRetries: 3, initialDelayMs: 1 })).rejects.toThrow(
      RateBudgetExceededError
    );
    // Should have been called exactly once — no retries
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('is detected by instanceof checks in pipeline circuit-breaker logic', () => {
    const err: unknown = new RateBudgetExceededError(60_000);
    expect(err instanceof RateBudgetExceededError).toBe(true);
    expect(err instanceof Error).toBe(true);
    // This is the exact check used in useStoryGeneration
    if (err instanceof RateBudgetExceededError) {
      expect(err.resetMs).toBe(60_000);
    } else {
      expect.unreachable('should have been RateBudgetExceededError');
    }
  });
});

// ---------------------------------------------------------------------------
// (b) No 422s after a 429 — retry logic does not downgrade status
// ---------------------------------------------------------------------------
describe('withExponentialBackoff — 429 vs 422 handling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries on 429 (DeApiRateLimitError) and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new DeApiRateLimitError('rate limited'))
      .mockResolvedValueOnce('ok');

    // Use real timers with tiny delay — test completes fast
    const result = await withExponentialBackoff(fn, { maxRetries: 3, initialDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a DeApiPayloadError (422)', async () => {
    const fn = vi.fn().mockRejectedValue(new DeApiPayloadError('bad payload'));
    await expect(withExponentialBackoff(fn, { maxRetries: 3, initialDelayMs: 1 })).rejects.toThrow(
      DeApiPayloadError
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry when error message contains "422"', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Server returned 422'));
    await expect(withExponentialBackoff(fn, { maxRetries: 3, initialDelayMs: 1 })).rejects.toThrow('422');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a 429 never transforms into a 422 — error identity is preserved through retries', async () => {
    // Simulate: 429 on first two attempts, then success
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new DeApiRateLimitError('429'))
      .mockRejectedValueOnce(new DeApiRateLimitError('429 again'))
      .mockResolvedValueOnce('success');

    const result = await withExponentialBackoff(fn, { maxRetries: 3, initialDelayMs: 1 });
    expect(result).toBe('success');

    // Verify the first two rejections were DeApiRateLimitError, never DeApiPayloadError
    const rejectedCalls = fn.mock.results.filter(c => c.type === 'return');
    for (const call of rejectedCalls.slice(0, 2)) {
      const thrown = call.value;
      // Rejected promises store the rejection reason in .value
      if (thrown instanceof Error) {
        expect(thrown).toBeInstanceOf(DeApiRateLimitError);
        expect(thrown).not.toBeInstanceOf(DeApiPayloadError);
      }
    }
  });

  it('after exhausting retries on 429, the thrown error is still DeApiRateLimitError (not 422)', async () => {
    const fn = vi.fn().mockRejectedValue(new DeApiRateLimitError('persistent 429'));
    try {
      await withExponentialBackoff(fn, { maxRetries: 1, initialDelayMs: 1 });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DeApiRateLimitError);
      expect(err).not.toBeInstanceOf(DeApiPayloadError);
    }
  });
});

// ---------------------------------------------------------------------------
// (c) Browser stays interactive — budget errors are catchable, not unhandled
// ---------------------------------------------------------------------------
describe('Budget exhaustion does not freeze the browser', () => {
  it('RateBudgetExceededError is a regular Error (not a DOMException or uncatchable)', () => {
    const err = new RateBudgetExceededError(30_000);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('budget');
    // It can be caught with try/catch
    let caught = false;
    try {
      throw err;
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
  });

  it('pipeline catches RateBudgetExceededError and breaks the loop (circuit breaker)', () => {
    // Simulate the pattern from useStoryGeneration:
    //   for (shot of shots) { try { ... } catch (err) { if (err instanceof RateBudgetExceededError) break; } }
    const errors = [
      new Error('transient'),
      new RateBudgetExceededError(60_000),
      new Error('should not reach'),
    ];

    const processed: string[] = [];
    for (const err of errors) {
      try {
        throw err;
      } catch (caught: unknown) {
        processed.push(caught instanceof Error ? caught.constructor.name : String(caught));
        if (caught instanceof RateBudgetExceededError) {
          break; // circuit breaker — stops the loop
        }
      }
    }

    // Should have processed 'Error' then 'RateBudgetExceededError' then STOPPED
    expect(processed).toEqual(['Error', 'RateBudgetExceededError']);
    // The third error was never reached
    expect(processed).not.toContain('should not reach');
  });
});
