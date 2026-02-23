import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getSessionDir, cleanupSession } from '../utils/index.js';
import { createLogger } from '@studio/shared/src/services/logger.js';

const importLog = createLogger('Import');

const router = Router();

/**
 * Import from YouTube
 * Downloads audio from a YouTube URL using yt-dlp and streams it back.
 */
router.post('/youtube', async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ error: 'Missing YouTube URL' });
    return;
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  const sessionId = Date.now().toString();
  const sessionDir = getSessionDir(sessionId);

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const outputTemplate = path.join(sessionDir, 'audio.%(ext)s');
  const finalAudioPath = path.join(sessionDir, 'audio.mp3');

  importLog.info(`YouTube: Downloading: ${url}`);

  const args = [
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '-o', outputTemplate,
    url
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      const ytdlp = spawn('yt-dlp', args);

      ytdlp.stderr.on('data', (data) => importLog.debug(`yt-dlp: ${data}`));

      ytdlp.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });

      ytdlp.on('error', (err) => reject(err));
    });

    if (!fs.existsSync(finalAudioPath)) {
      throw new Error('Download failed, file not found');
    }

    importLog.info(`YouTube: Download complete for ${sessionId}`);

    const stat = fs.statSync(finalAudioPath);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', 'attachment; filename="youtube_audio.mp3"');

    const readStream = fs.createReadStream(finalAudioPath);
    readStream.pipe(res);

    readStream.on('close', () => {
      cleanupSession(sessionId);
    });

    readStream.on('error', (err) => {
      importLog.error('Stream error:', err);
      cleanupSession(sessionId);
      if (!res.headersSent) res.status(500).end();
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to download from YouTube';
    importLog.error('YouTube import error:', error);
    cleanupSession(sessionId);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
