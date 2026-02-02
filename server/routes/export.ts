import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { sanitizeId, getSessionDir, cleanupSession, MAX_FILE_SIZE, MAX_FILES } from '../utils/index.js';
import { createLogger } from '../../services/logger.js';

const exportLog = createLogger('Export');
const ffmpegLog = createLogger('FFmpeg');

const router = Router();

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

    const ffmpegArgs = [
      '-framerate', String(fps),
      '-i', path.join(sessionDir, 'frame%06d.jpg'),
      '-i', audioPath,
      '-c:v', 'libx264',
      '-preset', 'fast',        // Better compression than 'veryfast', still fast
      '-crf', '21',             // Higher quality (lower = better, 18-23 is good range)
      '-tune', 'film',          // Optimize for cinematic content
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '256k',           // Higher audio quality
      '-shortest',
      '-movflags', '+faststart',
      '-y',
      outputPath
    ];

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
