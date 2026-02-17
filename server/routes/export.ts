import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { sanitizeId, getSessionDir, cleanupSession, MAX_FILE_SIZE, MAX_SINGLE_FILE, MAX_FILES, generateJobId } from '../utils/index.js';
import { createLogger } from '../../services/logger.js';
import { jobQueue } from '../services/jobQueue/index.js';
import { getSelectedEncoder, getEncoderInfo, getEncoderArgs, ENCODING_SPEC } from '../services/encoding/encoderStrategy.js';
import { validateSessionFrames, validateFrameSizes } from '../services/validation/frameValidator.js';
import { verifyOutputQuality, quickValidate } from '../services/validation/qualityVerifier.js';
import { RenderJob, JobProgress, FrameChecksum } from '../types/renderJob.js';

const exportLog = createLogger('Export');
const ffmpegLog = createLogger('FFmpeg');

const router = Router();

// Encoder selection is handled by encoderStrategy.ts (initialized in server/index.ts)

// Types
interface ExportRequest extends Request {
  sessionId?: string;
  jobId?: string;
  files?: Express.Multer.File[];
}

// Track active jobs by session
const sessionJobs = new Map<string, string>();

// Multer Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const request = req as ExportRequest;
    let sessionId = (req.query.sessionId as string) || (req.headers['x-session-id'] as string);

    if (!sessionId && request.sessionId) {
      sessionId = request.sessionId;
    }

    if (!sessionId) {
      sessionId = Date.now().toString();
      request.sessionId = sessionId;
    }

    sessionId = sanitizeId(sessionId);
    request.sessionId = sessionId;

    const sessionDir = getSessionDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    cb(null, sessionDir);
  },
  filename: (_req, file, cb) => {
    if (file.fieldname === 'audio') {
      cb(null, 'audio.mp3');
    } else {
      cb(null, path.basename(file.originalname));
    }
  }
});

// Separate upload configurations for different endpoints
const uploadAudio = multer({
  storage,
  limits: { fileSize: MAX_SINGLE_FILE }
});

const uploadFrames = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES }
});

/**
 * Initialize Export Session
 * Receives the audio file and creates the session directory.
 * Now also creates a job in the queue.
 */
