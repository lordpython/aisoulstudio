/**
 * FFmpeg Worker Process
 *
 * Isolated process for running FFmpeg encoding.
 * Runs with memory limits and sends progress via IPC.
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { RenderJob, WorkerMessage, MainMessage } from '../types/renderJob.js';
import { TEMP_DIR } from '../utils/index.js';

const WORKER_ID = process.env.WORKER_ID || `worker_${process.pid}`;

// Memory monitoring
const MEMORY_WARNING_THRESHOLD = 1.5 * 1024 * 1024 * 1024; // 1.5GB
const MEMORY_CHECK_INTERVAL = 5000;
const HEARTBEAT_INTERVAL = 5000;

let currentJob: RenderJob | null = null;
let ffmpegProcess: ChildProcess | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let memoryCheckTimer: NodeJS.Timeout | null = null;
let isCancelled = false;

/**
 * Send message to parent process
 */
function sendMessage(msg: Omit<WorkerMessage, 'workerId' | 'timestamp'>): void {
  const fullMessage: WorkerMessage = {
    ...msg,
    workerId: WORKER_ID,
    timestamp: Date.now(),
  };

  if (process.send) {
    process.send(fullMessage);
  }
}

/**
 * Start heartbeat timer
 */
function startHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  heartbeatTimer = setInterval(() => {
    if (currentJob) {
      sendMessage({
        type: 'HEARTBEAT',
        jobId: currentJob.jobId,
      });
    }
  }, HEARTBEAT_INTERVAL);
}

/**
 * Start memory monitoring
 */
function startMemoryMonitoring(): void {
  if (memoryCheckTimer) {
    clearInterval(memoryCheckTimer);
  }

  memoryCheckTimer = setInterval(() => {
    const usage = process.memoryUsage();
    if (usage.heapUsed > MEMORY_WARNING_THRESHOLD) {
      sendMessage({
        type: 'MEMORY_WARNING',
        jobId: currentJob?.jobId || 'unknown',
        data: {
          memoryUsage: usage.heapUsed,
        },
      });
    }
  }, MEMORY_CHECK_INTERVAL);
}

/**
 * Stop all timers
 */
function stopTimers(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (memoryCheckTimer) {
    clearInterval(memoryCheckTimer);
    memoryCheckTimer = null;
  }
}

/**
 * Parse FFmpeg progress from stderr
 */
function parseFFmpegProgress(
  line: string,
  totalFrames: number
): { frame: number; speed: string } | null {
  // FFmpeg outputs: frame=  123 fps= 25 q=28.0 size=    1024kB time=00:00:05.00 bitrate=1677.5kbits/s speed=1.5x
  const frameMatch = line.match(/frame=\s*(\d+)/);
  const speedMatch = line.match(/speed=\s*([\d.]+)x/);

  if (frameMatch) {
    return {
      frame: parseInt(frameMatch[1], 10),
      speed: speedMatch ? speedMatch[1] + 'x' : 'N/A',
    };
  }

  return null;
}

/**
 * Build FFmpeg arguments
 */
function buildFFmpegArgs(job: RenderJob, sessionDir: string): string[] {
  const { config } = job;
  const encoder = config.encoder;

  const inputPattern = path.join(sessionDir, 'frame%06d.jpg');
  const audioPath = path.join(sessionDir, 'audio.mp3');
  const outputPath = path.join(sessionDir, 'output.mp4');

  const args: string[] = [
    '-framerate', String(config.fps),
    '-i', inputPattern,
  ];

  // Add audio if exists
  if (fs.existsSync(audioPath)) {
    args.push('-i', audioPath);
  }

  // Video encoder
  args.push('-c:v', encoder);

  // Encoder-specific settings (aligned with encoderStrategy.ts ENCODING_SPEC)
  const quality = config.quality || 21;
  switch (encoder) {
    case 'h264_nvenc':
      args.push(
        '-preset', 'p4',
        '-rc', 'vbr',
        '-cq', String(quality),
        '-b:v', '8M',
        '-maxrate', '12M',
        '-bufsize', '16M'
      );
      break;
    case 'h264_qsv':
      args.push(
        '-preset', 'medium',
        '-global_quality', String(quality),
        '-look_ahead', '1'
      );
      break;
    case 'h264_amf':
      args.push(
        '-quality', 'quality',
        '-rc', 'vbr_latency',
        '-qp_i', String(quality),
        '-qp_p', String(quality + 2)
      );
      break;
    case 'libx264':
    default: {
      const cpuCount = Math.max(2, os.cpus().length - 2);
      args.push(
        '-preset', 'fast',
        '-crf', String(quality),
        '-tune', 'film',
        '-threads', String(cpuCount)
      );
      break;
    }
  }

  // Color space standardization (BT.709)
  args.push(
    '-colorspace', 'bt709',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-pix_fmt', 'yuv420p'
  );

  // Audio settings
  if (fs.existsSync(audioPath)) {
    args.push(
      '-c:a', 'aac',
      '-b:a', '256k',
      '-shortest'
    );
  }

  // Output settings
  args.push(
    '-movflags', '+faststart',
    '-y',
    outputPath
  );

  return args;
}

