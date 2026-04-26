import { Router, Response, Request } from 'express';
import { z } from 'zod';
import { ApiProxyRequest } from '../types.js';
import { DEAPI_API_KEY, MAX_SINGLE_FILE } from '../utils/index.js';
import { createLogger } from '@studio/shared/src/services/infrastructure/logger.js';
import fs from 'fs';
import multer from 'multer';
import type { Txt2ImgParams, DeApiImageModel } from '@studio/shared/src/services/media/deapiService/index.js';
import { DEAPI_DEFAULTS } from '@studio/shared/src/services/media/deapiService/models.js';
import {
    buildProxyUrl,
    createDeprecatedRouteMiddleware,
    isAllowedProxyEndpoint,
    isAllowedWebhookUrl,
    isSafeProxyEndpoint,
    isWebhookAuthorized,
    normalizeProxyEndpoint,
    safeUnlinkAsync,
    type ProxyEndpointRule,
    type RawBodyRequest,
} from './routeUtils.js';

// ---------------------------------------------------------------------------
// Input schemas (Zod) — validate at the route boundary before any processing
// ---------------------------------------------------------------------------

const ImageGenerationSchema = z.object({
    prompt: z.string().min(1, 'prompt must not be empty').max(2000),
    options: z.object({
        model: z.string().max(100).optional(),
    }).passthrough().optional().default({}),
});

const AnimateSchema = z.object({
    imageUrl: z.string().min(1, 'imageUrl is required'),
    options: z.object({
        prompt: z.string().min(1, 'animation prompt must not be empty').max(2000),
        aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional(),
    }).passthrough(),
});

const Txt2VideoSchema = z.object({
    prompt: z.string().min(1, 'prompt must not be empty').max(2000),
    model: z.string().max(100).optional(),
    width: z.number().int().min(64).max(4096).optional(),
    height: z.number().int().min(64).max(4096).optional(),
    frames: z.number().int().min(1).max(1200).optional(),
    guidance: z.number().min(0).max(50).optional(),
    steps: z.number().int().min(1).max(100).optional(),
    seed: z.number().int().optional(),
});

const BatchSchema = z.object({
    items: z.array(z.unknown()).min(1).max(50),
    concurrency: z.number().int().min(1).max(10).optional().default(5),
});

const PromptEnhanceSchema = z.object({
    prompt: z.string().min(1, 'prompt must not be empty').max(2000),
    negative_prompt: z.string().max(500).optional(),
});

/**
 * Parse and validate a request body with a Zod schema.
 * Returns { data } on success or sends a 400 response and returns null.
 */
function parseBody<T>(
    schema: z.ZodType<T>,
    body: unknown,
    res: Response,
): T | null {
    const result = schema.safeParse(body ?? {});
    if (!result.success) {
        const message = result.error.issues
            .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
            .join('; ');
        res.status(400).json({ success: false, error: message, code: 'VALIDATION_FAILED' });
        return null;
    }
    return result.data;
}

const deapiLog = createLogger('DeAPI');
const router = Router();
const upload = multer({
    dest: 'temp/',
    limits: { fileSize: MAX_SINGLE_FILE }
});

const DEAPI_PROXY_RULES: ProxyEndpointRule[] = [
    { methods: ['POST'], pattern: /^txt2img$/ },
    { methods: ['GET'], pattern: /^request-status\/[A-Za-z0-9_-]+$/ },
    { methods: ['POST'], pattern: /^predict$/ },
    { methods: ['GET'], pattern: /^models$/ },
];

function getWebhookSecret(): string | undefined {
    return process.env.DEAPI_WEBHOOK_SECRET;
}

const deprecatedImageRoute = createDeprecatedRouteMiddleware(
    deapiLog,
    'POST /api/deapi/image',
    '/api/deapi/proxy/txt2img',
);

const deprecatedAnimateRoute = createDeprecatedRouteMiddleware(
    deapiLog,
    'POST /api/deapi/animate',
    '/api/deapi/img2video',
);

