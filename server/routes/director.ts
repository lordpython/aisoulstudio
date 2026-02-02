import { Router, Response, Request } from 'express';
import { createLogger } from '../../services/logger.js';

const directorLog = createLogger('Director');
const router = Router();

router.post('/generate', async (req: Request, res: Response): Promise<void> => {
    try {
        const { srtContent, style, contentType, videoPurpose, globalSubject, config } = req.body;
        directorLog.info(`Generating prompts for ${contentType} (${style})`);

        const { generatePromptsWithLangChain } = await import('../../services/directorService.js');
        const prompts = await generatePromptsWithLangChain(srtContent, style, contentType, videoPurpose, globalSubject, config);

        res.json({ success: true, prompts });
    } catch (error: unknown) {
        const err = error as Error;
        directorLog.error('Director Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
