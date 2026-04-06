/**
 * Parallel Execution Engine
 * 
 * Executes multiple AI tasks concurrently with controlled concurrency,
 * retry logic, progress tracking, and cancellation support.
 * 
 * Features:
 * - Task queue with priority ordering
 * - Worker pool with configurable concurrency (3-5 workers)
 * - Task state tracking (queued, in-progress, completed, failed)
 * - Progress calculation and event emission
 * - Retry logic with exponential backoff
 * - Cancellation support with resource cleanup
 */

// Use built-in crypto.randomUUID() for ID generation

// ============================================================================
// Types and Interfaces
// ============================================================================

export type TaskType = 'research' | 'script' | 'visual' | 'audio' | 'assembly';
export type TaskState = 'queued' | 'in-progress' | 'completed' | 'failed' | 'cancelled';

export interface Task<T = any> {
  id: string;
  type: TaskType;
  execute: () => Promise<T>;
  priority: number;
  retryable: boolean;
  timeout: number; // milliseconds
}

export interface ExecutionOptions {
  concurrencyLimit: number;
  retryAttempts: number;
  retryDelay: number; // milliseconds (base delay)
  exponentialBackoff: boolean;
  onProgress?: (progress: ExecutionProgress) => void;
  onTaskComplete?: (taskId: string, result: any) => void;
  onTaskFail?: (taskId: string, error: Error) => void;
}

export interface TaskResult<T = any> {
  taskId: string;
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  duration: number; // milliseconds
}

export interface ExecutionProgress {
  executionId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  inProgressTasks: number;
  queuedTasks: number;
  estimatedTimeRemaining: number; // milliseconds
}

interface TaskMetadata<T = any> {
  task: Task<T>;
  state: TaskState;
  attempts: number;
  rateLimitRetries?: number;
  startTime?: number;
  endTime?: number;
  result?: T;
  error?: Error;
  abortController?: AbortController;
}

// ============================================================================
// Parallel Execution Engine
// ============================================================================

export class ParallelExecutionEngine {
  private executionId: string = '';
  private taskQueue: TaskMetadata[] = [];
  private inProgressTasks: Map<string, TaskMetadata> = new Map();
  private completedTasks: Map<string, TaskMetadata> = new Map();
  private failedTasks: Map<string, TaskMetadata> = new Map();
  private cancelledTasks: Set<string> = new Set();
  
  private options: ExecutionOptions = {
    concurrencyLimit: 3,
    retryAttempts: 3,
    retryDelay: 1000,
    exponentialBackoff: true,
  };
  
  private isCancelled: boolean = false;
  private isExecuting: boolean = false;
  private cancellationPromise: Promise<void> | null = null;
  
  /**
   * Execute multiple tasks in parallel with controlled concurrency
   */
  async execute<T>(tasks: Task<T>[], options: Partial<ExecutionOptions> = {}): Promise<TaskResult<T>[]> {
    // Merge options
    this.options = { ...this.options, ...options };
    
    // Initialize execution
    this.executionId = crypto.randomUUID();
    this.isCancelled = false;
    this.isExecuting = true;
    this.taskQueue = [];
    this.inProgressTasks.clear();
    this.completedTasks.clear();
    this.failedTasks.clear();
    this.cancelledTasks.clear();
    
    // Sort tasks by priority (higher priority first)
    const sortedTasks = [...tasks].sort((a, b) => b.priority - a.priority);
    
    // Initialize task metadata
    this.taskQueue = sortedTasks.map(task => ({
      task,
      state: 'queued' as TaskState,
      attempts: 0,
    }));
    
    // Emit initial progress
    this.emitProgress();
    
    // Start worker pool
    const workers: Promise<void>[] = [];
    for (let i = 0; i < this.options.concurrencyLimit; i++) {
      workers.push(this.worker());
    }
    
    // Wait for all workers to complete
    await Promise.all(workers);
    
    this.isExecuting = false;
    
    // Build results
    const results: TaskResult<T>[] = [];
    
    // Add completed tasks
    this.completedTasks.forEach((metadata) => {
      results.push({
        taskId: metadata.task.id,
        success: true,
        data: metadata.result,
        attempts: metadata.attempts,
        duration: (metadata.endTime || 0) - (metadata.startTime || 0),
      });
    });
    
    // Add failed tasks
    this.failedTasks.forEach((metadata) => {
      results.push({
        taskId: metadata.task.id,
        success: false,
        error: metadata.error,
        attempts: metadata.attempts,
        duration: (metadata.endTime || 0) - (metadata.startTime || 0),
      });
    });
    
    // Add cancelled tasks
    this.cancelledTasks.forEach((taskId) => {
      results.push({
        taskId,
        success: false,
        error: new Error('Task cancelled'),
        attempts: 0,
        duration: 0,
      });
    });
    
    return results;
  }
  
