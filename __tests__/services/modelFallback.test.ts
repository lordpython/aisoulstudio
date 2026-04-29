/**
 * Tests for withModelFallback — primary→fallback model routing on retry exhaustion.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  withModelFallback,
  resetCircuitBreaker,
} from '../../packages/shared/src/services/utils/robustUtils';

beforeEach(() => {
  resetCircuitBreaker();
  vi.clearAllMocks();
});

describe('withModelFallback', () => {
  it('returns primary result when primary succeeds (fallback never called)', async () => {
    const primary = vi.fn().mockResolvedValue('primary-ok');
    const fallback = vi.fn().mockResolvedValue('fallback-ok');

    const result = await withModelFallback(primary, fallback, 2, 1, 1);

    expect(result).toBe('primary-ok');
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back to secondary after primary exhausts retries', async () => {
    const retryableError = Object.assign(new Error('INTERNAL'), { status: 500 });
    const primary = vi.fn().mockRejectedValue(retryableError);
    const fallback = vi.fn().mockResolvedValue('fallback-ok');

    const result = await withModelFallback(primary, fallback, 2, 1, 1);

    expect(result).toBe('fallback-ok');
    expect(primary).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('falls back immediately when primary fails with non-retryable error (no primary retries)', async () => {
    const nonRetryable = Object.assign(new Error('bad request'), { status: 400 });
    const primary = vi.fn().mockRejectedValue(nonRetryable);
    const fallback = vi.fn().mockResolvedValue('fallback-ok');

    const result = await withModelFallback(primary, fallback, 2, 1, 1);

    expect(result).toBe('fallback-ok');
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('throws fallback error with primary error as cause when both fail', async () => {
    const primaryError = Object.assign(new Error('primary boom'), { status: 500 });
    const fallbackError = Object.assign(new Error('fallback boom'), { status: 500 });
    const primary = vi.fn().mockRejectedValue(primaryError);
    const fallback = vi.fn().mockRejectedValue(fallbackError);

    await expect(withModelFallback(primary, fallback, 1, 1, 1)).rejects.toMatchObject({
      message: 'fallback boom',
      cause: primaryError,
    });
  });
});
