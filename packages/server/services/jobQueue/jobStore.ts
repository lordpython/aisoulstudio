/**
 * Job Store - File-based Job Persistence
 *
 * Stores render jobs to disk for durability across server restarts.
 * Jobs are stored as JSON files in temp/jobs/{jobId}.json
 */

import fs from 'fs';
import path from 'path';
import { createLogger } from '@studio/shared/src/services/logger.js';
import { TEMP_DIR } from '../../utils/index.js';
import {
  RenderJob,
  SerializedRenderJob,
  serializeJob,
  deserializeJob,
} from '../../types/renderJob.js';

const log = createLogger('JobStore');

// Jobs directory
const JOBS_DIR = path.join(TEMP_DIR, 'jobs');

/**
 * Ensure jobs directory exists
 */
export function ensureJobsDir(): void {
  if (!fs.existsSync(JOBS_DIR)) {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
    log.info(`Created jobs directory: ${JOBS_DIR}`);
  }
}

/**
 * Get job file path
 */
function getJobPath(jobId: string): string {
  // Sanitize jobId to prevent path traversal
  const safeId = jobId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(JOBS_DIR, `${safeId}.json`);
}

/**
 * Save a job to disk
 */
export async function saveJob(job: RenderJob): Promise<void> {
  ensureJobsDir();
  const jobPath = getJobPath(job.jobId);

  try {
    const serialized = serializeJob(job);
    await fs.promises.writeFile(
      jobPath,
      JSON.stringify(serialized, null, 2),
      'utf-8'
    );
    log.debug(`Saved job ${job.jobId} to disk`);
  } catch (error) {
    log.error(`Failed to save job ${job.jobId}:`, error);
    throw error;
  }
}

/**
 * Load a job from disk
 */
export async function loadJob(jobId: string): Promise<RenderJob | null> {
  const jobPath = getJobPath(jobId);

  try {
    if (!fs.existsSync(jobPath)) {
      return null;
    }

    const content = await fs.promises.readFile(jobPath, 'utf-8');
    const data = JSON.parse(content) as SerializedRenderJob;
    return deserializeJob(data);
  } catch (error) {
    log.error(`Failed to load job ${jobId}:`, error);
    return null;
  }
}

/**
 * Delete a job from disk
 */
export async function deleteJob(jobId: string): Promise<void> {
  const jobPath = getJobPath(jobId);

  try {
    if (fs.existsSync(jobPath)) {
      await fs.promises.unlink(jobPath);
      log.debug(`Deleted job ${jobId} from disk`);
    }
  } catch (error) {
    log.error(`Failed to delete job ${jobId}:`, error);
  }
}

/**
 * List all persisted jobs
 */
export async function listJobs(): Promise<RenderJob[]> {
  ensureJobsDir();

  try {
    const files = await fs.promises.readdir(JOBS_DIR);
    const jobs: RenderJob[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const jobId = file.replace('.json', '');
      const job = await loadJob(jobId);
      if (job) {
        jobs.push(job);
      }
    }

    return jobs;
  } catch (error) {
    log.error('Failed to list jobs:', error);
    return [];
  }
}

/**
 * Load all incomplete jobs (for recovery after restart)
 */
export async function loadIncompleteJobs(): Promise<RenderJob[]> {
  const jobs = await listJobs();
  return jobs.filter(
    (job) =>
      job.status !== 'complete' &&
      job.status !== 'failed'
  );
}

/**
 * Clean up old completed/failed jobs (older than maxAgeHours)
 */
export async function cleanupOldJobs(maxAgeHours: number = 24): Promise<number> {
  const jobs = await listJobs();
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let cleaned = 0;

  for (const job of jobs) {
    // Only clean up completed or failed jobs older than cutoff
    if (
      (job.status === 'complete' || job.status === 'failed') &&
      job.createdAt < cutoff
    ) {
      await deleteJob(job.jobId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    log.info(`Cleaned up ${cleaned} old jobs`);
  }

  return cleaned;
}

/**
 * Update specific fields of a job
 */
export async function updateJob(
  jobId: string,
  updates: Partial<RenderJob>
): Promise<RenderJob | null> {
  const job = await loadJob(jobId);
  if (!job) {
    log.warn(`Attempted to update non-existent job ${jobId}`);
    return null;
  }

  const updated = { ...job, ...updates };
  await saveJob(updated);
  return updated;
}
