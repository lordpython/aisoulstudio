// MUST be first import to load environment variables before other modules
import './env';

import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../services/logger';

// Create contextual loggers
const serverLog = createLogger('Server');
const sunoLog = createLogger('Suno');
const geminiLog = createLogger('Gemini');
const deapiLog = createLogger('DeAPI');
const cloudLog = createLogger('Cloud');
const videoLog = createLogger('Video');

// Import modular routes
import exportRoutes from './routes/export';
import importRoutes from './routes/import';
import healthRoutes from './routes/health';
import { ensureTempDir, TEMP_DIR, GEMINI_API_KEY, DEAPI_API_KEY, MAX_FILE_SIZE, MAX_FILES, sanitizeId, getSessionDir, cleanupSession } from './utils/index';

// Environment variables are loaded by ./env.js import at the top

// --- Configuration & Constants ---
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Types ---
interface ExportRequest extends Request {
  sessionId?: string;
  files?: Express.Multer.File[];
}

interface ApiProxyRequest extends Request {
  body: {
    prompt?: string;
    imageUrl?: string;
    options?: any;
  };
}

// --- App Initialization ---
const app = express();

// Ensure temp directory exists
ensureTempDir();

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Modular Routes ---
app.use('/api/export', exportRoutes);
app.use('/api/import', importRoutes);
app.use('/api/health', healthRoutes);

// --- Multer Configuration (for remaining routes) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionDir = getSessionDir(Date.now().toString());
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    cb(null, sessionDir);
  },
  filename: (_req, file, cb) => {
    cb(null, path.basename(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES }
});

// --- Remaining Routes (Suno, Gemini, DeAPI, Video, Cloud) ---

/**
 * Generic Suno API Proxy
 * Forwards requests to Suno API to bypass CORS and manage secrets server-side.
 * Endpoint: /api/suno/proxy/* -> https://api.sunoapi.org/api/v1/*
 */
