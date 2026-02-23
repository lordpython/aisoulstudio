import { Router, Response, Request } from 'express';
import { createLogger } from '@studio/shared/src/services/logger.js';

const videoLog = createLogger('Video');
const router = Router();

router.post('/generate-prompt', async (req: Request, res: Response): Promise<void> => {
    try {
        const { sceneDescription, style, mood, globalSubject, videoPurpose, duration } = req.body;
        if (!sceneDescription) {
            res.status(400).json({ error: 'sceneDescription is required' });
            return;
        }

        const { generateProfessionalVideoPrompt } = await import('@studio/shared/src/services/promptService.js');
        const prompt = await generateProfessionalVideoPrompt(sceneDescription, style, mood, globalSubject, videoPurpose, duration);
        res.json({ success: true, prompt });
    } catch (error: unknown) {
        const err = error as Error;
        videoLog.error('Prompt error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/generate', async (req: Request, res: Response): Promise<void> => {
    try {
        const { prompt, style, aspectRatio, duration, useFastModel, globalSubject } = req.body;
        if (!prompt) {
            res.status(400).json({ error: 'prompt is required' });
            return;
        }

        const { generateVideoFromPrompt } = await import('@studio/shared/src/services/videoService.js');
        const videoUrl = await generateVideoFromPrompt(prompt, style, globalSubject, aspectRatio, duration, useFastModel);
        res.json({ success: true, videoUrl });
    } catch (error: unknown) {
        const err = error as Error;
        videoLog.error('Video error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/download', async (req: Request, res: Response): Promise<void> => {
    try {
        const { url } = req.query;
        if (!url || typeof url !== 'string') {
            res.status(400).json({ error: 'url is required' });
            return;
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error('Download failed');

        res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (error: unknown) {
        const err = error as Error;
        videoLog.error('Download error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