const deprecatedBatchRoute = createDeprecatedRouteMiddleware(
    deapiLog,
    'POST /api/deapi/batch',
    '/api/deapi/proxy/txt2img',
);

router.post('/image', deprecatedImageRoute, async (req: ApiProxyRequest, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ success: false, error: 'DEAPI key not configured', code: 'CONFIG_MISSING' });
        return;
    }

    const body = parseBody(ImageGenerationSchema, req.body, res);
    if (!body) return;

    const { prompt, options } = body;

    try {
        const { generateImageWithDeApi } = await import('@studio/shared/src/services/media/deapiService/index.js');

        const params: Txt2ImgParams = {
            ...options,
            prompt,
            model: (options?.model as DeApiImageModel) || DEAPI_DEFAULTS.IMAGE_MODEL,
        };

        const result = await generateImageWithDeApi(params);
        res.json({ success: true, data: result });
    } catch (error) {
        deapiLog.error('Image proxy error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

router.post('/animate', deprecatedAnimateRoute, async (req: ApiProxyRequest, res: Response) => {
    if (!DEAPI_API_KEY) {
        return res.status(500).json({ success: false, error: 'DEAPI key not configured', code: 'CONFIG_MISSING' });
    }

    const body = parseBody(AnimateSchema, req.body, res);
    if (!body) return;

    const { imageUrl, options } = body;

    try {
        const { animateImageWithDeApi } = await import('@studio/shared/src/services/media/deapiService/index.js');

        const aspectRatio = options.aspectRatio ?? '16:9';
        const result = await animateImageWithDeApi(imageUrl, options.prompt, aspectRatio);
        return res.json({ success: true, data: result });
    } catch (error) {
        deapiLog.error('Animate proxy error:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
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
        // Async read to avoid blocking the event loop for large image files
        const fileBuffer = await fs.promises.readFile(req.file.path);
        const blob = new Blob([fileBuffer], { type: req.file.mimetype || 'image/png' });

        const formData = new FormData();
        formData.append('first_frame_image', blob, req.file.originalname || 'frame.png');

        const fields = ['prompt', 'frames', 'width', 'height', 'fps', 'model', 'guidance', 'steps', 'seed', 'negative_prompt'];
        fields.forEach(field => {
            if (req.body[field] !== undefined) {
                formData.append(field, req.body[field]);
            }
        });

        // Strict undefined check: 0 is a valid guidance value, so falsy check would double-append it
        if (req.body.guidance === undefined) {
            formData.append('guidance', '0');
        }

        // Validate and append webhook_url only if it targets an allowed HTTPS host
        if (req.body.webhook_url !== undefined) {
            if (!isAllowedWebhookUrl(req.body.webhook_url as string)) {
                await safeUnlinkAsync(req.file.path);
                res.status(400).json({ error: 'webhook_url must use HTTPS on an allowed domain (set DEAPI_ALLOWED_WEBHOOK_HOSTS to extend)' });
                return;
            }
            formData.append('webhook_url', req.body.webhook_url as string);
        }

        const response = await fetch('https://api.deapi.ai/api/v1/client/img2video', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DEAPI_API_KEY}`,
                'Accept': 'application/json',
            },
            body: formData,
        });

        await safeUnlinkAsync(req.file.path);

        if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after') || '30';
            res.status(429).json({ error: 'Rate limit exceeded', retryAfter: parseInt(retryAfter, 10) });
            return;
        }

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error: unknown) {
        await safeUnlinkAsync(req.file.path);
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

    const body = parseBody(Txt2VideoSchema, req.body, res);
    if (!body) return;

    const { prompt, model, width, height, frames, guidance, steps, seed } = body;

    try {
        const response = await fetch('https://api.deapi.ai/api/v1/client/txt2video', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DEAPI_API_KEY}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                model: model ?? DEAPI_DEFAULTS.VIDEO_MODEL,
                width: width ?? 768,
                height: height ?? 432,
                guidance: guidance ?? 0,
                steps: steps ?? 1,
                frames: frames ?? 120,
                fps: 30,
                seed: seed ?? -1,
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
// img-rmbg - Background removal (Ben2 model)
// ============================================================
router.post('/img-rmbg', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ error: 'DeAPI API key not configured' });
        return;
    }

    if (!req.file) {
        res.status(400).json({ error: 'No image file provided' });
        return;
    }

    try {
        // Async read to avoid blocking the event loop for large image files
        const fileBuffer = await fs.promises.readFile(req.file.path);
        const blob = new Blob([fileBuffer], { type: req.file.mimetype || 'image/png' });

        const formData = new FormData();
        formData.append('image', blob, req.file.originalname || 'image.png');
        formData.append('model', req.body.model || DEAPI_DEFAULTS.BG_REMOVAL_MODEL);

        if (req.body.webhook_url !== undefined) {
            if (!isAllowedWebhookUrl(req.body.webhook_url as string)) {
                await safeUnlinkAsync(req.file.path);
                res.status(400).json({ error: 'webhook_url must use HTTPS on an allowed domain (set DEAPI_ALLOWED_WEBHOOK_HOSTS to extend)' });
                return;
            }
            formData.append('webhook_url', req.body.webhook_url as string);
        }

        const response = await fetch('https://api.deapi.ai/api/v1/client/img-rmbg', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DEAPI_API_KEY}`,
                'Accept': 'application/json',
            },
            body: formData,
        });

        await safeUnlinkAsync(req.file.path);

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error: unknown) {
        await safeUnlinkAsync(req.file.path);
        const err = error as Error;
        res.status(500).json({ error: err.message || 'DeAPI img-rmbg failed' });
    }
});