app.use('/api/suno/proxy', async (req: Request, res: Response) => {
  // Extract the endpoint from the URL path (everything after /api/suno/proxy/)
  const endpoint = req.path.startsWith('/') ? req.path.slice(1) : req.path;

  const SUNO_API_KEY = process.env.VITE_SUNO_API_KEY || process.env.SUNO_API_KEY;

  if (!SUNO_API_KEY) {
    res.status(500).json({ error: 'Suno API key not configured on server' });
    return;
  }

  try {
    const sunoUrl = `https://api.sunoapi.org/api/v1/${endpoint}`;
    // Include query parameters if any (for GET requests)
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const finalUrl = sunoUrl + queryString;

    sunoLog.info(`${req.method} Forwarding to: ${finalUrl}`);

    const fetchOptions: any = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUNO_API_KEY}`,
      },
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(finalUrl, fetchOptions);

    const data = await response.json();

    // Log response for debugging (only for record-info to avoid spam)
    if (endpoint.includes('record-info')) {
      sunoLog.debug('Full response:', data);
    }

    if (!response.ok) {
      sunoLog.error(`API Error (${endpoint}):`, data);
      res.status(response.status).json(data);
      return;
    }

    res.json(data);

  } catch (error: any) {
    sunoLog.error(`Network Error (${endpoint}):`, error);
    res.status(500).json({ error: error.message || 'Suno proxy failed' });
  }
});

/**
 * Suno Audio Upload Proxy
 * Uploads audio file to Suno API server-side to bypass CORS restrictions.
 * The browser uploads to this endpoint, and we forward to Suno API.
 */
app.post('/api/suno/upload', upload.single('file'), async (req: Request, res: Response) => {
  const SUNO_API_KEY = process.env.VITE_SUNO_API_KEY || process.env.SUNO_API_KEY;

  if (!SUNO_API_KEY) {
    res.status(500).json({ error: 'Suno API key not configured on server' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  const filePath = req.file.path;
  sunoLog.info(`Received file: ${req.file.originalname} (${req.file.size} bytes)`);

  try {
    // Read the uploaded file
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: req.file.mimetype });

    // Create FormData for Suno API
    const formData = new FormData();
    formData.append('file', blob, req.file.originalname);
    formData.append('uploadPath', 'custom_uploads');
    formData.append('fileName', req.file.originalname);

    // Forward to Suno API - using the correct domain
    const sunoResponse = await fetch('https://sunoapiorg.redpandaai.co/api/file-stream-upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUNO_API_KEY}`,
      },
      body: formData,
    });

    // Check if response is JSON
    const contentType = sunoResponse.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await sunoResponse.text();
      sunoLog.error('Non-JSON response:', text.substring(0, 200));

      // Cleanup temp file
      fs.unlinkSync(filePath);

      res.status(500).json({
        error: 'Suno API returned non-JSON response',
        details: text.substring(0, 200)
      });
      return;
    }

    const sunoData = await sunoResponse.json();

    // Cleanup temp file
    fs.unlinkSync(filePath);

    if (!sunoResponse.ok || (sunoData.code && sunoData.code !== 200)) {
      sunoLog.error('API Error:', sunoData);
      res.status(sunoResponse.status).json({
        error: sunoData.msg || sunoData.message || 'Suno upload failed',
        details: sunoData
      });
      return;
    }

    sunoLog.info('Success:', sunoData.data?.downloadUrl || sunoData.data?.fileUrl);

    // Return the file URL to the client
    res.json({
      success: true,
      code: 200,
      data: {
        fileUrl: sunoData.data?.downloadUrl || sunoData.data?.fileUrl || sunoData.data?.url || sunoData.url
      }
    });

  } catch (error: any) {
    sunoLog.error('Error:', error);

    // Cleanup temp file on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

/**
 * Secure API Proxy Routes
 * These routes handle API calls server-side to avoid exposing API keys in the client bundle.
 */

// Gemini API Proxy - Generate Content (Text/Data)
app.post('/api/gemini/proxy/generateContent', async (req: ApiProxyRequest, res: Response) => {
  try {
    const body = req.body as { model?: string; contents?: any; config?: any };
    const { model, contents, config } = body;
    geminiLog.info(`Generating content with model: ${model}`);
    geminiLog.debug('Config:', config);

    if (!GEMINI_API_KEY) {
      throw new Error('VITE_GEMINI_API_KEY not configured on server');
    }

    // Dynamically import GoogleGenAI SDK
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Build request params - config should be nested under 'config' key
    const requestParams: any = {
      model,
      contents
    };

    // Add config if provided
    if (config) {
      requestParams.config = config;
    }

    geminiLog.debug('Calling SDK with:', requestParams);

    // Call the actual SDK method (correct signature)
    const result = await client.models.generateContent(requestParams);

    geminiLog.info(`Success - response type: ${typeof result}`);

    // The SDK's response.text is a getter that doesn't survive JSON serialization.
    // We explicitly include it in the response so the client can access it.
    const responseData = {
      ...result,
      text: result.text, // Explicitly extract the text getter value
      candidates: result.candidates,
    };

    geminiLog.debug(`Response text length: ${responseData.text?.length || 0} chars`);
    res.json(responseData);
  } catch (error: any) {
    geminiLog.error('generateContent Error:', error);
    geminiLog.error('Error stack:', error.stack);

    // Parse error message if it's a JSON string
    let errorMessage = error.message;
    try {
      const parsed = JSON.parse(error.message);
      errorMessage = parsed.error?.message || error.message;
    } catch (e) {
      // Not JSON, use as-is
    }

    res.status(500).json({
      success: false,
      error: errorMessage || 'Gemini proxy failed',
      details: error.stack
    });
  }
});

// Gemini API Proxy - Generate Images
app.post('/api/gemini/proxy/generateImages', async (req: ApiProxyRequest, res: Response) => {
  try {
    const body = req.body as { model?: string; prompt?: string; config?: any };
    const { model, prompt, config } = body;
    geminiLog.info(`Generating images with model: ${model}`);
    geminiLog.debug('Prompt:', prompt?.substring(0, 100));

    if (!GEMINI_API_KEY) {
      throw new Error('VITE_GEMINI_API_KEY not configured on server');
    }

    // Dynamically import GoogleGenAI SDK
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Call the actual SDK method (correct signature)
    const result = await client.models.generateImages({
      model,
      prompt,
      ...config
    });

    geminiLog.info('Image generation success');
    res.json(result);
  } catch (error: any) {
    geminiLog.error('generateImages Error:', error);
    geminiLog.error('Error stack:', error.stack);
    res.status(500).json({ success: false, error: error.message || 'Gemini proxy failed', details: error.stack });
  }
});

// Director Service Proxy - Run Director Chain on Server
app.post('/api/director/generate', async (req: Request, res: Response) => {
  try {
    const { srtContent, style, contentType, videoPurpose, globalSubject, config } = req.body;

    geminiLog.info(`Generating prompts for ${contentType} (${style})`);

    // Dynamically import the service to avoid loading it on startup if not needed
    const { generatePromptsWithLangChain } = await import('../services/directorService');

    const prompts = await generatePromptsWithLangChain(
      srtContent,
      style,
      contentType,
      videoPurpose,
      globalSubject,
      config
    );

    res.json({ success: true, prompts });
    return;
  } catch (error: any) {
    geminiLog.error('Director Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Director service failed',
      details: error instanceof Error ? error.stack : undefined
    });
    return;
  }
});

