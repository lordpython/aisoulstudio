import crypto from 'crypto';
import { Router, Response, json as expressJson } from 'express';
import { ApiProxyRequest } from '../types.js';
import { createLogger } from '@studio/shared/src/services/infrastructure/logger.js';

const geminiLog = createLogger('Gemini');

interface GeminiRouteDependencies {
    generateContent: (params: { model: string; contents: unknown; config?: Record<string, unknown> }) => Promise<unknown>;
    generateImages: (params: { model: string; prompt: string; config?: Record<string, unknown> }) => Promise<unknown>;
}

async function defaultGenerateContent(params: {
    model: string;
    contents: unknown;
    config?: Record<string, unknown>;
}): Promise<unknown> {
    const { ai } = await import('@studio/shared/src/services/shared/apiClient.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ai as any).models.generateContent(params);
}

async function defaultGenerateImages(params: {
    model: string;
    prompt: string;
    config?: Record<string, unknown>;
}): Promise<unknown> {
    const { ai } = await import('@studio/shared/src/services/shared/apiClient.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ai as any).models.generateImages(params);
}

export function createGeminiRouter(
    overrides: Partial<GeminiRouteDependencies> = {},
): Router {
    const router = Router();
    const deps: GeminiRouteDependencies = {
        generateContent: defaultGenerateContent,
        generateImages: defaultGenerateImages,
        ...overrides,
    };

    // Gemini API Proxy - Generate Content (Text/Data)
    // 10mb covers base64-encoded images; true video bytes are streamed via Cloud Storage
    router.post('/proxy/generateContent', expressJson({ limit: '10mb' }), async (req: ApiProxyRequest, res: Response) => {
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

            const errorId = crypto.randomUUID();
            geminiLog.error(`[${errorId}] generateContent stack:`, err.stack);
            res.status(500).json({
                success: false,
                error: errorMessage || 'Gemini proxy failed',
                errorId,
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

            const errorId = crypto.randomUUID();
            geminiLog.error(`[${errorId}] generateImages Error (${statusCode}):`, errorMessage);
            geminiLog.error(`[${errorId}] Full error object:`, JSON.stringify(err, Object.getOwnPropertyNames(err), 2));

            res.status(500).json({
                success: false,
                error: errorMessage || 'Gemini image generation failed',
                status: statusCode,
                errorId,
            });
        }
    });

    return router;
}

export default createGeminiRouter();
