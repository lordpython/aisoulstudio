import { Router, Response } from 'express';
import { ApiProxyRequest } from '../types.js';
import { GEMINI_API_KEY } from '../utils/index.js';
import { createLogger } from '@studio/shared/src/services/logger.js';
import { createDeprecatedRouteMiddleware } from './routeUtils.js';

const geminiLog = createLogger('Gemini');

interface GeminiRouteDependencies {
    generateContent: (params: { model: string; contents: unknown; config?: Record<string, unknown> }) => Promise<any>;
    generateImages: (params: { model: string; prompt: string; config?: Record<string, unknown> }) => Promise<any>;
    legacyGenerate: (prompt: string, options?: Record<string, unknown>) => Promise<any>;
    legacyImage: (prompt: string, options?: Record<string, unknown>) => Promise<any>;
}

async function defaultGenerateContent(params: {
    model: string;
    contents: unknown;
    config?: Record<string, unknown>;
}): Promise<any> {
    if (!GEMINI_API_KEY) {
        throw new Error('VITE_GEMINI_API_KEY not configured on server');
    }

    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    return (client as any).models.generateContent(params);
}

async function defaultGenerateImages(params: {
    model: string;
    prompt: string;
    config?: Record<string, unknown>;
}): Promise<any> {
    if (!GEMINI_API_KEY) {
        throw new Error('VITE_GEMINI_API_KEY not configured on server');
    }

    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    return (client as any).models.generateImages(params);
}

async function defaultLegacyGenerate(prompt: string, options: Record<string, unknown> = {}): Promise<any> {
    const model = 'gemini-3-pro-preview';
    const contents = { parts: [{ text: prompt }] };
    const config = options;

    const { ai } = await import('@studio/shared/src/services/shared/apiClient.js');
    return (ai as any).models.generateContent({ model, contents, config });
}

async function defaultLegacyImage(prompt: string, options: Record<string, unknown> = {}): Promise<any> {
    const { generateImageFromPrompt } = await import('@studio/shared/src/services/imageService.js');

    return generateImageFromPrompt(
        prompt,
        (options.style as string) || "Cinematic",
        (options.globalSubject as string) || "",
        (options.aspectRatio as string) || "16:9",
        (options.skipRefine as boolean) || false,
        options.seed as number
    );
}

export function createGeminiRouter(
    overrides: Partial<GeminiRouteDependencies> = {},
): Router {
    const router = Router();
    const deps: GeminiRouteDependencies = {
        generateContent: defaultGenerateContent,
        generateImages: defaultGenerateImages,
        legacyGenerate: defaultLegacyGenerate,
        legacyImage: defaultLegacyImage,
        ...overrides,
    };

    // Gemini API Proxy - Generate Content (Text/Data)
    router.post('/proxy/generateContent', async (req: ApiProxyRequest, res: Response) => {
        try {
            const { model, contents, config } = req.body;

            if (!model) {
                res.status(400).json({ success: false, error: 'model is required' });
                return;
            }

            if (!contents) {
                res.status(400).json({ success: false, error: 'contents is required' });
                return;
            }

            geminiLog.info(`Generating content with model: ${model}`);
            geminiLog.debug('Config:', config);

            const result = await deps.generateContent({ model, contents, config });

            geminiLog.info(`Success - response type: ${typeof result}`);

            // The SDK's response.text is a getter that doesn't survive JSON serialization.
            const resultAsAny = result as any;
            const responseData = {
                ...resultAsAny,
                text: typeof resultAsAny.text === 'function' ? resultAsAny.text() : resultAsAny.text,
                candidates: resultAsAny.candidates,
            };

            geminiLog.debug(`Response text length: ${responseData.text?.length || 0} chars`);
            res.json(responseData);
        } catch (error: unknown) {
            const err = error as Error;
            geminiLog.error('generateContent Error:', err);

            let errorMessage = err.message;
            try {
                const parsed = JSON.parse(err.message);
                errorMessage = parsed.error?.message || err.message;
            } catch (_e) {
                // Not JSON
            }

            res.status(500).json({
                success: false,
                error: errorMessage || 'Gemini proxy failed',
                details: err.stack
            });
        }
    });

    // Gemini API Proxy - Generate Images
    router.post('/proxy/generateImages', async (req: ApiProxyRequest, res: Response) => {
        try {
            const { model, prompt, config } = req.body;

            if (!model) {
                res.status(400).json({ success: false, error: 'model is required' });
                return;
            }

            if (!prompt) {
                res.status(400).json({ success: false, error: 'prompt is required' });
                return;
            }

            geminiLog.info(`Generating images with model: ${model}`);

            // Strip unsupported parameters: seed is not supported by imagen-4.0 via @google/genai
            const sanitizedConfig = config ? { ...config } : {};
            delete sanitizedConfig.seed;

            const result = await deps.generateImages({
                model,
                prompt,
                config: sanitizedConfig
            });

            geminiLog.info('Image generation success');
            res.json(result);
        } catch (error: unknown) {
            const err = error as any;
            // Extract the most useful error message from @google/genai SDK errors
            let errorMessage = err.message || '';
            const statusCode = err.status || err.statusCode || 500;

            // SDK errors may embed JSON in the message or use nested properties
            try {
                const parsed = JSON.parse(errorMessage);
                errorMessage = parsed.error?.message || parsed.message || errorMessage;
            } catch (_e) {
                // Not JSON - check for nested error properties
                if (err.error?.message) {
                    errorMessage = err.error.message;
                } else if (err.errorDetails) {
                    errorMessage = JSON.stringify(err.errorDetails);
                }
            }

            geminiLog.error(`generateImages Error (${statusCode}):`, errorMessage);
            geminiLog.error('Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));

            res.status(500).json({
                success: false,
                error: errorMessage || 'Gemini image generation failed',
                status: statusCode,
                details: err.stack
            });
        }
    });

    const legacyContentDeprecation = createDeprecatedRouteMiddleware(
        geminiLog,
        'POST /api/gemini/generate',
        '/api/gemini/proxy/generateContent',
    );

    // Backward compatibility (old format)
    router.post('/generate', legacyContentDeprecation, async (req: ApiProxyRequest, res: Response): Promise<void> => {
        try {
            const { prompt, options = {} } = req.body;

            geminiLog.info('Redirecting legacy call to generateContent');

            const result = await deps.legacyGenerate(prompt || '', options);

            const resultAsAny = result as any;
            res.json({
                success: true,
                data: {
                    text: typeof resultAsAny.text === 'function' ? resultAsAny.text() : (resultAsAny.text || ''),
                    raw: result
                }
            });
        } catch (error: unknown) {
            const err = error as Error;
            res.status(500).json({ success: false, error: err.message });
        }
    });

    const legacyImageDeprecation = createDeprecatedRouteMiddleware(
        geminiLog,
        'POST /api/gemini/image',
        '/api/gemini/proxy/generateImages',
    );

    router.post('/image', legacyImageDeprecation, async (req: ApiProxyRequest, res: Response): Promise<void> => {
        if (!GEMINI_API_KEY) {
            res.status(500).json({ success: false, error: 'Gemini API key not configured' });
            return;
        }

        try {
            const { prompt, options = {} } = req.body;

            if (!prompt) {
                res.status(400).json({ success: false, error: 'Prompt is required' });
                return;
            }

            const result = await deps.legacyImage(prompt, options);
            res.json({ success: true, data: result });
        } catch (error) {
            geminiLog.error('Image proxy error:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    return router;
}

export default createGeminiRouter();