// Helper - kept for backward compatibility if any client still calls it
app.post('/api/gemini/generate', async (req: ApiProxyRequest, res: Response) => {
  // Redirect to new proxy
  try {
    const { prompt, options = {} } = req.body;
    // Map old format to new
    const model = 'gemini-3-pro-preview'; // Default
    const contents = { parts: [{ text: prompt }] };
    const config = options; // rough mapping

    geminiLog.info('Redirecting legacy call to generateContent');

    // Dynamically import ai client to ensure env vars are loaded
    const { ai } = await import('../services/shared/apiClient');
    const result = await ai.models.generateContent({ model, contents, config });

    // Wrap to match old expected format
    return res.json({
      success: true,
      data: {
        text: result.text || '',
        raw: result
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }
});

app.post('/api/gemini/image', async (req: ApiProxyRequest, res: Response) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ success: false, error: 'Gemini API key not configured' });
  }

  try {
    const { prompt, options = {} } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    // Import the correct function from imageService
    const { generateImageFromPrompt } = await import('../services/imageService.js');

    const result = await generateImageFromPrompt(
      prompt,
      options.style || "Cinematic",
      options.globalSubject || "",
      options.aspectRatio || "16:9",
      options.skipRefine || false,
      options.seed
    );
    return res.json({ success: true, data: result });
  } catch (error) {
    geminiLog.error('Image proxy error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DEAPI Proxy
app.post('/api/deapi/image', async (req: ApiProxyRequest, res: Response) => {
  if (!DEAPI_API_KEY) {
    return res.status(500).json({ success: false, error: 'DEAPI key not configured' });
  }

  try {
    const { prompt, options = {} } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    // Import DEAPI service dynamically
    const { generateImageWithDeApi } = await import('../services/deapiService.js');

    // Create params object matching Txt2ImgParams interface
    const params = {
      prompt,
      model: options.model || "Flux1schnell",
      aspect_ratio: options.aspectRatio || "16:9",
      ...options
    };

    const result = await generateImageWithDeApi(params);
    return res.json({ success: true, data: result });
  } catch (error) {
    deapiLog.error('Image proxy error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/deapi/animate', async (req: ApiProxyRequest, res: Response) => {
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

    // Import DEAPI service dynamically
    const { animateImageWithDeApi } = await import('../services/deapiService.js');

    // Convert image URL to base64 if needed, or pass as-is if already base64
    const base64Image = imageUrl.startsWith('data:') ? imageUrl : imageUrl;
    const aspectRatio = options.aspectRatio || "16:9";

    const result = await animateImageWithDeApi(base64Image, options.prompt, aspectRatio);
    return res.json({ success: true, data: result });
  } catch (error) {
    deapiLog.error('Animate proxy error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DeAPI Proxy
 * Forwards requests to DeAPI to bypass CORS and manage secrets server-side.
 * Supports: img2video, txt2img, request-status
 */
app.use('/api/deapi/proxy', async (req: Request, res: Response) => {
  const DEAPI_API_KEY = process.env.VITE_DEAPI_API_KEY || process.env.DEAPI_API_KEY;

  if (!DEAPI_API_KEY) {
    res.status(500).json({ error: 'DeAPI API key not configured on server' });
    return;
  }

  // Extract the endpoint from the URL path (everything after /api/deapi/proxy/)
  const endpoint = req.path.startsWith('/') ? req.path.slice(1) : req.path;
  const deapiUrl = `https://api.deapi.ai/api/v1/client/${endpoint}`;

  deapiLog.info(`${req.method} ${endpoint}`);

  try {
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${DEAPI_API_KEY}`,
        'Accept': 'application/json',
      },
    };

    // Handle different content types
    const contentType = req.headers['content-type'] || '';

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (contentType.includes('multipart/form-data')) {
        // For FormData (img2video), we need to reconstruct it
        // The body is already parsed by express, so we forward as-is
        // Actually, we need multer to handle this - use a different approach

        // For multipart, we'll stream the raw request
        // This requires raw body access - let's handle it differently
        deapiLog.debug('Multipart request detected - forwarding raw body');

        // Get raw body from request
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));

        await new Promise<void>((resolve, reject) => {
          req.on('end', () => resolve());
          req.on('error', reject);
        });

        const rawBody = Buffer.concat(chunks);

        // Forward with original content-type (includes boundary)
        (fetchOptions.headers as Record<string, string>)['Content-Type'] = contentType;
        fetchOptions.body = rawBody;

      } else if (contentType.includes('application/json')) {
        (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(req.body);
      }
    }

    const response = await fetch(deapiUrl, fetchOptions);

    // Forward rate limit headers
    const rateLimitHeaders = ['retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
    rateLimitHeaders.forEach(header => {
      const value = response.headers.get(header);
      if (value) res.setHeader(header, value);
    });

    // Handle rate limiting
    if (response.status === 429) {
      deapiLog.warn(`Rate limited (429) for ${endpoint}`);
      const retryAfter = response.headers.get('retry-after') || '30';
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: parseInt(retryAfter, 10),
        message: 'Too many requests to DeAPI. Please wait before retrying.'
      });
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      deapiLog.error(`API Error (${endpoint}):`, data);
      res.status(response.status).json(data);
      return;
    }

    res.json(data);

  } catch (error: any) {
    deapiLog.error(`Error (${endpoint}):`, error);
    res.status(500).json({ error: error.message || 'DeAPI proxy failed' });
  }
});

/**
 * DeAPI FormData Proxy (for img2video with file uploads)
 * Handles multipart/form-data requests separately
 */
app.post('/api/deapi/img2video', upload.single('first_frame_image'), async (req: Request, res: Response) => {
  const DEAPI_API_KEY = process.env.VITE_DEAPI_API_KEY || process.env.DEAPI_API_KEY;

  if (!DEAPI_API_KEY) {
    res.status(500).json({ error: 'DeAPI API key not configured on server' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No image file provided' });
    return;
  }

  deapiLog.info(`img2video: Received image: ${req.file.originalname} (${req.file.size} bytes)`);

  try {
    // Read the uploaded file
    const fileBuffer = fs.readFileSync(req.file.path);
    const blob = new Blob([fileBuffer], { type: req.file.mimetype || 'image/png' });

    // Create FormData for DeAPI
    const formData = new FormData();
    formData.append('first_frame_image', blob, req.file.originalname || 'frame.png');

    // Forward all other form fields (guidance is required by API spec)
    const fields = ['prompt', 'frames', 'width', 'height', 'fps', 'model', 'guidance', 'steps', 'seed', 'negative_prompt'];
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        formData.append(field, req.body[field]);
      }
    });

    // Ensure guidance is always set (required parameter)
    if (!req.body.guidance) {
      formData.append('guidance', '3');
    }

    deapiLog.info(`img2video: Forwarding with prompt: ${(req.body.prompt || '').substring(0, 50)}...`);

    const response = await fetch('https://api.deapi.ai/api/v1/client/img2video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEAPI_API_KEY}`,
        'Accept': 'application/json',
      },
      body: formData,
    });

    // Cleanup temp file
    fs.unlinkSync(req.file.path);

    // Handle rate limiting
    if (response.status === 429) {
      deapiLog.warn('img2video: Rate limited (429)');
      const retryAfter = response.headers.get('retry-after') || '30';
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: parseInt(retryAfter, 10),
        message: 'Too many requests to DeAPI. Please wait before retrying.'
      });
      return;
    }

    // Check content type - Cloudflare returns HTML instead of JSON
    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const text = await response.text();

      // Check for Cloudflare challenge
      if (text.includes('Just a moment') || text.includes('challenge-platform') || text.includes('_cf_chl')) {
        deapiLog.error('img2video: Cloudflare bot protection detected');
        res.status(503).json({
          error: 'DeAPI blocked by Cloudflare bot protection',
          message: 'The img2video endpoint requires browser-based access. Use the app UI instead.',
          solutions: [
            'Use the app in browser (npm run dev:all)',
            'Contact DeAPI support (support@deapi.ai) for server-to-server access',
          ]
        });
        return;
      }

      deapiLog.error('img2video: Non-JSON response:', text.substring(0, 200));
      res.status(502).json({ error: 'DeAPI returned non-JSON response', details: text.substring(0, 200) });
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      deapiLog.error('img2video: API Error:', data);
      res.status(response.status).json(data);
      return;
    }

    deapiLog.info('img2video: Success:', data.request_id || data.data?.request_id || 'immediate result');
    res.json(data);

  } catch (error: any) {
    deapiLog.error('img2video: Error:', error);

    // Cleanup temp file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: error.message || 'DeAPI img2video failed' });
  }
});

/**
 * Professional Video Prompt Generator (Test UI Endpoint)
 * Generates AI-powered cinematographer-level prompts for Veo 3.1
 */
app.post('/api/generate-video-prompt', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      sceneDescription,
      style = 'Cinematic',
      mood = 'dramatic',
      globalSubject = '',
      videoPurpose = 'documentary',
      duration = 6
    } = req.body;

    if (!sceneDescription) {
      res.status(400).json({ error: 'sceneDescription is required' });
      return;
    }

    videoLog.info(`Generating professional prompt for: "${sceneDescription.substring(0, 50)}..."`);
    videoLog.debug(`Style: ${style}, Mood: ${mood}, Duration: ${duration}s`);

    // Import the professional prompt generator
    const { generateProfessionalVideoPrompt } = await import('../services/promptService.js');

    const prompt = await generateProfessionalVideoPrompt(
      sceneDescription,
      style,
      mood,
      globalSubject,
      videoPurpose,
      duration
    );

    videoLog.info(`Generated prompt (${prompt.length} chars)`);
    res.json({ success: true, prompt });
  } catch (error: any) {
    videoLog.error('Prompt error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate video prompt' });
    return;
  }
  return;
});