  /**
   * Cancel all pending and in-flight tasks
   */
  async cancel(executionId: string): Promise<void> {
    if (executionId !== this.executionId) {
      throw new Error('Invalid execution ID');
    }
    
    if (this.isCancelled) {
      return this.cancellationPromise || Promise.resolve();
    }
    
    this.isCancelled = true;
    
    // Create cancellation promise
    this.cancellationPromise = new Promise<void>((resolve) => {
      const startTime = Date.now();
      const timeout = 5000; // 5 seconds
      
      const checkCompletion = () => {
        const elapsed = Date.now() - startTime;
        
        // Check if all tasks are done
        if (this.inProgressTasks.size === 0 && this.taskQueue.length === 0) {
          resolve();
          return;
        }
        
        // Check timeout
        if (elapsed >= timeout) {
          // Force abort all in-progress tasks
          this.inProgressTasks.forEach((metadata) => {
            if (metadata.abortController) {
              metadata.abortController.abort();
            }
          });
          resolve();
          return;
        }
        
        // Check again in 100ms
        setTimeout(checkCompletion, 100);
      };
      
      checkCompletion();
    });
    
    // Abort all in-progress tasks
    this.inProgressTasks.forEach((metadata) => {
      if (metadata.abortController) {
        metadata.abortController.abort();
      }
    });
    
    // Mark queued tasks as cancelled
    this.taskQueue.forEach((metadata) => {
      this.cancelledTasks.add(metadata.task.id);
    });
    this.taskQueue = [];
    
    // Emit progress
    this.emitProgress();
    
    return this.cancellationPromise;
  }
  
  /**
   * Get current execution progress
   */
  getProgress(executionId: string): ExecutionProgress {
    if (executionId !== this.executionId) {
      throw new Error('Invalid execution ID');
    }
    
    return this.calculateProgress();
  }
  
  // ==========================================================================
  // Private Methods
  // ==========================================================================
  
  /**
   * Worker that processes tasks from the queue
   */
  private async worker(): Promise<void> {
    while (!this.isCancelled) {
      // Get next task from queue
      const metadata = this.taskQueue.shift();
      
      if (!metadata) {
        // No more tasks, exit worker
        break;
      }
      
      // Execute task
      await this.executeTask(metadata);
    }
  }
  
  /**
   * Execute a single task with retry logic
   */
  private async executeTask<T>(metadata: TaskMetadata<T>): Promise<void> {
    const { task } = metadata;
    
    // Check if cancelled
    if (this.isCancelled) {
      this.cancelledTasks.add(task.id);
      return;
    }
    
    // Mark as in-progress
    metadata.state = 'in-progress';
    metadata.startTime = Date.now();
    metadata.abortController = new AbortController();
    this.inProgressTasks.set(task.id, metadata);
    this.emitProgress();
    
    try {
      // Execute task with timeout
      const result = await this.executeWithTimeout(
        task.execute(),
        task.timeout,
        metadata.abortController.signal
      );
      
      // Task succeeded
      metadata.state = 'completed';
      metadata.endTime = Date.now();
      metadata.result = result;
      this.inProgressTasks.delete(task.id);
      this.completedTasks.set(task.id, metadata);
      
      // Emit progress and callback
      this.emitProgress();
      if (this.options.onTaskComplete) {
        this.options.onTaskComplete(task.id, result);
      }
      
    } catch (error) {
      // Task failed
      metadata.error = error as Error;

      // Rate limit errors get special handling: re-queue with longer delay
      // and do NOT count against retry attempts (Requirement 20.5, Property 42)
      if (this.isRateLimitError(error) && !this.isCancelled) {
        const resetDelay = this.getRateLimitResetDelay(error);
        metadata.rateLimitRetries = (metadata.rateLimitRetries ?? 0) + 1;

        await this.sleep(resetDelay);

        if (!this.isCancelled) {
          metadata.state = 'queued';
          this.inProgressTasks.delete(task.id);
          this.taskQueue.push(metadata);
          this.emitProgress();
        } else {
          this.cancelledTasks.add(task.id);
          this.inProgressTasks.delete(task.id);
        }
        return;
      }

      // Normal failure: count attempt
      metadata.attempts++;

      // Check if retryable and attempts remaining
      const shouldRetry =
        task.retryable &&
        metadata.attempts < this.options.retryAttempts &&
        !this.isCancelled;

      if (shouldRetry) {
        // Calculate retry delay with exponential backoff
        const delay = this.calculateRetryDelay(metadata.attempts);

        // Wait before retry
        await this.sleep(delay);

        // Re-queue task if not cancelled
        if (!this.isCancelled) {
          metadata.state = 'queued';
          this.inProgressTasks.delete(task.id);
          this.taskQueue.push(metadata);
          this.emitProgress();
        } else {
          this.cancelledTasks.add(task.id);
          this.inProgressTasks.delete(task.id);
        }
      } else {
        // Task failed permanently
        metadata.state = 'failed';
        metadata.endTime = Date.now();
        this.inProgressTasks.delete(task.id);
        this.failedTasks.set(task.id, metadata);

        // Emit progress and callback
        this.emitProgress();
        if (this.options.onTaskFail) {
          this.options.onTaskFail(task.id, error as Error);
        }
      }
    }
  }
  
