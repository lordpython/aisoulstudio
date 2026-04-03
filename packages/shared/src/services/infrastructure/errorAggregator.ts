/**
 * Error Aggregator, Critical Failure Handler, and Rate Limit Queue
 *
 * Provides error handling infrastructure for the multi-format pipeline:
 * - ErrorAggregator: Collects errors and produces aggregated messages (Req 20.4, Property 41)
 * - CriticalFailureHandler: Pauses on critical failures with recovery options (Req 20.3, Property 40)
 * - RateLimitQueue: Queues tasks behind rate limit resets (Req 20.5, Property 42)
 *
 * React-free for Node.js compatibility.
 */

import { agentLogger } from './logger';

// ============================================================================
// Types
// ============================================================================

export type ErrorCode =
  | 'FORMAT_NOT_FOUND'
  | 'INVALID_FORMAT'
  | 'TASK_TIMEOUT'
  | 'TASK_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'CHECKPOINT_TIMEOUT'
  | 'ASSEMBLY_FAILED'
  | 'PARTIAL_FAILURE'
  | 'CANCELLATION_FAILED';

export interface PipelineError {
  code: ErrorCode;
  message: string;
  phase: string;
  taskId?: string;
  recoverable: boolean;
  retryable: boolean;
  details?: any;
}

export interface RecoveryOption {
  action: 'retry' | 'edit' | 'skip' | 'cancel';
  label: string;
  description: string;
}

export interface CriticalFailureResult {
  action: RecoveryOption['action'];
  editedContent?: string;
}

export type OnCriticalFailure = (
  error: PipelineError,
  options: RecoveryOption[],
) => Promise<CriticalFailureResult>;

// ============================================================================
// Error Aggregator
// ============================================================================

const log = agentLogger.child('ErrorAggregator');

export class ErrorAggregator {
  private errors: PipelineError[] = [];

  addError(error: PipelineError): void {
    this.errors.push(error);
    log.warn(`[${error.code}] phase="${error.phase}": ${error.message}`);
  }

  getErrors(): PipelineError[] {
    return [...this.errors];
  }

  getAggregatedMessage(): string {
    if (this.errors.length === 0) {
      return 'No errors recorded.';
    }

    if (this.errors.length === 1) {
      const e = this.errors[0]!;
      return `[${e.code}] ${e.phase}: ${e.message}`;
    }

    const byPhase = new Map<string, PipelineError[]>();
    for (const error of this.errors) {
      const list = byPhase.get(error.phase) ?? [];
      list.push(error);
      byPhase.set(error.phase, list);
    }

    const lines: string[] = [`${this.errors.length} errors occurred during pipeline execution:`];
    for (const [phase, phaseErrors] of byPhase) {
      lines.push(`  Phase "${phase}":`);
      for (const e of phaseErrors) {
        const taskSuffix = e.taskId ? ` (task: ${e.taskId})` : '';
        lines.push(`    - [${e.code}] ${e.message}${taskSuffix}`);
      }
    }

    return lines.join('\n');
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  hasCriticalErrors(): boolean {
    return this.errors.some((e) => !e.recoverable);
  }

  clear(): void {
    this.errors = [];
  }
}

// ============================================================================
// Critical Failure Handler
// ============================================================================

const CRITICAL_PHASES = new Set(['script', 'screenplay', 'assembly', 'final-assembly']);

const DEFAULT_RECOVERY_OPTIONS: RecoveryOption[] = [
  { action: 'retry', label: 'Retry', description: 'Retry the failed task from scratch' },
  { action: 'edit', label: 'Edit & Retry', description: 'Edit the input and retry' },
  { action: 'skip', label: 'Skip', description: 'Skip this task and continue' },
  { action: 'cancel', label: 'Cancel', description: 'Cancel the entire pipeline' },
];

export class CriticalFailureHandler {
  private onCriticalFailure: OnCriticalFailure;
  private aggregator: ErrorAggregator;

  constructor(onCriticalFailure: OnCriticalFailure, aggregator?: ErrorAggregator) {
    this.onCriticalFailure = onCriticalFailure;
    this.aggregator = aggregator ?? new ErrorAggregator();
  }

  async handleFailure(error: PipelineError): Promise<CriticalFailureResult> {
    this.aggregator.addError(error);

    if (CRITICAL_PHASES.has(error.phase)) {
      log.error(`Critical failure in phase "${error.phase}": ${error.message}`);
      return this.onCriticalFailure(error, DEFAULT_RECOVERY_OPTIONS);
    }

    log.warn(`Non-critical failure in phase "${error.phase}": ${error.message}. Continuing.`);
    return { action: 'skip' };
  }

  getAggregator(): ErrorAggregator {
    return this.aggregator;
  }
}

// ============================================================================
// Rate Limit Queue
// ============================================================================

export class RateLimitQueue {
  private defaultResetMs: number;

  constructor(options?: { defaultResetMs?: number }) {
    this.defaultResetMs = options?.defaultResetMs ?? 60_000;
  }

  isRateLimitError(error: any): boolean {
    if (!error) return false;
    const message = (error.message ?? '').toLowerCase();
    const statusCode = error.status ?? error.statusCode ?? error.code;
    return (
      statusCode === 429 ||
      statusCode === '429' ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('quota exceeded') ||
      message.includes('429')
    );
  }

  getResetDelay(error: any): number {
    const retryAfter =
      error?.details?.['retry-after'] ??
      error?.details?.retryAfter ??
      error?.headers?.['retry-after'] ??
      error?.retryAfter;

    if (retryAfter != null) {
      const parsed = Number(retryAfter);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed * 1000;
      }
    }

    return this.defaultResetMs;
  }

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    while (true) {
      try {
        return await task();
      } catch (error: any) {
        if (!this.isRateLimitError(error)) {
          throw error;
        }
        const delay = this.getResetDelay(error);
        log.warn(`Rate limit hit. Queuing retry after ${Math.round(delay / 1000)}s.`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