/**
 * Veo 3.1 Video Generation (Test UI Endpoint)
 * Generates video using Veo 3.1 with the provided prompt
 */
app.post('/api/generate-video', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      prompt,
      style = 'Cinematic',
      aspectRatio = '16:9',
      duration = 6,
      useFastModel = true,
      globalSubject = ''
    } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    videoLog.info(`Generating Veo 3.1 video (${useFastModel ? 'Fast' : 'Standard'} model)`);
    videoLog.debug(`Prompt preview: "${prompt.substring(0, 100)}..."`);
    videoLog.debug(`Settings: ${aspectRatio}, ${duration}s`);
    videoLog.debug('API Key available:', !!process.env.VITE_GEMINI_API_KEY);

    // Import the video service
    const { generateVideoFromPrompt } = await import('../services/videoService.js');

    const videoUrl = await generateVideoFromPrompt(
      prompt,
      style,
      globalSubject,
      aspectRatio,
      duration,
      useFastModel
    );

    videoLog.info('Video generated successfully');
    res.json({ success: true, videoUrl });
    return;
  } catch (error: any) {
    videoLog.error('Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate video' });
    return;
  }
});

/**
 * Professional Video Generation (Combined endpoint)
 * First generates a professional prompt, then generates the video
 */
app.post('/api/generate-professional-video', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      sceneDescription,
      style = 'Cinematic',
      mood = 'dramatic',
      globalSubject = '',
      videoPurpose = 'documentary',
      aspectRatio = '16:9',
      duration = 6,
      useFastModel = true
    } = req.body;

    if (!sceneDescription) {
      res.status(400).json({ error: 'sceneDescription is required' });
      return;
    }

    videoLog.info('Starting professional video generation pipeline');

    // Import services
    const { generateProfessionalVideo } = await import('../services/videoService.js');

    const videoUrl = await generateProfessionalVideo(
      sceneDescription,
      style,
      mood,
      globalSubject,
      videoPurpose,
      aspectRatio,
      duration,
      useFastModel
    );

    videoLog.info('Professional video generated successfully');
    res.json({ success: true, videoUrl });
  } catch (error: any) {
    videoLog.error('Professional video error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate professional video' });
    return;
  }
});


