import { Router, Response } from 'express';
import { ApiProxyRequest } from '../types.js';
import { GEMINI_API_KEY } from '../utils/index.js';
import { createLogger } from '../../services/logger.js';

const geminiLog = createLogger('Gemini');
const router = Router();

// Gemini API Proxy - Generate Content (Text/Data)
router.post('/proxy/generateContent', async (req: ApiProxyRequest, res: Response) => {
    try {
        const { model, contents, config } = req.body;
        geminiLog.info(`Generating content with model: ${model}`);
        geminiLog.debug('Config:', config);

        if (!GEMINI_API_KEY) {
            throw new Error('VITE_GEMINI_API_KEY not configured on server');
        }

        // Dynamically import GoogleGenAI SDK
        const { GoogleGenAI } = await import('@google/genai');
        const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        // Build request params - config should be nested under 'config' key
        const requestParams: Record<string, unknown> = {
            model,
            contents
        };

        // Add config if provided
        if (config) {
            requestParams.config = config;
        }

        geminiLog.debug('Calling SDK with:', requestParams);

        // Call the actual SDK method
        const result = await (client as any).models.generateContent(requestParams);

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
        geminiLog.info(`Generating images with model: ${model}`);

        if (!GEMINI_API_KEY) {
            throw new Error('VITE_GEMINI_API_KEY not configured on server');
        }

        const { GoogleGenAI } = await import('@google/genai');
        const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const result = await (client as any).models.generateImages({
            model,
            prompt,
            config
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

// Backward compatibility (old format)
router.post('/generate', async (req: ApiProxyRequest, res: Response): Promise<void> => {
    try {
        const { prompt, options = {} } = req.body;
        const model = 'gemini-3-pro-preview';
        const contents = { parts: [{ text: prompt }] };
        const config = options;

        geminiLog.info('Redirecting legacy call to generateContent');

        const { ai } = await import('../../services/shared/apiClient.js');
        const result = await (ai as any).models.generateContent({ model, contents, config });

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

router.post('/image', async (req: ApiProxyRequest, res: Response): Promise<void> => {
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

        const { generateImageFromPrompt } = await import('../../services/imageService.js');

        const result = await generateImageFromPrompt(
            prompt,
            (options.style as string) || "Cinematic",
            (options.globalSubject as string) || "",
            (options.aspectRatio as string) || "16:9",
            (options.skipRefine as boolean) || false,
            options.seed as number
        );
        res.json({ success: true, data: result });
    } catch (error) {
        geminiLog.error('Image proxy error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