// ============================================================
// img2img - Image-to-image style transfer / editing
// ============================================================
router.post('/img2img', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ error: 'DeAPI API key not configured' });
        return;
    }

    if (!req.file) {
        res.status(400).json({ error: 'No image file provided' });
        return;
    }

    try {
        // Async read to avoid blocking the event loop for large image files
        const fileBuffer = await fs.promises.readFile(req.file.path);
        const blob = new Blob([fileBuffer], { type: req.file.mimetype || 'image/png' });

        const formData = new FormData();
        formData.append('image', blob, req.file.originalname || 'image.png');

        // webhook_url excluded from generic loop — validated separately below
        const fields = ['prompt', 'model', 'guidance', 'steps', 'seed', 'negative_prompt', 'loras', 'width', 'height'];
        fields.forEach(field => {
            if (req.body[field] !== undefined) {
                formData.append(field, req.body[field]);
            }
        });

        // Validate and append webhook_url only if it targets an allowed HTTPS host
        if (req.body.webhook_url !== undefined) {
            if (!isAllowedWebhookUrl(req.body.webhook_url as string)) {
                await safeUnlinkAsync(req.file.path);
                res.status(400).json({ error: 'webhook_url must use HTTPS on an allowed domain (set DEAPI_ALLOWED_WEBHOOK_HOSTS to extend)' });
                return;
            }
            formData.append('webhook_url', req.body.webhook_url as string);
        }

        // Defaults — use strict undefined check so 0 / '' values are not overridden
        if (req.body.model === undefined) formData.append('model', DEAPI_DEFAULTS.IMG2IMG_MODEL);
        if (req.body.guidance === undefined) formData.append('guidance', '5');
        if (req.body.steps === undefined) formData.append('steps', '4');

        const response = await fetch('https://api.deapi.ai/api/v1/client/img2img', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DEAPI_API_KEY}`,
                'Accept': 'application/json',
            },
            body: formData,
        });

        await safeUnlinkAsync(req.file.path);

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error: unknown) {
        await safeUnlinkAsync(req.file.path);
        const err = error as Error;
        res.status(500).json({ error: err.message || 'DeAPI img2img failed' });
    }
});

// ============================================================
// ws-auth - Pusher channel auth proxy for WebSocket integration
// ============================================================
router.post('/ws-auth', async (req: Request, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ error: 'DeAPI API key not configured' });
        return;
    }

    try {
        const { socket_id, channel_name } = req.body ?? {};

        if (!socket_id || !channel_name) {
            res.status(400).json({ error: 'socket_id and channel_name are required' });
            return;
        }

        const response = await fetch('https://api.deapi.ai/broadcasting/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEAPI_API_KEY}`,
            },
            body: JSON.stringify({ socket_id, channel_name }),
        });

        if (!response.ok) {
            const errText = await response.text();
            res.status(response.status).json({ error: `DeAPI Pusher auth failed: ${errText.substring(0, 200)}` });
            return;
        }

        const authData = await response.json();
        res.json(authData);
    } catch (error: unknown) {
        const err = error as Error;
        deapiLog.error('WebSocket auth error:', err);
        res.status(500).json({ error: err.message || 'WebSocket auth failed' });
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

// DeAPI webhook payload (https://docs.deapi.ai/execution-modes-and-integrations/webhooks):
// {
//   event: 'job.processing' | 'job.completed' | 'job.failed',
//   delivery_id: string,
//   timestamp: string,
//   data: {
//     job_request_id: string,
//     status: 'processing' | 'done' | 'error',
//     job_type: string,
//     result_url?: string,
//     error_code?: string,
//     error_message?: string,
//   }
// }
interface DeApiWebhookPayload {
    event?: string;
    delivery_id?: string;
    timestamp?: string;
    data?: {
        job_request_id?: string;
        status?: string;
        result_url?: string;
        error_code?: string;
        error_message?: string;
        // Legacy fallback fields some senders flatten onto the root object
        request_id?: string;
        error?: string;
    };
    // Legacy flat-shape fields retained for backward compatibility
    request_id?: string;
    result_url?: string;
    error?: string;
}

router.post('/webhook', async (req: RawBodyRequest, res: Response): Promise<void> => {
    try {
        const webhookSecret = getWebhookSecret();

        if (!webhookSecret) {
            deapiLog.warn('Rejected webhook: DEAPI_WEBHOOK_SECRET is not configured on this server');
            res.status(500).json({ error: 'Webhook endpoint is not available' });
            return;
        }

        if (!isWebhookAuthorized(req, webhookSecret)) {
            deapiLog.warn('Rejected unauthorized webhook request', {
                deliveryId: req.get('x-deapi-delivery-id'),
                event: req.get('x-deapi-event'),
            });
            res.status(401).json({ error: 'Unauthorized webhook' });
            return;
        }

        const body = (req.body ?? {}) as DeApiWebhookPayload;
        const event = body.event ?? req.get('x-deapi-event') ?? '';
        const data = body.data ?? {};

        // Support both the documented nested shape and the legacy flat shape
        const requestId = data.job_request_id ?? data.request_id ?? body.request_id ?? '';
        const resultUrl = data.result_url ?? body.result_url;
        const errorMessage = data.error_message ?? data.error ?? body.error;

        deapiLog.info(
            `Webhook received: ${event} for ${requestId || '(unknown request)'}`
            + (data.job_type ? ` [${data.job_type}]` : ''),
        );

        if (!requestId) {
            // Acknowledge to avoid retries — we've validated the signature already.
            res.status(200).json({ received: true });
            return;
        }

        const pending = pendingJobs.get(requestId);
        if (pending) {
            if (event === 'job.completed' && resultUrl) {
                clearTimeout(pending.timeout);
                pendingJobs.delete(requestId);
                pending.resolve(resultUrl);
            } else if (event === 'job.failed') {
                clearTimeout(pending.timeout);
                pendingJobs.delete(requestId);
                pending.reject(new Error(errorMessage || 'Job failed'));
            }
            // job.processing — keep waiting; nothing to settle yet.
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
router.post('/batch', deprecatedBatchRoute, async (req: Request, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ error: 'DeAPI API key not configured on server' });
        return;
    }

    const batchBody = parseBody(BatchSchema, req.body, res);
    if (!batchBody) return;

    const { items, concurrency } = batchBody;

    try {
        const { generateImageBatch } = await import('@studio/shared/src/services/media/deapiService/index.js');

        const results = await generateImageBatch(
            items as Parameters<typeof generateImageBatch>[0],
            Math.min(concurrency, 10),
            (progress: { completed: number; total: number }) => {
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

// ============================================================
// /prompt/video and /prompt/image2image — dedicated multipart routes.
// DeAPI requires an `image` field for both; generic JSON 422s.
// Must be declared BEFORE the generic /prompt/:type handler.
// ============================================================
const handleMultipartPromptEnhance = (type: 'video' | 'image2image') =>
    async (req: Request, res: Response): Promise<void> => {
        if (!DEAPI_API_KEY) {
            res.status(500).json({ error: 'DeAPI API key not configured' });
            return;
        }

        const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
        const negativePrompt =
            typeof req.body?.negative_prompt === 'string' && req.body.negative_prompt.trim()
                ? req.body.negative_prompt
                : 'blurry, low quality, distorted, artifacts';

        if (!prompt.trim()) {
            res.status(400).json({ error: 'prompt is required' });
            return;
        }

        if (!req.file) {
            res.status(400).json({ error: `image file is required for /prompt/${type}` });
            return;
        }

        try {
            const { readFile, unlink } = await import('fs/promises');
            const buffer = await readFile(req.file.path);
            await unlink(req.file.path).catch(() => {});

            const formData = new FormData();
            formData.append('prompt', prompt);
            formData.append('negative_prompt', negativePrompt);
            formData.append(
                'image',
                new Blob([buffer], { type: req.file.mimetype || 'image/png' }),
                req.file.originalname || 'frame.png',
            );

            const response = await fetch(`https://api.deapi.ai/api/v1/client/prompt/${type}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${DEAPI_API_KEY}`,
                    Accept: 'application/json',
                },
                body: formData,
            });

            const data = await response.json();
            res.status(response.status).json(data);
        } catch (error: unknown) {
            const err = error as Error;
            deapiLog.error(`Prompt enhancement (${type}) error:`, err);
            res.status(500).json({ error: err.message || 'Prompt enhancement failed' });
        }
    };

router.post('/prompt/image2image', upload.single('image'), handleMultipartPromptEnhance('image2image'));
router.post('/prompt/video', upload.single('image'), handleMultipartPromptEnhance('video'));

// ============================================================
// Prompt enhancement endpoints: /prompt/image, /prompt/video,
// /prompt/image2image, /prompt/speech
// ============================================================
router.post('/prompt/:type', async (req: Request, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ error: 'DeAPI API key not configured' });
        return;
    }

    const type = req.params.type as string;
    // video/image2image are served by dedicated multipart routes above.
    const allowed = ['image', 'speech'];
    if (!allowed.includes(type)) {
        res.status(400).json({ error: `Unknown prompt type: ${type}. Allowed: ${allowed.join(', ')}` });
        return;
    }

    const promptBody = parseBody(PromptEnhanceSchema, req.body, res);
    if (!promptBody) return;

    const { prompt, negative_prompt } = promptBody;

    try {

        // DeAPI requires multipart/form-data for video and image2image prompt
        // enhancement endpoints, but JSON for image and speech endpoints.
        const multipartTypes = ['video', 'image2image'];
        const useMultipart = multipartTypes.includes(type);

        let fetchBody: BodyInit;
        let fetchHeaders: Record<string, string>;

        const resolvedNegativePrompt = negative_prompt ?? 'blurry, low quality, distorted, artifacts';

        if (useMultipart) {
            const formData = new FormData();
            formData.append('prompt', prompt);
            formData.append('negative_prompt', resolvedNegativePrompt);
            fetchBody = formData;
            // Do NOT set Content-Type manually — fetch sets it with the boundary
            fetchHeaders = {
                'Authorization': `Bearer ${DEAPI_API_KEY}`,
                'Accept': 'application/json',
            };
        } else {
            fetchBody = JSON.stringify({ prompt, negative_prompt: resolvedNegativePrompt });
            fetchHeaders = {
                'Authorization': `Bearer ${DEAPI_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            };
        }

        const response = await fetch(`https://api.deapi.ai/api/v1/client/prompt/${type}`, {
            method: 'POST',
            headers: fetchHeaders,
            body: fetchBody,
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error: unknown) {
        const err = error as Error;
        deapiLog.error(`Prompt enhancement (${req.params.type}) error:`, err);
        res.status(500).json({ error: err.message || 'Prompt enhancement failed' });
    }
});

// ---------------------------------------------------------------------------
// GET /models — Proxy deAPI model list for browser consumption
// ---------------------------------------------------------------------------

router.get('/models', async (req: Request, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ error: 'DeAPI API key not configured on server' });
        return;
    }

    try {
        const params = new URLSearchParams();
        if (typeof req.query['filter[inference_types]'] === 'string') {
            params.set('filter[inference_types]', req.query['filter[inference_types]']);
        }
        if (typeof req.query.per_page === 'string') {
            params.set('per_page', req.query.per_page);
        }
        if (typeof req.query.page === 'string') {
            params.set('page', req.query.page);
        }

        const qs = params.toString();
        const deapiUrl = `https://api.deapi.ai/api/v1/client/models${qs ? `?${qs}` : ''}`;

        const response = await fetch(deapiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${DEAPI_API_KEY}`,
                'Accept': 'application/json',
            },
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error: unknown) {
        const err = error as Error;
        deapiLog.error('Models proxy error:', err);
        res.status(500).json({ error: err.message || 'DeAPI models fetch failed' });
    }
});

// General proxy
router.use('/proxy', async (req: Request, res: Response): Promise<void> => {
    if (!DEAPI_API_KEY) {
        res.status(500).json({ error: 'DeAPI API key not configured on server' });
        return;
    }

    const endpoint = normalizeProxyEndpoint(req.path);

    if (!isSafeProxyEndpoint(endpoint)) {
        res.status(400).json({ error: 'Invalid proxy endpoint' });
        return;
    }

    if (!isAllowedProxyEndpoint(endpoint, req.method, DEAPI_PROXY_RULES)) {
        deapiLog.warn('Rejected disallowed DeAPI proxy request', {
            method: req.method,
            endpoint,
        });
        res.status(403).json({ error: 'Proxy endpoint is not allowed' });
        return;
    }

    const deapiUrl = buildProxyUrl('https://api.deapi.ai/api/v1/client', endpoint, req.query);

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
                // Strip webhook_url from proxied JSON bodies — the general proxy has no
                // SSRF validation for callback URLs. Callers that genuinely need webhook
                // callbacks must use the dedicated endpoints (/img-rmbg, /img2img) which
                // validate the URL against DEAPI_ALLOWED_WEBHOOK_HOSTS.
                const { webhook_url: _stripped, ...safeBody } = (req.body ?? {}) as Record<string, unknown>;
                fetchOptions.body = JSON.stringify(safeBody);
            } else if (contentType) {
                // Return 415 instead of silently dropping non-JSON bodies.
                // Multipart/form-data callers should use the dedicated endpoints
                // (/img2video, /img2img, /img-rmbg) which handle file uploads properly.
                res.status(415).json({
                    error: `Unsupported content type: ${contentType.split(';')[0].trim()}. The general proxy only accepts application/json. Use the dedicated upload endpoints for multipart/form-data.`,
                });
                return;
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
