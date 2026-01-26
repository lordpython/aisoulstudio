import { Router, Request, Response } from 'express';
import { GEMINI_API_KEY, DEAPI_API_KEY } from '../utils/index.js';

const router = Router();

/**
 * Health check endpoint
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    apis: {
      gemini: !!GEMINI_API_KEY,
      deapi: !!DEAPI_API_KEY,
      suno: !!process.env.VITE_SUNO_API_KEY,
    }
  });
});

export default router;
