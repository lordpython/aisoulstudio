/**
 * Worker Pool Manager
 *
 * Manages a pool of FFmpeg worker processes for isolated video encoding.
 * Each worker runs in its own process with memory limits.
 */

import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../../services/logger.js';
import { RenderJob, WorkerMessage, MainMessage } from '../types/renderJob.js';

const log = createLogger('WorkerPool');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const MAX_WORKERS = 2; // Maximum concurrent worker processes
const WORKER_MEMORY_LIMIT_MB = 2048; // 2GB per worker
const WORKER_RESTART_DELAY_MS = 1000;

export type WorkerEventCallback = (message: WorkerMessage) => void;

interface WorkerInfo {
  process: ChildProcess;
  workerId: string;
  currentJobId: string | null;
  startedAt: number;
  memoryUsage: number;
  isHealthy: boolean;
}

export class WorkerPool {
  private workers: Map<string, WorkerInfo> = new Map();
  private pendingJobs: RenderJob[] = [];
  private onWorkerMessage: WorkerEventCallback | null = null;
  private workerScript: string;
  private isShuttingDown = false;

  constructor() {
    // Worker script path (TypeScript, executed via tsx)
    this.workerScript = path.join(__dirname, 'ffmpegWorker.ts');
  }

  /**
   * Set callback for worker messages
   */
  setMessageHandler(handler: WorkerEventCallback): void {
    this.onWorkerMessage = handler;
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    log.info(`Worker pool initializing (max ${MAX_WORKERS} workers, ${WORKER_MEMORY_LIMIT_MB}MB limit each)`);

    // Pre-spawn one worker for faster first job
    await this.spawnWorker();
  }

