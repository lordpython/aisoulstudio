import { Router, Request, Response } from 'express';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import multer from 'multer';
import { sanitizeId, getSessionDir, cleanupSession, MAX_FILE_SIZE, MAX_FILES } from '../utils/index.js';
import { createLogger } from '../../services/logger.js';

const exportLog = createLogger('Export');
const ffmpegLog = createLogger('FFmpeg');

const router = Router();

// Detect available hardware encoders
let hwEncoder: 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'libx264' = 'libx264';

function detectHardwareEncoder(): void {
  try {
    const encoders = execSync('ffmpeg -encoders 2>&1', { encoding: 'utf-8' });

    // Check for NVIDIA NVENC (fastest)
    if (encoders.includes('h264_nvenc')) {
      hwEncoder = 'h264_nvenc';
      exportLog.info('✓ Hardware acceleration: NVIDIA NVENC detected');
      return;
    }

    // Check for Intel Quick Sync
    if (encoders.includes('h264_qsv')) {
      hwEncoder = 'h264_qsv';
      exportLog.info('✓ Hardware acceleration: Intel QSV detected');
      return;
    }

    // Check for AMD AMF
    if (encoders.includes('h264_amf')) {
      hwEncoder = 'h264_amf';
      exportLog.info('✓ Hardware acceleration: AMD AMF detected');
      return;
    }

    exportLog.info('No hardware encoder found, using libx264 (CPU)');
  } catch {
    exportLog.warn('Could not detect FFmpeg encoders, using libx264');
  }
}

// Detect on startup
detectHardwareEncoder();

// Get optimal thread count (leave 2 cores for system)
const cpuCount = os.cpus().length;
const threadCount = Math.max(2, cpuCount - 2);

// Types
interface ExportRequest extends Request {
  sessionId?: string;
  files?: Express.Multer.File[];
}

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

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES }
});

/**
 * Initialize Export Session
 * Receives the audio file and creates the session directory.
 */
router.post('/init', upload.single('audio'), (req: Request, res: Response) => {
  try {
    const request = req as ExportRequest;
    if (!request.sessionId) {
      throw new Error('Failed to generate session ID');
    }
    exportLog.info(`Session initialized: ${request.sessionId}`);
    res.json({ success: true, sessionId: request.sessionId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    exportLog.error('Session init error:', error);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * Upload Chunk of Frames
 * Receives a batch of images. Multer handles saving them to the session directory.
 */
router.post('/chunk', upload.array('frames'), (req: Request, res: Response) => {
  const request = req as ExportRequest;
  if (!request.sessionId) {
    res.status(400).json({ success: false, error: 'Session ID required' });
    return;
  }

  const count = request.files?.length || 0;
  res.json({ success: true, count });
});

/**
 * Finalize Export
 * Triggers FFmpeg to stitch images and audio into a video.
 */
router.post('/finalize', async (req: Request, res: Response) => {
  const { sessionId: rawSessionId, fps = 30 } = req.body;

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

  const audioPath = path.join(sessionDir, 'audio.mp3');
  const outputPath = path.join(sessionDir, 'output.mp4');

  exportLog.info(`Finalizing session ${sessionId} at ${fps} FPS`);
  const startTime = Date.now();

  try {
    if (!fs.existsSync(audioPath)) {
      throw new Error('Audio file missing in session');
    }

    // Build FFmpeg args with hardware encoding (not decoding - we're using image sequences)
    // Note: -hwaccel flags are for video decoding, not image sequences
    const useHwAccel = hwEncoder !== 'libx264';

    const ffmpegArgs = [
      '-framerate', String(fps),
      '-i', path.join(sessionDir, 'frame%06d.jpg'),
      '-i', audioPath,
      '-c:v', hwEncoder,                       // Use detected encoder (NVENC/QSV/AMF/libx264)
      ...(useHwAccel ? [
        // Hardware encoder settings (NVENC/QSV/AMF)
        '-preset', 'p4',                       // NVENC preset (p1=fastest, p7=best quality)
        '-rc', 'vbr',                          // Variable bitrate
        '-cq', '21',                           // Constant quality (like CRF)
        '-b:v', '8M',                          // Target bitrate
        '-maxrate', '12M',                     // Max bitrate
        '-bufsize', '16M',                     // Buffer size
      ] : [
        // Software encoder settings (libx264)
        '-preset', 'fast',
        '-crf', '21',
        '-tune', 'film',
        '-threads', String(threadCount),       // Use multiple CPU cores
      ]),
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '256k',
      '-shortest',
      '-movflags', '+faststart',
      '-y',
      outputPath
    ];

    exportLog.info(`Using encoder: ${hwEncoder} (${useHwAccel ? 'GPU' : `CPU ${threadCount} threads`})`);

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
    });

    readStream.on('error', (err) => {
      exportLog.error('Stream error:', err);
      cleanupSession(sessionId);
      if (!res.headersSent) res.status(500).end();
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    exportLog.error('Export error:', error);
    cleanupSession(sessionId);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: message });
    }
  }
});

export default router;