/**
 * Video Download Proxy
 * Proxies video downloads from Google APIs to avoid CORS issues
 */
app.get('/api/download-video', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'url parameter is required' });
      return;
    }

    videoLog.info(`Proxying download from: ${url.substring(0, 100)}...`);

    // Fetch the video from Google's API
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
    }

    // Get content type and length
    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');

    // Set response headers
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Content-Disposition', 'attachment; filename="generated-video.mp4"');
// Stream the video to the client
const buffer = await response.arrayBuffer();
res.send(Buffer.from(buffer));

videoLog.info('Download complete');
return;
} catch (error: any) {
videoLog.error('Download error:', error);
res.status(500).json({ error: error.message || 'Failed to download video' });
return;
}
});

// --- Real-Time Cloud Autosave Endpoints ---

// Lazy-load Google Cloud Storage
let gcsStorage: any = null;
let GcsStorageClass: any = null;
const GCS_BUCKET_NAME = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'aisoul-studio-storage';

async function getGcsStorageClient(): Promise<any> {
  if (gcsStorage) return gcsStorage;

  try {
    if (!GcsStorageClass) {
      const gcs = await import('@google-cloud/storage');
      GcsStorageClass = gcs.Storage;
    }
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.VITE_GOOGLE_CLOUD_PROJECT;
    gcsStorage = projectId ? new GcsStorageClass({ projectId }) : new GcsStorageClass();
    return gcsStorage;
  } catch (error) {
    cloudLog.error('Failed to initialize GCS:', error);
    throw new Error(`Failed to load @google-cloud/storage: ${error}`);
  }
}

