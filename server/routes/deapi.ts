import { Router, Response, Request } from 'express';
import { ApiProxyRequest } from '../types.js';
import { DEAPI_API_KEY } from '../utils/index.js';
import { createLogger } from '../../services/logger.js';
import fs from 'fs';
import multer from 'multer';
import type { Txt2ImgParams } from '../../services/deapiService.js';

const deapiLog = createLogger('DeAPI');
const router = Router();
const upload = multer({ dest: 'temp/' });

router.post('/image', async (req: ApiProxyRequest, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ success: false, error: 'DEAPI key not configured' });
        return;
    }

    try {
        const { prompt, options = {} } = req.body;

        if (!prompt) {
            res.status(400).json({ success: false, error: 'Prompt is required' });
            return;
        }

        const { generateImageWithDeApi } = await import('../../services/deapiService.js');

        const params: Txt2ImgParams = {
            prompt: prompt,
            model: (options.model as any) || "Flux1schnell",
            ...options
        };

        const result = await generateImageWithDeApi(params);
        res.json({ success: true, data: result });
    } catch (error) {
        deapiLog.error('Image proxy error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

router.post('/animate', async (req: ApiProxyRequest, res: Response) => {
    if (!DEAPI_API_KEY) {
        return res.status(500).json({ success: false, error: 'DEAPI key not configured' });
    }

    try {
        const { imageUrl, options = {} } = req.body;

        if (!imageUrl) {
            return res.status(400).json({ success: false, error: 'Image URL is required' });
        }

        if (!options.prompt) {
            return res.status(400).json({ success: false, error: 'Animation prompt is required' });
        }

        const { animateImageWithDeApi } = await import('../../services/deapiService.js');

        const base64Image = imageUrl;
        const aspectRatio = (options.aspectRatio as "16:9" | "9:16" | "1:1") || "16:9";

        const result = await animateImageWithDeApi(base64Image, options.prompt as string, aspectRatio);
        return res.json({ success: true, data: result });
    } catch (error) {
        deapiLog.error('Animate proxy error:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Multipart proxy for img2video
router.post('/img2video', upload.single('first_frame_image'), async (req: Request, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ error: 'DeAPI API key not configured on server' });
        return;
    }

    if (!req.file) {
        res.status(400).json({ error: 'No image file provided' });
        return;
    }

    try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const blob = new Blob([fileBuffer], { type: req.file.mimetype || 'image/png' });

        const formData = new FormData();
        formData.append('first_frame_image', blob, req.file.originalname || 'frame.png');

        const fields = ['prompt', 'frames', 'width', 'height', 'fps', 'model', 'guidance', 'steps', 'seed', 'negative_prompt'];
        fields.forEach(field => {
            if (req.body[field] !== undefined) {
                formData.append(field, req.body[field]);
            }
        });

        if (!req.body.guidance) {
            formData.append('guidance', '3');
        }

        const response = await fetch('https://api.deapi.ai/api/v1/client/img2video', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DEAPI_API_KEY}`,
                'Accept': 'application/json',
            },
            body: formData,
        });

        fs.unlinkSync(req.file.path);

        if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after') || '30';
            res.status(429).json({ error: 'Rate limit exceeded', retryAfter: parseInt(retryAfter, 10) });
            return;
        }

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error: unknown) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const err = error as Error;
        res.status(500).json({ error: err.message || 'DeAPI img2video failed' });
    }
});

// ============================================================
// txt2video - Direct text-to-video generation
// ============================================================
router.post('/txt2video', async (req: Request, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ error: 'DeAPI API key not configured on server' });
        return;
    }

    try {
        const { prompt, width, height, frames, model, guidance, steps, seed } = req.body;

        if (!prompt) {
            res.status(400).json({ error: 'Prompt is required' });
            return;
        }

        const response = await fetch('https://api.deapi.ai/api/v1/client/txt2video', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DEAPI_API_KEY}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                model: model || 'Ltxv_13B_0_9_8_Distilled_FP8',
                width: width || 768,
                height: height || 432,
                guidance: guidance || 3,
                steps: steps || 1,
                frames: frames || 120,
                fps: 30,
                seed: seed || -1,
            }),
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error: unknown) {
        const err = error as Error;
        deapiLog.error('txt2video error:', err);
        res.status(500).json({ error: err.message || 'DeAPI txt2video failed' });
    }
});

// ============================================================
// Webhook handler for async job completion
// DeAPI sends: { event: 'job.completed'|'job.failed', request_id, result_url?, error? }
// ============================================================
const pendingJobs = new Map<string, {
    resolve: (url: string) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
}>();

router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
    try {
        const { event, request_id, result_url, error } = req.body;

        // Validate webhook signature (recommended for production)
        // const signature = req.headers['x-deapi-signature'];
        // TODO: Implement HMAC-SHA256 validation

        deapiLog.info(`Webhook received: ${event} for ${request_id}`);

        const pending = pendingJobs.get(request_id);
        if (pending) {
            clearTimeout(pending.timeout);
            pendingJobs.delete(request_id);

            if (event === 'job.completed' && result_url) {
                pending.resolve(result_url);
            } else if (event === 'job.failed') {
                pending.reject(new Error(error || 'Job failed'));
            }
        }

        res.status(200).json({ received: true });
    } catch (error: unknown) {
        const err = error as Error;
        deapiLog.error('Webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Wait for a job to complete via webhook (with polling fallback)
 */
export const waitForJob = (requestId: string, timeoutMs: number = 300000): Promise<string> => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingJobs.delete(requestId);
            reject(new Error(`Job ${requestId} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        pendingJobs.set(requestId, { resolve, reject, timeout });
    });
};

// ============================================================
// Batch generation endpoint with progress streaming
// ============================================================
router.post('/batch', async (req: Request, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ error: 'DeAPI API key not configured on server' });
        return;
    }

    try {
        const { items, concurrency = 5 } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            res.status(400).json({ error: 'Items array is required' });
            return;
        }

        const { generateImageBatch } = await import('../../services/deapiService.js');

        const results = await generateImageBatch(
            items,
            Math.min(concurrency, 10),
            (progress) => {
                deapiLog.info(`Batch progress: ${progress.completed}/${progress.total}`);
            }
        );

        res.json({ success: true, results });
    } catch (error: unknown) {
        const err = error as Error;
        deapiLog.error('Batch generation error:', err);
        res.status(500).json({ error: err.message || 'Batch generation failed' });
    }
});

// General proxy
router.use('/proxy', async (req: Request, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ error: 'DeAPI API key not configured on server' });
        return;
    }

    const endpoint = req.path.startsWith('/') ? req.path.slice(1) : req.path;
    const deapiUrl = `https://api.deapi.ai/api/v1/client/${endpoint}`;

    try {
        const fetchOptions: RequestInit = {
            method: req.method,
            headers: {
                'Authorization': `Bearer ${DEAPI_API_KEY}`,
                'Accept': 'application/json',
            },
        };

        const contentType = req.headers['content-type'] || '';

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            if (contentType.includes('application/json')) {
                (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
                fetchOptions.body = JSON.stringify(req.body);
            }
        }

        const response = await fetch(deapiUrl, fetchOptions);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error: unknown) {
        const err = error as Error;
        res.status(500).json({ error: err.message || 'DeAPI proxy failed' });
    }
});

export default router;