router.post('/init', uploadAudio.single('audio'), async (req: Request, res: Response) => {
  try {
    const request = req as ExportRequest;
    if (!request.sessionId) {
      throw new Error('Failed to generate session ID');
    }

    const { totalFrames, fps = 24 } = req.body;

    // Create a job for this session
    const job = await jobQueue.createJob(request.sessionId, {
      fps: parseInt(fps, 10),
      encoder: getSelectedEncoder(),
    });

    // Track session → job mapping
    sessionJobs.set(request.sessionId, job.jobId);

    // Set total frames if provided
    if (totalFrames) {
      jobQueue.setTotalFrames(job.jobId, parseInt(totalFrames, 10));
    }

    exportLog.info(`Session initialized: ${request.sessionId}, job: ${job.jobId}`);
    res.json({
      success: true,
      sessionId: request.sessionId,
      jobId: job.jobId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    exportLog.error('Session init error:', error);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * Upload Chunk of Frames
 * Receives a batch of images. Multer handles saving them to the session directory.
 * Now also tracks frame counts and optional checksums.
 */
router.post('/chunk', uploadFrames.array('frames'), (req: Request, res: Response) => {
  const request = req as ExportRequest;
  if (!request.sessionId) {
    res.status(400).json({ success: false, error: 'Session ID required' });
    return;
  }

  const count = request.files?.length || 0;
  const { checksums } = req.body;

  // Get job for this session
  const jobId = sessionJobs.get(request.sessionId);
  if (jobId) {
    // Parse checksums if provided
    let parsedChecksums: FrameChecksum[] | undefined;
    if (checksums) {
      try {
        parsedChecksums = JSON.parse(checksums);
      } catch {
        // Ignore checksum parsing errors
      }
    }

    jobQueue.registerFrames(jobId, count, parsedChecksums);
  }

  res.json({ success: true, count });
});

/**
 * Finalize Export (Async Version)
 * Queues the job for encoding and returns immediately.
 * Client should subscribe to SSE for progress.
 */
router.post('/finalize', async (req: Request, res: Response) => {
  const { sessionId: rawSessionId, fps = 24, totalFrames, sync = false } = req.body;

  if (!rawSessionId) {
    res.status(400).json({ error: 'Missing sessionId' });
    return;
  }

  const sessionId = sanitizeId(rawSessionId);
  const sessionDir = getSessionDir(sessionId);

  if (!fs.existsSync(sessionDir)) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Get or create job
  let jobId = sessionJobs.get(sessionId);
  let job: RenderJob | undefined;

  if (jobId) {
    job = jobQueue.getJob(jobId);
  }

  if (!job) {
    // Create job if it doesn't exist (legacy client support)
    job = await jobQueue.createJob(sessionId, {
      fps: parseInt(fps, 10),
      encoder: getSelectedEncoder(),
    });
    jobId = job.jobId;
    sessionJobs.set(sessionId, jobId);
  }

  // Set total frames
  if (totalFrames) {
    jobQueue.setTotalFrames(jobId!, parseInt(totalFrames, 10));
  }

  // Validate frames before encoding
  const frameCount = job.frameManifest.totalFrames || parseInt(totalFrames, 10) || 0;
  if (frameCount > 0) {
    const sequenceResult = await validateSessionFrames(sessionDir, frameCount);
    if (!sequenceResult.valid && sequenceResult.missingFrames.length > 0) {
      res.status(400).json({
        error: 'Frame validation failed',
        missingFrames: sequenceResult.missingFrames.slice(0, 10),
        totalMissing: sequenceResult.missingFrames.length,
      });
      return;
    }

    const sizeResult = await validateFrameSizes(sessionDir);
    if (!sizeResult.valid) {
      res.status(400).json({
        error: 'Some frames appear corrupted',
        undersizedFrames: sizeResult.undersizedFrames.slice(0, 10),
      });
      return;
    }
  }

  exportLog.info(`Queuing job ${jobId} for encoding (${frameCount} frames, ${fps} FPS)`);

  // For backward compatibility: if sync=true, use the old synchronous approach
  if (sync === true || sync === 'true') {
    // Legacy synchronous encoding
    return handleSyncFinalize(req, res, sessionId, sessionDir, fps);
  }

  // Queue job for async processing
  try {
    await jobQueue.queueJob(jobId!);

    res.json({
      success: true,
      jobId,
      status: 'queued',
      message: 'Job queued for encoding. Subscribe to /api/export/events/:jobId for progress.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    exportLog.error('Failed to queue job:', error);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * Legacy synchronous finalize (for backward compatibility)
 */
async function handleSyncFinalize(
  req: Request,
  res: Response,
  sessionId: string,
  sessionDir: string,
  fps: number
): Promise<void> {
  const audioPath = path.join(sessionDir, 'audio.mp3');
  const outputPath = path.join(sessionDir, 'output.mp4');

  exportLog.info(`Finalizing session ${sessionId} at ${fps} FPS (sync mode)`);
  const startTime = Date.now();

  try {
    if (!fs.existsSync(audioPath)) {
      throw new Error('Audio file missing in session');
    }

    const encoder = getSelectedEncoder();
    const encoderArgs = getEncoderArgs(encoder);

    const ffmpegArgs = [
      '-framerate', String(fps),
      '-i', path.join(sessionDir, 'frame%06d.jpg'),
      '-i', audioPath,
      ...encoderArgs,
      '-c:a', 'aac',
      '-b:a', '256k',
      '-shortest',
      '-movflags', '+faststart',
      '-y',
      outputPath
    ];

    exportLog.info(`Using encoder: ${encoder} (${encoder !== 'libx264' ? 'GPU' : 'CPU'})`);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      let stderrOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        stderrOutput += msg;
        if (msg.includes('frame=') || msg.includes('error') || msg.includes('Error')) {
          ffmpegLog.debug(msg.trim());
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });

      ffmpeg.on('error', (err) => reject(err));
    });

    exportLog.info(`FFmpeg completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    const stat = fs.statSync(outputPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);

    const readStream = fs.createReadStream(outputPath);
    readStream.pipe(res);

    readStream.on('close', () => {
      cleanupSession(sessionId);
      sessionJobs.delete(sessionId);
    });

    readStream.on('error', (err) => {
      exportLog.error('Stream error:', err);
      cleanupSession(sessionId);
      sessionJobs.delete(sessionId);
      if (!res.headersSent) res.status(500).end();
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    exportLog.error('Export error:', error);
    cleanupSession(sessionId);
    sessionJobs.delete(sessionId);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: message });
    }
  }
}

/**
 * Get Job Status
 * Returns current status of a job.
 */
router.get('/status/:jobId', (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = jobQueue.getJob(jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const progress: JobProgress = {
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    message: getStatusMessage(job),
    currentFrame: job.currentFrame,
    totalFrames: job.frameManifest.totalFrames,
    error: job.lastError,
  };

  res.json(progress);
});

/**
 * SSE Events Endpoint
 * Streams progress updates for a job.
 */
router.get('/events/:jobId', (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = jobQueue.getJob(jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial state
  const sendProgress = (progress: JobProgress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  };

  // Subscribe to job updates
  const unsubscribe = jobQueue.subscribe(jobId, (progress) => {
    sendProgress(progress);

    // Close connection on terminal states
    if (progress.status === 'complete' || progress.status === 'failed') {
      setTimeout(() => {
        res.end();
      }, 100);
    }
  });

  // Handle client disconnect
  req.on('close', () => {
    unsubscribe();
    exportLog.debug(`SSE client disconnected for job ${jobId}`);
  });

  // Keep-alive ping every 30 seconds
  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

/**
 * Download completed video
 */
router.get('/download/:jobId', (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = jobQueue.getJob(jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status !== 'complete') {
    res.status(400).json({ error: 'Job not complete', status: job.status });
    return;
  }

  const outputPath = job.outputPath || path.join(getSessionDir(job.sessionId), 'output.mp4');

  if (!fs.existsSync(outputPath)) {
    res.status(404).json({ error: 'Output file not found' });
    return;
  }

  const stat = fs.statSync(outputPath);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="export-${job.sessionId}.mp4"`);

  const readStream = fs.createReadStream(outputPath);
  readStream.pipe(res);

  readStream.on('close', () => {
    // Cleanup after download
    cleanupSession(job.sessionId);
    sessionJobs.delete(job.sessionId);
  });

  readStream.on('error', (err) => {
    exportLog.error('Download stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream file' });
    }
  });
});

/**
 * Cancel a job
 */
router.post('/cancel/:jobId', async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = jobQueue.getJob(jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status === 'complete' || job.status === 'failed') {
    res.status(400).json({ error: 'Cannot cancel completed job' });
    return;
  }

  // Update job status
  await jobQueue.updateJobStatus(jobId, 'failed', {
    lastError: 'Cancelled by user',
  });

  // Cleanup session
  cleanupSession(job.sessionId);
  sessionJobs.delete(job.sessionId);

  res.json({ success: true, message: 'Job cancelled' });
});

/**
 * Get queue statistics
 */
router.get('/stats', (_req: Request, res: Response) => {
  const stats = jobQueue.getStats();
  const encoderInfo = getEncoderInfo();

  res.json({
    queue: stats,
    encoder: encoderInfo,
  });
});

/**
 * Get status message for a job
 */
function getStatusMessage(job: RenderJob): string {
  switch (job.status) {
    case 'pending':
      return 'Initializing...';
    case 'uploading':
      return `Receiving frames (${job.frameManifest.receivedFrames}/${job.frameManifest.totalFrames || '?'})`;
    case 'queued':
      return 'Queued for encoding...';
    case 'encoding':
      return `Encoding frame ${job.currentFrame}/${job.frameManifest.totalFrames}`;
    case 'complete':
      return 'Export complete!';
    case 'failed':
      return job.lastError || 'Export failed';
    default:
      return 'Unknown status';
  }
}

export default router;