/**
 * Initialize Cloud Session Folder
 * Called immediately when "Plan Video" is started.
 */
app.post('/api/cloud/init', async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.body;

  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }

  const folderPath = `production_${sessionId}/`;

  try {
    const storage = await getGcsStorageClient();
    const bucket = storage.bucket(GCS_BUCKET_NAME);

    const [exists] = await bucket.exists();
    if (!exists) {
      cloudLog.warn(`Bucket ${GCS_BUCKET_NAME} not found. Auto-save disabled.`);
      res.status(404).json({ error: 'Bucket not found', bucketName: GCS_BUCKET_NAME });
      return;
    }

    // Create a "marker" file to officially "start" the folder
    await bucket.file(`${folderPath}_session_started.txt`).save(
      `Session Started: ${new Date().toISOString()}\nSessionId: ${sessionId}`
    );

    cloudLog.info(`Session folder initialized: ${folderPath}`);
    res.json({ success: true, folderPath, bucketName: GCS_BUCKET_NAME });
  } catch (error: any) {
    cloudLog.error('Init failed:', error.message);
    // Return success:false but don't fail - autosave is optional
    res.json({ success: false, error: error.message, warning: 'Cloud autosave unavailable' });
  }
});

/**
 * Upload Individual Asset to Cloud
 * Called by services the moment an image/audio/video is generated.
 * Uses memory storage to handle file before streaming to GCS.
 */
