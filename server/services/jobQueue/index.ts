/**
 * Job Queue Manager
 *
 * Manages the lifecycle of video encoding jobs:
 * - Queue management (pending → encoding → complete)
 * - Job persistence to disk
 * - SSE progress subscriptions
 * - Timeout monitoring
 * - Worker coordination
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../services/logger.js';
import {
  RenderJob,
  JobStatus,
  JobProgress,
  JobProgressCallback,
  createRenderJob,
  EncodingConfig,
  FrameChecksum,
} from '../../types/renderJob.js';
import {
  saveJob,
  loadJob,
  deleteJob,
  loadIncompleteJobs,
  cleanupOldJobs,
} from './jobStore.js';
import { timeoutManager } from './timeoutManager.js';

const log = createLogger('JobQueue');

// Maximum concurrent encoding jobs
const MAX_CONCURRENT_JOBS = 2;

// Job retention after completion
const COMPLETED_JOB_RETENTION_MS = 30 * 60 * 1000; // 30 minutes

export class JobQueueManager extends EventEmitter {
  private jobs: Map<string, RenderJob> = new Map();
  private subscribers: Map<string, Set<JobProgressCallback>> = new Map();
  private processingQueue: string[] = [];
  private activeJobs: Set<string> = new Set();
  private initialized = false;
  private isProcessing = false;

  // Callback for when a job is ready to be processed
  private onJobReady: ((job: RenderJob) => Promise<void>) | null = null;

  constructor() {
    super();
  }

  /**
   * Initialize the job queue (call on server startup)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    log.info('Initializing job queue...');

    // Start timeout manager
    timeoutManager.start((jobId, reason) => {
      this.handleJobTimeout(jobId, reason);
    });

    // Recover incomplete jobs from disk
    try {
      const incompleteJobs = await loadIncompleteJobs();
      for (const job of incompleteJobs) {
        // Reset jobs that were in progress
        if (job.status === 'encoding') {
          job.status = 'queued';
          job.retryCount++;
          log.info(`Recovered job ${job.jobId} - reset to queued (retry ${job.retryCount})`);
        }
        this.jobs.set(job.jobId, job);

        // Add queued jobs to processing queue
        if (job.status === 'queued') {
          this.processingQueue.push(job.jobId);
        }
      }

      if (incompleteJobs.length > 0) {
        log.info(`Recovered ${incompleteJobs.length} incomplete jobs`);
      }
    } catch (error) {
      log.error('Failed to recover jobs:', error);
    }

    // Cleanup old jobs periodically
    setInterval(() => {
      cleanupOldJobs(24).catch((err) =>
        log.error('Failed to cleanup old jobs:', err)
      );
    }, 60 * 60 * 1000); // Every hour

    this.initialized = true;
    log.info('Job queue initialized');

    // Process any recovered jobs
    this.processNextJob();
  }

  /**
   * Set the callback for processing jobs
   */
  setJobProcessor(processor: (job: RenderJob) => Promise<void>): void {
    this.onJobReady = processor;
  }

  /**
   * Create a new job for a session
   */
  async createJob(
    sessionId: string,
    config: Partial<EncodingConfig> = {}
  ): Promise<RenderJob> {
    const job = createRenderJob(sessionId, config);
    this.jobs.set(job.jobId, job);
    await saveJob(job);

    log.info(`Created job ${job.jobId} for session ${sessionId}`);
    this.emitProgress(job);

    return job;
  }

  /**
   * Get a job by ID
   */
  getJob(jobId: string): RenderJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get job by session ID
   */
  getJobBySession(sessionId: string): RenderJob | undefined {
    for (const job of this.jobs.values()) {
      if (job.sessionId === sessionId) {
        return job;
      }
    }
    return undefined;
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    additionalData?: Partial<RenderJob>
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      log.warn(`Attempted to update non-existent job ${jobId}`);
      return;
    }

    job.status = status;
    if (additionalData) {
      Object.assign(job, additionalData);
    }

    // Handle state transitions
    switch (status) {
      case 'encoding':
        job.startedAt = Date.now();
        timeoutManager.trackJob(jobId);
        break;

      case 'complete':
        job.completedAt = Date.now();
        timeoutManager.untrackJob(jobId);
        this.activeJobs.delete(jobId);
        // Schedule cleanup
        setTimeout(() => {
          this.cleanupCompletedJob(jobId);
        }, COMPLETED_JOB_RETENTION_MS);
        break;

      case 'failed':
        timeoutManager.untrackJob(jobId);
        this.activeJobs.delete(jobId);
        break;
    }

    await saveJob(job);
    this.emitProgress(job);

    // If job completed or failed, process next
    if (status === 'complete' || status === 'failed') {
      this.processNextJob();
    }
  }

  /**
   * Update job progress
   */
  async updateJobProgress(
    jobId: string,
    progress: number,
    currentFrame?: number,
    message?: string
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.progress = progress;
    if (currentFrame !== undefined) {
      job.currentFrame = currentFrame;
    }
    job.lastHeartbeat = Date.now();

    // Record heartbeat with timeout manager
    timeoutManager.recordHeartbeat(jobId);

    // Emit progress (but don't save every update to disk - too frequent)
    this.emitProgress(job, message);
  }

  /**
   * Record a heartbeat for a job (from worker)
   */
  recordHeartbeat(jobId: string): void {
    timeoutManager.recordHeartbeat(jobId);
  }

  /**
   * Register frames received in a chunk
   */
  registerFrames(
    jobId: string,
    frameCount: number,
    checksums?: FrameChecksum[]
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.frameManifest.receivedFrames += frameCount;

    if (checksums) {
      for (const cs of checksums) {
        job.frameManifest.checksums[cs.frameIndex] = cs;
      }
    }

    job.status = 'uploading';
    // Persist status change so uploads survive server restarts
    saveJob(job).catch((err) =>
      log.error(`Failed to persist frame registration for job ${jobId}:`, err)
    );
  }

  /**
   * Set total expected frames
   */
  setTotalFrames(jobId: string, totalFrames: number): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.frameManifest.totalFrames = totalFrames;
  }

  /**
   * Queue a job for processing (called after all frames uploaded)
   */
  async queueJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.status = 'queued';
    await saveJob(job);

    this.processingQueue.push(jobId);
    log.info(
      `Job ${jobId} queued (${this.processingQueue.length} in queue, ${this.activeJobs.size} active)`
    );

    this.emitProgress(job);
    this.processNextJob();
  }

  /**
   * Process the next job in the queue
   */
  private async processNextJob(): Promise<void> {
    // Guard against concurrent invocations racing past the capacity check
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this._processNextJobInner();
    } finally {
      this.isProcessing = false;
    }
  }

  private async _processNextJobInner(): Promise<void> {
    // Check if we can process more jobs
    if (this.activeJobs.size >= MAX_CONCURRENT_JOBS) {
      return;
    }

    // Get next job from queue
    const jobId = this.processingQueue.shift();
    if (!jobId) {
      return;
    }

    const job = this.jobs.get(jobId);
    if (!job) {
      log.warn(`Queued job ${jobId} not found in memory`);
      this.processNextJob();
      return;
    }

    // Check if job has exceeded max retries
    if (job.retryCount > job.maxRetries) {
      log.error(`Job ${jobId} exceeded max retries (${job.maxRetries})`);
      await this.updateJobStatus(jobId, 'failed', {
        lastError: 'Exceeded maximum retry attempts',
      });
      this.processNextJob();
      return;
    }

    this.activeJobs.add(jobId);

    // Start processing
    if (this.onJobReady) {
      log.info(`Processing job ${jobId}`);
      try {
        await this.onJobReady(job);
      } catch (error) {
        log.error(`Job ${jobId} processor error:`, error);
        await this.handleJobError(jobId, error);
      }
    } else {
      log.warn('No job processor registered');
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Handle job timeout
   */
  private async handleJobTimeout(
    jobId: string,
    reason: 'stall' | 'timeout'
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const message =
      reason === 'stall'
        ? 'Job stalled - no progress for 60 seconds'
        : 'Job exceeded maximum time limit (30 minutes)';

    log.error(`Job ${jobId} timeout: ${message}`);

    this.activeJobs.delete(jobId);

    // Retry if under limit
    if (job.retryCount < job.maxRetries) {
      job.retryCount++;
      job.status = 'queued';
      job.lastError = message;
      await saveJob(job);

      this.processingQueue.push(jobId);
      log.info(`Job ${jobId} re-queued for retry ${job.retryCount}`);
      this.emitProgress(job);
      this.processNextJob();
    } else {
      await this.updateJobStatus(jobId, 'failed', { lastError: message });
    }
  }

  /**
   * Handle job error from worker
   */
  async handleJobError(jobId: string, error: unknown): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    this.activeJobs.delete(jobId);
    timeoutManager.untrackJob(jobId);

    // Retry if under limit
    if (job.retryCount < job.maxRetries) {
      job.retryCount++;
      job.status = 'queued';
      job.lastError = errorMessage;
      await saveJob(job);

      this.processingQueue.push(jobId);
      log.info(`Job ${jobId} re-queued for retry ${job.retryCount}`);
      this.emitProgress(job);
      this.processNextJob();
    } else {
      await this.updateJobStatus(jobId, 'failed', { lastError: errorMessage });
    }
  }

  /**
   * Subscribe to job progress updates
   */
  subscribe(jobId: string, callback: JobProgressCallback): () => void {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, new Set());
    }
    this.subscribers.get(jobId)!.add(callback);

    // Send current state immediately
    const job = this.jobs.get(jobId);
    if (job) {
      callback(this.createProgressEvent(job));
    }

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(jobId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(jobId);
        }
      }
    };
  }

  /**
   * Emit progress to all subscribers
   */
  private emitProgress(job: RenderJob, message?: string): void {
    const progress = this.createProgressEvent(job, message);
    const subs = this.subscribers.get(job.jobId);

    if (subs) {
      for (const callback of subs) {
        try {
          callback(progress);
        } catch (error) {
          log.error('Subscriber callback error:', error);
        }
      }
    }

    // Also emit on EventEmitter for general listeners
    this.emit('progress', progress);
  }

  /**
   * Create a progress event from job state
   */
  private createProgressEvent(job: RenderJob, message?: string): JobProgress {
    const statusMessages: Record<JobStatus, string> = {
      pending: 'Initializing...',
      uploading: `Receiving frames (${job.frameManifest.receivedFrames}/${job.frameManifest.totalFrames || '?'})`,
      queued: `Queued for encoding (position ${this.processingQueue.indexOf(job.jobId) + 1})`,
      encoding: `Encoding frame ${job.currentFrame}/${job.frameManifest.totalFrames}`,
      complete: 'Export complete!',
      failed: job.lastError || 'Export failed',
    };

    return {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      message: message || statusMessages[job.status],
      currentFrame: job.currentFrame,
      totalFrames: job.frameManifest.totalFrames,
      error: job.status === 'failed' ? job.lastError : undefined,
    };
  }

  /**
   * Cleanup a completed job after retention period
   */
  private async cleanupCompletedJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'complete') return;

    // Only delete if no active subscribers
    if (!this.subscribers.has(jobId) || this.subscribers.get(jobId)!.size === 0) {
      this.jobs.delete(jobId);
      await deleteJob(jobId);
      log.debug(`Cleaned up completed job ${jobId}`);
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    pending: number;
    uploading: number;
    queued: number;
    encoding: number;
    complete: number;
    failed: number;
  } {
    const stats = {
      total: this.jobs.size,
      pending: 0,
      uploading: 0,
      queued: 0,
      encoding: 0,
      complete: 0,
      failed: 0,
    };

    for (const job of this.jobs.values()) {
      stats[job.status]++;
    }

    return stats;
  }

  /**
   * Shutdown the job queue
   */
  shutdown(): void {
    timeoutManager.stop();
    this.subscribers.clear();
    log.info('Job queue shutdown');
  }
}

// Export singleton instance
export const jobQueue = new JobQueueManager();