  /**
   * Execute a promise with timeout and abort signal
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    signal: AbortSignal
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Task timeout after ${timeout}ms`));
      }, timeout);
      
      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(new Error('Task aborted'));
      };
      
      signal.addEventListener('abort', abortHandler);
      
      promise
        .then((result) => {
          clearTimeout(timeoutId);
          signal.removeEventListener('abort', abortHandler);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          signal.removeEventListener('abort', abortHandler);
          reject(error);
        });
    });
  }
  
  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const { retryDelay, exponentialBackoff } = this.options;
    
    if (!exponentialBackoff) {
      return retryDelay;
    }
    
    // Exponential backoff: delay = baseDelay * (2 ^ attempt) + jitter
    const exponentialDelay = retryDelay * Math.pow(2, attempt);
    const jitter = Math.random() * retryDelay;
    
    return exponentialDelay + jitter;
  }
  
  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    return (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('429') ||
      message.includes('quota exceeded')
    );
  }

  /**
   * Parse rate limit reset delay from error, or use default (60s)
   */
  private getRateLimitResetDelay(error: any): number {
    // Try to extract retry-after from error details
    const retryAfter = error?.details?.retryAfter
      ?? error?.response?.headers?.['retry-after']
      ?? error?.retryAfter;

    if (typeof retryAfter === 'number' && retryAfter > 0) {
      // If value looks like seconds (< 1000), convert to ms
      return retryAfter < 1000 ? retryAfter * 1000 : retryAfter;
    }
    if (typeof retryAfter === 'string') {
      const parsed = parseInt(retryAfter, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed < 1000 ? parsed * 1000 : parsed;
      }
    }

    // Default: 60 seconds
    return 60_000;
  }
  
  /**
   * Calculate current execution progress
   */
  private calculateProgress(): ExecutionProgress {
    const totalTasks = 
      this.completedTasks.size +
      this.failedTasks.size +
      this.inProgressTasks.size +
      this.taskQueue.length +
      this.cancelledTasks.size;
    
    const completedTasks = this.completedTasks.size;
    const failedTasks = this.failedTasks.size;
    const inProgressTasks = this.inProgressTasks.size;
    const queuedTasks = this.taskQueue.length;
    
    // Calculate estimated time remaining
    let estimatedTimeRemaining = 0;
    if (completedTasks > 0) {
      const completedMetadata = Array.from(this.completedTasks.values());
      const avgDuration = completedMetadata.reduce((sum, m) => {
        return sum + ((m.endTime || 0) - (m.startTime || 0));
      }, 0) / completedTasks;
      
      const remainingTasks = inProgressTasks + queuedTasks;
      estimatedTimeRemaining = Math.ceil(avgDuration * remainingTasks / this.options.concurrencyLimit);
    }
    
    return {
      executionId: this.executionId,
      totalTasks,
      completedTasks,
      failedTasks,
      inProgressTasks,
      queuedTasks,
      estimatedTimeRemaining,
    };
  }
  
  /**
   * Emit progress event
   */
  private emitProgress(): void {
    if (this.options.onProgress) {
      const progress = this.calculateProgress();
      this.options.onProgress(progress);
    }
  }
  
  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
