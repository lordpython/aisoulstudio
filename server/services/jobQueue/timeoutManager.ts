/**
 * Timeout Manager - Heartbeat Monitoring
 *
 * Monitors active jobs for stalls and triggers timeouts.
 * Workers must send heartbeats every 5 seconds.
 * Jobs are killed after 60 seconds of silence.
 */

import { createLogger } from '../../../services/logger.js';
import { RenderJob, JobStatus } from '../../types/renderJob.js';

const log = createLogger('TimeoutManager');

// Configuration
const HEARTBEAT_INTERVAL_MS = 5000; // Workers send every 5s
const STALL_TIMEOUT_MS = 60000; // Kill after 60s silence
const MAX_JOB_TIME_MS = 30 * 60 * 1000; // 30 minute max job time
const CHECK_INTERVAL_MS = 5000; // How often to check for stalls

export type TimeoutCallback = (jobId: string, reason: 'stall' | 'timeout') => void;

interface TrackedJob {
  jobId: string;
  lastHeartbeat: number;
  startedAt: number;
}

export class TimeoutManager {
  private trackedJobs: Map<string, TrackedJob> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private onTimeout: TimeoutCallback | null = null;

  /**
   * Start the timeout manager
   */
  start(callback: TimeoutCallback): void {
    this.onTimeout = callback;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.checkForTimeouts();
    }, CHECK_INTERVAL_MS);

    log.info('Timeout manager started');
  }

  /**
   * Stop the timeout manager
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.trackedJobs.clear();
    log.info('Timeout manager stopped');
  }

  /**
   * Start tracking a job
   */
  trackJob(jobId: string): void {
    const now = Date.now();
    this.trackedJobs.set(jobId, {
      jobId,
      lastHeartbeat: now,
      startedAt: now,
    });
    log.debug(`Started tracking job ${jobId}`);
  }

  /**
   * Record a heartbeat for a job
   */
  recordHeartbeat(jobId: string): void {
    const tracked = this.trackedJobs.get(jobId);
    if (tracked) {
      tracked.lastHeartbeat = Date.now();
    }
  }

  /**
   * Stop tracking a job (completed or failed)
   */
  untrackJob(jobId: string): void {
    this.trackedJobs.delete(jobId);
    log.debug(`Stopped tracking job ${jobId}`);
  }

  /**
   * Check all tracked jobs for timeouts
   */
  private checkForTimeouts(): void {
    const now = Date.now();

    for (const [jobId, tracked] of this.trackedJobs) {
      // Check for stall (no heartbeat)
      const timeSinceHeartbeat = now - tracked.lastHeartbeat;
      if (timeSinceHeartbeat > STALL_TIMEOUT_MS) {
        log.warn(
          `Job ${jobId} stalled - no heartbeat for ${Math.round(timeSinceHeartbeat / 1000)}s`
        );
        this.triggerTimeout(jobId, 'stall');
        continue;
      }

      // Check for max job time
      const totalTime = now - tracked.startedAt;
      if (totalTime > MAX_JOB_TIME_MS) {
        log.warn(
          `Job ${jobId} exceeded max time - running for ${Math.round(totalTime / 60000)}m`
        );
        this.triggerTimeout(jobId, 'timeout');
      }
    }
  }

  /**
   * Trigger a timeout callback
   */
  private triggerTimeout(jobId: string, reason: 'stall' | 'timeout'): void {
    this.untrackJob(jobId);

    if (this.onTimeout) {
      this.onTimeout(jobId, reason);
    }
  }

  /**
   * Get tracking info for a job
   */
  getJobInfo(jobId: string): TrackedJob | undefined {
    return this.trackedJobs.get(jobId);
  }

  /**
   * Get all tracked jobs
   */
  getTrackedJobs(): TrackedJob[] {
    return Array.from(this.trackedJobs.values());
  }

  /**
   * Get configuration constants
   */
  getConfig(): {
    heartbeatIntervalMs: number;
    stallTimeoutMs: number;
    maxJobTimeMs: number;
  } {
    return {
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      stallTimeoutMs: STALL_TIMEOUT_MS,
      maxJobTimeMs: MAX_JOB_TIME_MS,
    };
  }
}

// Export singleton instance
export const timeoutManager = new TimeoutManager();
