/**
 * Render Job Type Definitions
 *
 * Interfaces for the job queue system that manages video encoding jobs.
 */

/**
 * Job status state machine:
 * pending → uploading → queued → encoding → complete
 *                                    ↓
 *                                 failed (with retry)
 */
export type JobStatus =
  | 'pending'
  | 'uploading'
  | 'queued'
  | 'encoding'
  | 'complete'
  | 'failed';

/**
 * Frame checksum for validation
 */
export interface FrameChecksum {
  frameIndex: number;
  checksum: string;
  size: number;
}

/**
 * Frame manifest tracks all frames for a job
 */
export interface FrameManifest {
  totalFrames: number;
  receivedFrames: number;
  checksums: Record<number, FrameChecksum>;
  validated: boolean;
  missingFrames: number[];
}

/**
 * Encoding configuration for a job
 */
export interface EncodingConfig {
  fps: number;
  encoder: 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'libx264';
  width?: number;
  height?: number;
  quality?: number; // CRF/CQ value (default: 21)
}

/**
 * Job progress information sent via SSE
 */
export interface JobProgress {
  jobId: string;
  status: JobStatus;
  progress: number; // 0-100
  message: string;
  currentFrame?: number;
  totalFrames?: number;
  encodingSpeed?: string; // e.g., "2.5x"
  estimatedTimeRemaining?: number; // seconds
  error?: string;
}

/**
 * Render job definition
 */
export interface RenderJob {
  jobId: string;
  sessionId: string;
  status: JobStatus;

  // Configuration
  config: EncodingConfig;

  // Frame tracking
  frameManifest: {
    totalFrames: number;
    receivedFrames: number;
    checksums: Record<number, FrameChecksum>;
    validated: boolean;
    missingFrames: number[];
  };

  // Progress
  progress: number;
  currentFrame: number;

  // Timing
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  lastHeartbeat?: number;

  // Worker info
  workerId?: string;

  // Retry handling
  retryCount: number;
  maxRetries: number;
  lastError?: string;

  // Output
  outputPath?: string;
  outputSize?: number;
}

/**
 * Worker-to-main process message types
 */
export type WorkerMessageType =
  | 'STARTED'
  | 'PROGRESS'
  | 'HEARTBEAT'
  | 'COMPLETE'
  | 'ERROR'
  | 'MEMORY_WARNING';

export interface WorkerMessage {
  type: WorkerMessageType;
  jobId: string;
  workerId: string;
  timestamp: number;
  data?: {
    progress?: number;
    currentFrame?: number;
    totalFrames?: number;
    encodingSpeed?: string;
    outputPath?: string;
    outputSize?: number;
    error?: string;
    memoryUsage?: number;
  };
}

/**
 * Main-to-worker message types
 */
export type MainMessageType =
  | 'START_JOB'
  | 'CANCEL_JOB'
  | 'SHUTDOWN';

export interface MainMessage {
  type: MainMessageType;
  job?: RenderJob;
}

/**
 * Job queue subscription callback
 */
export type JobProgressCallback = (progress: JobProgress) => void;

/**
 * Serializable version of RenderJob for JSON storage
 */
export interface SerializedRenderJob extends Omit<RenderJob, 'frameManifest'> {
  frameManifest: {
    totalFrames: number;
    receivedFrames: number;
    checksums: Record<string, FrameChecksum>;
    validated: boolean;
    missingFrames: number[];
  };
}

/**
 * Create a new render job
 */
export function createRenderJob(
  sessionId: string,
  config: Partial<EncodingConfig> = {}
): RenderJob {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  return {
    jobId,
    sessionId,
    status: 'pending',
    config: {
      fps: config.fps ?? 24,
      encoder: config.encoder ?? 'libx264',
      width: config.width,
      height: config.height,
      quality: config.quality ?? 21,
    },
    frameManifest: {
      totalFrames: 0,
      receivedFrames: 0,
      checksums: {},
      validated: false,
      missingFrames: [],
    },
    progress: 0,
    currentFrame: 0,
    createdAt: Date.now(),
    retryCount: 0,
    maxRetries: 3,
  };
}

/**
 * Serialize a job for JSON storage
 */
export function serializeJob(job: RenderJob): SerializedRenderJob {
  return {
    ...job,
    frameManifest: {
      ...job.frameManifest,
      checksums: Object.fromEntries(
        Object.entries(job.frameManifest.checksums)
      ),
    },
  };
}

/**
 * Deserialize a job from JSON storage
 */
export function deserializeJob(data: SerializedRenderJob): RenderJob {
  return {
    ...data,
    frameManifest: {
      ...data.frameManifest,
      checksums: Object.fromEntries(
        Object.entries(data.frameManifest.checksums).map(([k, v]) => [parseInt(k), v])
      ),
    },
  };
}