  /**
   * Spawn a new worker process
   */
  private async spawnWorker(): Promise<WorkerInfo | null> {
    if (this.isShuttingDown) return null;
    if (this.workers.size >= MAX_WORKERS) {
      log.debug('Worker pool at capacity');
      return null;
    }

    const workerId = `worker_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    try {
      const worker = fork(this.workerScript, [], {
        execArgv: ['--import', 'tsx', `--max-old-space-size=${WORKER_MEMORY_LIMIT_MB}`],
        env: {
          ...process.env,
          WORKER_ID: workerId,
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      });

      const workerInfo: WorkerInfo = {
        process: worker,
        workerId,
        currentJobId: null,
        startedAt: Date.now(),
        memoryUsage: 0,
        isHealthy: true,
      };

      // Handle worker messages
      worker.on('message', (msg: WorkerMessage) => {
        this.handleWorkerMessage(workerId, msg);
      });

      // Handle worker stdout/stderr
      worker.stdout?.on('data', (data) => {
        log.debug(`[${workerId}] ${data.toString().trim()}`);
      });

      worker.stderr?.on('data', (data) => {
        log.warn(`[${workerId}] stderr: ${data.toString().trim()}`);
      });

      // Handle worker exit
      worker.on('exit', (code, signal) => {
        this.handleWorkerExit(workerId, code, signal);
      });

      // Handle worker errors
      worker.on('error', (err) => {
        log.error(`Worker ${workerId} error:`, err);
        workerInfo.isHealthy = false;
      });

      this.workers.set(workerId, workerInfo);
      log.info(`Spawned worker ${workerId} (${this.workers.size}/${MAX_WORKERS})`);

      return workerInfo;
    } catch (error) {
      log.error('Failed to spawn worker:', error);
      return null;
    }
  }

  /**
   * Handle messages from workers
   */
  private handleWorkerMessage(workerId: string, msg: WorkerMessage): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // Update worker state
    switch (msg.type) {
      case 'STARTED':
        worker.currentJobId = msg.jobId;
        break;

      case 'PROGRESS':
      case 'HEARTBEAT':
        // Worker is alive
        break;

      case 'MEMORY_WARNING':
        if (msg.data?.memoryUsage) {
          worker.memoryUsage = msg.data.memoryUsage;
          log.warn(
            `Worker ${workerId} memory warning: ${Math.round(worker.memoryUsage / 1024 / 1024)}MB`
          );
        }
        break;

      case 'COMPLETE':
        worker.currentJobId = null;
        // Worker is now free for next job
        this.processNextPendingJob();
        break;

      case 'ERROR':
        worker.currentJobId = null;
        worker.isHealthy = false;
        // Worker may need restart
        this.processNextPendingJob();
        break;
    }

    // Forward to external handler
    if (this.onWorkerMessage) {
      this.onWorkerMessage(msg);
    }
  }

  /**
   * Handle worker process exit
   */
  private handleWorkerExit(
    workerId: string,
    code: number | null,
    signal: NodeJS.Signals | null
  ): void {
    const worker = this.workers.get(workerId);
    const jobId = worker?.currentJobId;

    this.workers.delete(workerId);
    log.warn(
      `Worker ${workerId} exited (code=${code}, signal=${signal}), ${this.workers.size} workers remaining`
    );

    // If worker was processing a job, notify error
    if (jobId && this.onWorkerMessage) {
      this.onWorkerMessage({
        type: 'ERROR',
        jobId,
        workerId,
        timestamp: Date.now(),
        data: {
          error: `Worker process terminated unexpectedly (code=${code}, signal=${signal})`,
        },
      });
    }

    // Restart worker if not shutting down
    if (!this.isShuttingDown) {
      setTimeout(() => {
        this.spawnWorker().then(() => {
          this.processNextPendingJob();
        });
      }, WORKER_RESTART_DELAY_MS);
    }
  }

  /**
   * Submit a job to an available worker
   */
  async submitJob(job: RenderJob): Promise<boolean> {
    // Find available worker
    let availableWorker: WorkerInfo | null = null;

    for (const worker of this.workers.values()) {
      if (!worker.currentJobId && worker.isHealthy) {
        availableWorker = worker;
        break;
      }
    }

    // Spawn new worker if needed
    if (!availableWorker && this.workers.size < MAX_WORKERS) {
      availableWorker = await this.spawnWorker();
    }

    // If no worker available, queue the job
    if (!availableWorker) {
      this.pendingJobs.push(job);
      log.debug(`Job ${job.jobId} queued - no workers available`);
      return true;
    }

    // Send job to worker
    return this.sendJobToWorker(availableWorker, job);
  }

  /**
   * Send a job to a specific worker
   */
  private sendJobToWorker(worker: WorkerInfo, job: RenderJob): boolean {
    const message: MainMessage = {
      type: 'START_JOB',
      job,
    };

    try {
      worker.process.send(message);
      worker.currentJobId = job.jobId;
      log.info(`Job ${job.jobId} sent to worker ${worker.workerId}`);
      return true;
    } catch (error) {
      log.error(`Failed to send job to worker ${worker.workerId}:`, error);
      worker.isHealthy = false;
      return false;
    }
  }

  /**
   * Process the next pending job if a worker is available
   */
  private processNextPendingJob(): void {
    if (this.pendingJobs.length === 0) return;

    // Find available worker
    for (const worker of this.workers.values()) {
      if (!worker.currentJobId && worker.isHealthy) {
        const job = this.pendingJobs.shift();
        if (job) {
          this.sendJobToWorker(worker, job);
        }
        break;
      }
    }
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    // Remove from pending queue
    const pendingIndex = this.pendingJobs.findIndex((j) => j.jobId === jobId);
    if (pendingIndex !== -1) {
      this.pendingJobs.splice(pendingIndex, 1);
      return true;
    }

    // Find worker processing this job
    for (const worker of this.workers.values()) {
      if (worker.currentJobId === jobId) {
        const message: MainMessage = { type: 'CANCEL_JOB' };
        try {
          worker.process.send(message);
          return true;
        } catch {
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalWorkers: number;
    activeWorkers: number;
    idleWorkers: number;
    pendingJobs: number;
    unhealthyWorkers: number;
  } {
    let active = 0;
    let idle = 0;
    let unhealthy = 0;

    for (const worker of this.workers.values()) {
      if (!worker.isHealthy) {
        unhealthy++;
      } else if (worker.currentJobId) {
        active++;
      } else {
        idle++;
      }
    }

    return {
      totalWorkers: this.workers.size,
      activeWorkers: active,
      idleWorkers: idle,
      pendingJobs: this.pendingJobs.length,
      unhealthyWorkers: unhealthy,
    };
  }

  /**
   * Shutdown the worker pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    log.info('Shutting down worker pool...');

    const shutdownPromises: Promise<void>[] = [];

    for (const worker of this.workers.values()) {
      shutdownPromises.push(
        new Promise((resolve) => {
          // Send shutdown message
          try {
            const message: MainMessage = { type: 'SHUTDOWN' };
            worker.process.send(message);
          } catch {
            // Ignore send errors
          }

          // Give worker time to gracefully exit
          const timeout = setTimeout(() => {
            worker.process.kill('SIGTERM');
            resolve();
          }, 5000);

          worker.process.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        })
      );
    }

    await Promise.all(shutdownPromises);
    this.workers.clear();
    this.pendingJobs = [];
    log.info('Worker pool shutdown complete');
  }
}

// Export singleton instance
export const workerPool = new WorkerPool();