/**
 * Process a render job
 */
async function processJob(job: RenderJob): Promise<void> {
  currentJob = job;
  isCancelled = false;

  const sessionDir = path.join(TEMP_DIR, job.sessionId);
  const outputPath = path.join(sessionDir, 'output.mp4');
  const totalFrames = job.frameManifest.totalFrames;

  console.log(`[${WORKER_ID}] Processing job ${job.jobId} (${totalFrames} frames)`);

  sendMessage({
    type: 'STARTED',
    jobId: job.jobId,
  });

  startHeartbeat();
  startMemoryMonitoring();

  try {
    // Validate session directory
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session directory not found: ${sessionDir}`);
    }

    // Build FFmpeg command
    const ffmpegArgs = buildFFmpegArgs(job, sessionDir);
    console.log(`[${WORKER_ID}] FFmpeg args:`, ffmpegArgs.join(' '));

    // Spawn FFmpeg
    ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let lastProgress = 0;

    // Handle stderr (FFmpeg outputs progress here)
    ffmpegProcess.stderr?.on('data', (data: Buffer) => {
      const line = data.toString();

      // Parse progress
      const progress = parseFFmpegProgress(line, totalFrames);
      if (progress) {
        const percent = Math.min(99, Math.round((progress.frame / totalFrames) * 100));

        // Only send progress updates every 1%
        if (percent > lastProgress) {
          lastProgress = percent;
          sendMessage({
            type: 'PROGRESS',
            jobId: job.jobId,
            data: {
              progress: percent,
              currentFrame: progress.frame,
              totalFrames,
              encodingSpeed: progress.speed,
            },
          });
        }
      }

      // Log errors
      if (line.toLowerCase().includes('error')) {
        console.error(`[${WORKER_ID}] FFmpeg error:`, line.trim());
      }
    });

    // Wait for FFmpeg to complete
    await new Promise<void>((resolve, reject) => {
      if (!ffmpegProcess) {
        reject(new Error('FFmpeg process not started'));
        return;
      }

      ffmpegProcess.on('close', (code) => {
        if (isCancelled) {
          reject(new Error('Job cancelled'));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      ffmpegProcess.on('error', (err) => {
        reject(err);
      });
    });

    // Verify output
    if (!fs.existsSync(outputPath)) {
      throw new Error('Output file not created');
    }

    const stats = fs.statSync(outputPath);
    console.log(
      `[${WORKER_ID}] Job ${job.jobId} complete - output size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`
    );

    sendMessage({
      type: 'COMPLETE',
      jobId: job.jobId,
      data: {
        outputPath,
        outputSize: stats.size,
        progress: 100,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${WORKER_ID}] Job ${job.jobId} failed:`, errorMessage);

    sendMessage({
      type: 'ERROR',
      jobId: job.jobId,
      data: {
        error: errorMessage,
      },
    });
  } finally {
    stopTimers();
    ffmpegProcess = null;
    currentJob = null;
  }
}

/**
 * Cancel current job
 */
function cancelJob(): void {
  if (ffmpegProcess && !isCancelled) {
    console.log(`[${WORKER_ID}] Cancelling job ${currentJob?.jobId}`);
    isCancelled = true;
    ffmpegProcess.kill('SIGTERM');
  }
}

/**
 * Handle shutdown
 */
function shutdown(): void {
  console.log(`[${WORKER_ID}] Shutting down...`);
  stopTimers();
  cancelJob();

  // Give time for cleanup
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

// Handle messages from parent
process.on('message', (msg: MainMessage) => {
  switch (msg.type) {
    case 'START_JOB':
      if (msg.job) {
        processJob(msg.job).catch((err) => {
          console.error(`[${WORKER_ID}] Unhandled error:`, err);
        });
      }
      break;

    case 'CANCEL_JOB':
      cancelJob();
      break;

    case 'SHUTDOWN':
      shutdown();
      break;
  }
});

// Handle process signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error(`[${WORKER_ID}] Uncaught exception:`, err);
  if (currentJob) {
    sendMessage({
      type: 'ERROR',
      jobId: currentJob.jobId,
      data: {
        error: `Uncaught exception: ${err.message}`,
      },
    });
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[${WORKER_ID}] Unhandled rejection:`, reason);
});

console.log(`[${WORKER_ID}] Worker started (PID: ${process.pid})`);
