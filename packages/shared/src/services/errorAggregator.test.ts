/**
 * Error Handling Tests
 *
 * Property 41: Error Aggregation (Requirements 20.4)
 * Property 40: Critical Task Failure Handling (Requirements 20.3)
 * Property 42: Rate Limit Queueing (Requirements 20.5)
 * Property 37: Missing Prompt File Error (Requirements 21.2)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ErrorAggregator,
  CriticalFailureHandler,
  RateLimitQueue,
  type PipelineError,
  type OnCriticalFailure,
} from './errorAggregator';
import { loadTemplate } from './prompt/templateLoader';

describe('ErrorAggregator', () => {
  describe('Property 41: Error Aggregation', () => {
    it('should collect multiple errors and provide a single aggregated message', () => {
      const aggregator = new ErrorAggregator();

      aggregator.addError({
        code: 'TASK_FAILED',
        message: 'Image generation failed',
        phase: 'visual',
        taskId: 'vis_1',
        recoverable: true,
        retryable: true,
      });
      aggregator.addError({
        code: 'TASK_TIMEOUT',
        message: 'Audio timeout',
        phase: 'audio',
        taskId: 'aud_1',
        recoverable: true,
        retryable: true,
      });
      aggregator.addError({
        code: 'TASK_FAILED',
        message: 'Another visual failure',
        phase: 'visual',
        taskId: 'vis_2',
        recoverable: true,
        retryable: false,
      });

      const msg = aggregator.getAggregatedMessage();

      // Should be a single message string containing all errors
      expect(typeof msg).toBe('string');
      expect(msg).toContain('3 errors');
      expect(msg).toContain('Image generation failed');
      expect(msg).toContain('Audio timeout');
      expect(msg).toContain('Another visual failure');
      // Should group by phase
      expect(msg).toContain('Phase "visual"');
      expect(msg).toContain('Phase "audio"');
    });

    it('should return single error message for one error', () => {
      const aggregator = new ErrorAggregator();
      aggregator.addError({
        code: 'TASK_FAILED',
        message: 'Single failure',
        phase: 'script',
        recoverable: true,
        retryable: true,
      });

      const msg = aggregator.getAggregatedMessage();
      expect(msg).toContain('TASK_FAILED');
      expect(msg).toContain('Single failure');
    });

    it('should return no-errors message when empty', () => {
      const aggregator = new ErrorAggregator();
      expect(aggregator.getAggregatedMessage()).toContain('No errors');
    });

    it('should detect critical errors', () => {
      const aggregator = new ErrorAggregator();
      aggregator.addError({
        code: 'TASK_FAILED',
        message: 'recoverable',
        phase: 'visual',
        recoverable: true,
        retryable: true,
      });
      expect(aggregator.hasCriticalErrors()).toBe(false);

      aggregator.addError({
        code: 'ASSEMBLY_FAILED',
        message: 'unrecoverable',
        phase: 'assembly',
        recoverable: false,
        retryable: false,
      });
      expect(aggregator.hasCriticalErrors()).toBe(true);
    });

    it('should clear all errors', () => {
      const aggregator = new ErrorAggregator();
      aggregator.addError({
        code: 'TASK_FAILED',
        message: 'error',
        phase: 'test',
        recoverable: true,
        retryable: true,
      });
      expect(aggregator.hasErrors()).toBe(true);

      aggregator.clear();
      expect(aggregator.hasErrors()).toBe(false);
      expect(aggregator.getErrors()).toEqual([]);
    });
  });
});

describe('CriticalFailureHandler', () => {
  describe('Property 40: Critical Task Failure Handling', () => {
    it('should pause on critical phase failures and present recovery options', async () => {
      const onCritical: OnCriticalFailure = vi.fn().mockResolvedValue({
        action: 'retry',
      });

      const handler = new CriticalFailureHandler(onCritical);

      const error: PipelineError = {
        code: 'TASK_FAILED',
        message: 'Script generation failed',
        phase: 'script',
        recoverable: false,
        retryable: true,
      };

      const result = await handler.handleFailure(error);

      expect(onCritical).toHaveBeenCalledTimes(1);
      expect(onCritical).toHaveBeenCalledWith(
        error,
        expect.arrayContaining([
          expect.objectContaining({ action: 'retry' }),
          expect.objectContaining({ action: 'edit' }),
          expect.objectContaining({ action: 'cancel' }),
        ]),
      );
      expect(result.action).toBe('retry');
    });

    it('should treat screenplay failures as critical', async () => {
      const onCritical: OnCriticalFailure = vi.fn().mockResolvedValue({ action: 'cancel' });
      const handler = new CriticalFailureHandler(onCritical);

      await handler.handleFailure({
        code: 'TASK_FAILED',
        message: 'Screenplay failed',
        phase: 'screenplay',
        recoverable: false,
        retryable: true,
      });

      expect(onCritical).toHaveBeenCalled();
    });

    it('should treat assembly failures as critical', async () => {
      const onCritical: OnCriticalFailure = vi.fn().mockResolvedValue({ action: 'retry' });
      const handler = new CriticalFailureHandler(onCritical);

      await handler.handleFailure({
        code: 'ASSEMBLY_FAILED',
        message: 'Assembly failed',
        phase: 'assembly',
        recoverable: false,
        retryable: false,
      });

      expect(onCritical).toHaveBeenCalled();
    });

    it('should NOT pause on non-critical phase failures', async () => {
      const onCritical: OnCriticalFailure = vi.fn();
      const handler = new CriticalFailureHandler(onCritical);

      const result = await handler.handleFailure({
        code: 'TASK_FAILED',
        message: 'Visual failed',
        phase: 'visual',
        recoverable: true,
        retryable: true,
      });

      expect(onCritical).not.toHaveBeenCalled();
      expect(result.action).toBe('skip');
    });

    it('should aggregate all errors including non-critical ones', async () => {
      const onCritical: OnCriticalFailure = vi.fn().mockResolvedValue({ action: 'retry' });
      const handler = new CriticalFailureHandler(onCritical);

      await handler.handleFailure({
        code: 'TASK_FAILED',
        message: 'Visual 1 failed',
        phase: 'visual',
        recoverable: true,
        retryable: true,
      });
      await handler.handleFailure({
        code: 'TASK_FAILED',
        message: 'Script failed',
        phase: 'script',
        recoverable: false,
        retryable: true,
      });

      const aggregator = handler.getAggregator();
      expect(aggregator.getErrors()).toHaveLength(2);
    });
  });
});

describe('RateLimitQueue', () => {
  describe('Property 42: Rate Limit Queueing', () => {
    it('should detect rate limit errors by message', () => {
      const queue = new RateLimitQueue();

      expect(queue.isRateLimitError(new Error('rate limit exceeded'))).toBe(true);
      expect(queue.isRateLimitError(new Error('Too Many Requests'))).toBe(true);
      expect(queue.isRateLimitError(new Error('Error 429'))).toBe(true);
      expect(queue.isRateLimitError(new Error('quota exceeded'))).toBe(true);
      expect(queue.isRateLimitError(new Error('server error'))).toBe(false);
      expect(queue.isRateLimitError(null)).toBe(false);
    });

    it('should detect rate limit errors by status code', () => {
      const queue = new RateLimitQueue();
      expect(queue.isRateLimitError({ status: 429, message: '' })).toBe(true);
      expect(queue.isRateLimitError({ statusCode: '429', message: '' })).toBe(true);
    });

    it('should extract reset delay from error details', () => {
      const queue = new RateLimitQueue();

      // retry-after in seconds
      expect(queue.getResetDelay({ details: { retryAfter: 30 } })).toBe(30_000);
      expect(queue.getResetDelay({ details: { 'retry-after': 10 } })).toBe(10_000);

      // Default when no retry-after
      expect(queue.getResetDelay(new Error('rate limit'))).toBe(60_000);
    });

    it('should retry after rate limit and succeed', async () => {
      const queue = new RateLimitQueue({ defaultResetMs: 10 }); // short delay for tests

      let calls = 0;
      const task = async () => {
        calls++;
        if (calls === 1) {
          throw new Error('rate limit exceeded');
        }
        return 'success';
      };

      const result = await queue.enqueue(task);
      expect(result).toBe('success');
      expect(calls).toBe(2);
    });

    it('should throw non-rate-limit errors immediately', async () => {
      const queue = new RateLimitQueue({ defaultResetMs: 10 });

      const task = async () => {
        throw new Error('server crash');
      };

      await expect(queue.enqueue(task)).rejects.toThrow('server crash');
    });

    it('should NOT count rate limit retries against normal retry budget', async () => {
      // This tests the conceptual property: rate limits are retried indefinitely
      const queue = new RateLimitQueue({ defaultResetMs: 5 });

      let calls = 0;
      const task = async () => {
        calls++;
        if (calls <= 5) {
          throw new Error('rate limit exceeded');
        }
        return 'done';
      };

      const result = await queue.enqueue(task);
      expect(result).toBe('done');
      expect(calls).toBe(6); // 5 rate limits + 1 success
    });
  });
});

describe('Property 37: Missing Prompt File Error', () => {
  it('should throw descriptive error with file path for missing templates', () => {
    expect(() => loadTemplate('nonexistent-format', 'breakdown')).toThrow();
    expect(() => loadTemplate('nonexistent-format', 'breakdown')).toThrow(
      /nonexistent-format\/breakdown/,
    );
    expect(() => loadTemplate('nonexistent-format', 'breakdown')).toThrow(
      /not found/i,
    );
  });

  it('should include available templates in error message', () => {
    try {
      loadTemplate('fake-format', 'missing-phase');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const message = (err as Error).message;
      expect(message).toContain('fake-format/missing-phase');
      expect(message).toContain('services/prompt/templates');
    }
  });
});