const memoryUpload = multer({ storage: multer.memoryStorage() });

app.post('/api/cloud/upload-asset', memoryUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  const { sessionId, assetType, filename } = req.body;

  if (!req.file || !sessionId) {
    res.status(400).json({ error: 'Missing file or sessionId' });
    return;
  }

  // Validate assetType to prevent path traversal
  const validAssetTypes = ['visuals', 'audio', 'music', 'video_clips', 'sfx', 'subtitles'];
  const safeAssetType = validAssetTypes.includes(assetType) ? assetType : 'misc';

  // Sanitize filename
  const safeFilename = path.basename(filename || `asset_${Date.now()}`);
  const destination = `production_${sessionId}/${safeAssetType}/${safeFilename}`;

  try {
    const storage = await getGcsStorageClient();
    const bucket = storage.bucket(GCS_BUCKET_NAME);
    const blob = bucket.file(destination);

    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: req.file.mimetype || 'application/octet-stream',
        metadata: {
          sessionId,
          assetType: safeAssetType,
          uploadedAt: new Date().toISOString(),
        }
      }
    });

    blobStream.on('error', (err: Error) => {
      cloudLog.error('Upload stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    });

    blobStream.on('finish', () => {
      cloudLog.info(`Saved: ${destination} (${Math.round(req.file!.size / 1024)}KB)`);
      res.json({
        success: true,
        path: destination,
        gsUri: `gs://${GCS_BUCKET_NAME}/${destination}`,
        size: req.file!.size
      });
    });

    blobStream.end(req.file.buffer);

  } catch (error: any) {
    cloudLog.error('Upload failed:', error.message);
    // Return success:false but don't fail hard - autosave is optional
    res.json({ success: false, error: error.message, warning: 'Asset not saved to cloud' });
  }
});

/**
 * Health check for cloud storage availability
 */
app.get('/api/cloud/status', async (req: Request, res: Response) => {
  try {
    const storage = await getGcsStorageClient();
    const bucket = storage.bucket(GCS_BUCKET_NAME);
    const [exists] = await bucket.exists();

    res.json({
      available: exists,
      bucketName: GCS_BUCKET_NAME,
      message: exists ? 'Cloud storage ready' : 'Bucket not found'
    });
  } catch (error: any) {
    res.json({
      available: false,
      bucketName: GCS_BUCKET_NAME,
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  serverLog.info(`FFmpeg export server running on http://localhost:${PORT}`);
  serverLog.info(`Temp directory: ${TEMP_DIR}`);
  serverLog.debug(`Test UI available at: file://${path.resolve(__dirname, '../test-video-ui.html')}`);
});

