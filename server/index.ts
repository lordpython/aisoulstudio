import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local', debug: true });
config({ path: '.env', debug: true }); // fallback

// --- Configuration & Constants ---
const PORT = process.env.PORT || 3001;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES = 10000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '../temp');

// API Keys (server-side only)
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const DEAPI_API_KEY = process.env.VITE_DEAPI_API_KEY;

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
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Enable JSON body parsing with 50MB limit for large image data

// Helpers
const sanitizeId = (id: string): string => {
  // Allow only alphanumeric characters, underscores, and hyphens to prevent path traversal
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
};

const getSessionDir = (sessionId: string): string => {
  return path.join(TEMP_DIR, sanitizeId(sessionId));
};

const cleanupSession = (sessionId: string) => {
  const dir = getSessionDir(sessionId);
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[Cleanup] Successfully removed session ${sessionId}`);
    } catch (e) {
      console.error(`[Cleanup] Failed to remove session ${sessionId}:`, e);
    }
  }
};

// --- Multer Configuration ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const request = req as ExportRequest;

    // 1. Try to get sessionId from query or headers (Chunk Upload)
    let sessionId = (req.query.sessionId as string) || (req.headers['x-session-id'] as string);

    // 2. If not found, check if we already generated one in this request (unlikely for first file, but good for safety)
    if (!sessionId && request.sessionId) {
      sessionId = request.sessionId;
    }

    // 3. If still not found, generate a new one (Init Session)
    if (!sessionId) {
      sessionId = Date.now().toString();
      request.sessionId = sessionId; // Attach to request for controller access
    }

    // Sanitize and ensure existence
    sessionId = sanitizeId(sessionId);
    request.sessionId = sessionId;

    const sessionDir = getSessionDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    cb(null, sessionDir);
  },
  filename: (_req, file, cb) => {
    if (file.fieldname === 'audio') {
      cb(null, 'audio.mp3');
    } else {
      // Trust client filename for frames (e.g., frame000001.jpg)
      // but ensure it's a simple filename to avoid traversal
      cb(null, path.basename(file.originalname));
    }
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES }
});



// --- Routes ---

/**
 * 1. Initialize Export Session
 * Receives the audio file and creates the session directory.
 * Returns the sessionId to the client.
 */
app.post('/api/export/init', upload.single('audio'), (req: Request, res: Response) => {
  try {
    const request = req as ExportRequest;
    if (!request.sessionId) {
      throw new Error('Failed to generate session ID');
    }
    console.log(`[Session] Initialized: ${request.sessionId}`);
    res.json({ success: true, sessionId: request.sessionId });
  } catch (error: any) {
    console.error('[Session Init Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 2. Upload Chunk of Frames
 * Receives a batch of images. Multer handles saving them to the session directory.
 */
app.post('/api/export/chunk', upload.array('frames'), (req: Request, res: Response) => {
  const request = req as ExportRequest;
  if (!request.sessionId) {
    res.status(400).json({ success: false, error: 'Session ID required' });
    return;
  }

  const count = request.files?.length || 0;
  res.json({ success: true, count });
});

/**
 * 2.5. Import from YouTube
 * Downloads audio from a YouTube URL using yt-dlp and streams it back.
 */
app.post('/api/import/youtube', express.json(), async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ error: 'Missing YouTube URL' });
    return;
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch (e) {
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

  console.log(`[YouTube] Downloading: ${url}`);

  // Arguments for yt-dlp
  const args = [
    '-x',                      // Extract audio
    '--audio-format', 'mp3',   // Convert to mp3
    '--audio-quality', '0',    // Best quality
    '-o', outputTemplate,      // Output path template
    url
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      const ytdlp = spawn('yt-dlp', args);

      ytdlp.stderr.on('data', (data) => console.log(`[yt-dlp] ${data}`));

      ytdlp.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });

      ytdlp.on('error', (err) => reject(err));
    });

    if (!fs.existsSync(finalAudioPath)) {
      throw new Error('Download failed, file not found');
    }

    console.log(`[YouTube] Download complete for ${sessionId}`);

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
      console.error('[Stream Error]', err);
      cleanupSession(sessionId);
      if (!res.headersSent) res.status(500).end();
    });

  } catch (error: any) {
    console.error('[YouTube Import Error]', error);
    cleanupSession(sessionId);
    res.status(500).json({ success: false, error: error.message || 'Failed to download from YouTube' });
  }
});

/**
 * 3. Finalize and Render
 * Triggers FFmpeg to stitch images and audio into a video.
 * Streams the result back to the client and cleans up.
 */
app.post('/api/export/finalize', express.json(), async (req: Request, res: Response) => {
  const { sessionId: rawSessionId, fps = 30 } = req.body;

  if (!rawSessionId) {
    res.status(400).json({ error: 'Missing sessionId' });
    return;
  }

  const sessionId = sanitizeId(rawSessionId);
  const sessionDir = getSessionDir(sessionId);

  if (!fs.existsSync(sessionDir)) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const audioPath = path.join(sessionDir, 'audio.mp3');
  const outputPath = path.join(sessionDir, 'output.mp4');

  console.log(`[Export] Finalizing session ${sessionId} at ${fps} FPS`);
  const startTime = Date.now();

  try {
    // Basic validation
    if (!fs.existsSync(audioPath)) {
      throw new Error('Audio file missing in session');
    }

    // FFmpeg Arguments
    // Note: Input frames may be 720p for faster rendering, we upscale to 1080p
    const ffmpegArgs = [
      '-framerate', String(fps),
      '-i', path.join(sessionDir, 'frame%06d.jpg'), // Expects frame000001.jpg, etc.
      '-i', audioPath,
      '-c:v', 'libx264',
      // Note: Video will be at render resolution (720p) - fast rendering tradeoff
      '-preset', 'veryfast', // Balance between speed and compression
      '-crf', '23',          // Standard quality
      '-pix_fmt', 'yuv420p', // Ensure compatibility
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',           // Stop when shortest input ends (usually audio matches frames)
      '-movflags', '+faststart', // Optimize for web streaming
      '-y',                  // Overwrite output
      outputPath
    ];

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      let stderrOutput = '';

      // Capture FFmpeg output for debugging
      ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        stderrOutput += msg;
        // Only log progress lines, not the full verbose output
        if (msg.includes('frame=') || msg.includes('error') || msg.includes('Error')) {
          console.log(`[FFmpeg] ${msg.trim()}`);
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });

      ffmpeg.on('error', (err) => reject(err));
    });

    console.log(`[Export] FFmpeg completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    // Stream the file back
    const stat = fs.statSync(outputPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);

    const readStream = fs.createReadStream(outputPath);
    readStream.pipe(res);

    // Cleanup hooks
    readStream.on('close', () => {
      cleanupSession(sessionId);
    });

    readStream.on('error', (err) => {
      console.error('[Stream Error]', err);
      cleanupSession(sessionId);
      if (!res.headersSent) res.status(500).end();
    });

  } catch (error: any) {
    console.error('[Export Error]', error);
    cleanupSession(sessionId); // Cleanup on failure too
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

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

    console.log(`[Suno Proxy] ${req.method} Forwarding to: ${finalUrl}`);

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
      console.log(`[Suno Proxy] Full response:`, JSON.stringify(data, null, 2));
    }

    if (!response.ok) {
      console.error(`[Suno Proxy] API Error (${endpoint}):`, data);
      res.status(response.status).json(data);
      return;
    }

    res.json(data);

  } catch (error: any) {
    console.error(`[Suno Proxy] Network Error (${endpoint}):`, error);
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
  console.log(`[Suno Upload] Received file: ${req.file.originalname} (${req.file.size} bytes)`);

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
      console.error('[Suno Upload] Non-JSON response:', text.substring(0, 200));

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
      console.error('[Suno Upload] API Error:', sunoData);
      res.status(sunoResponse.status).json({
        error: sunoData.msg || sunoData.message || 'Suno upload failed',
        details: sunoData
      });
      return;
    }

    console.log('[Suno Upload] Success:', sunoData.data?.downloadUrl || sunoData.data?.fileUrl);

    // Return the file URL to the client
    res.json({
      success: true,
      code: 200,
      data: {
        fileUrl: sunoData.data?.downloadUrl || sunoData.data?.fileUrl || sunoData.data?.url || sunoData.url
      }
    });

  } catch (error: any) {
    console.error('[Suno Upload] Error:', error);

    // Cleanup temp file on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

/**
 * Health Check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
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
    console.log(`[Gemini Proxy] Generating content with model: ${model}`);
    console.log(`[Gemini Proxy] Config:`, JSON.stringify(config, null, 2));
    
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
    
    console.log(`[Gemini Proxy] Calling SDK with:`, JSON.stringify(requestParams, null, 2));
    
    // Call the actual SDK method (correct signature)
    const result = await client.models.generateContent(requestParams);
    
    console.log(`[Gemini Proxy] Success - response type:`, typeof result);
    res.json(result);
  } catch (error: any) {
    console.error('[Gemini Proxy] generateContent Error:', error);
    console.error('[Gemini Proxy] Error stack:', error.stack);
    
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
    console.log(`[Gemini Proxy] Generating images with model: ${model}`);
    console.log(`[Gemini Proxy] Prompt:`, prompt?.substring(0, 100));
    
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
    
    console.log(`[Gemini Proxy] Image generation success`);
    res.json(result);
  } catch (error: any) {
    console.error('[Gemini Proxy] generateImages Error:', error);
    console.error('[Gemini Proxy] Error stack:', error.stack);
    res.status(500).json({ success: false, error: error.message || 'Gemini proxy failed', details: error.stack });
  }
});

// Director Service Proxy - Run Director Chain on Server
app.post('/api/director/generate', async (req: Request, res: Response) => {
  try {
    const { srtContent, style, contentType, videoPurpose, globalSubject, config } = req.body;
    
    console.log(`[Director Proxy] Generating prompts for ${contentType} (${style})`);
    
    // Dynamically import the service to avoid loading it on startup if not needed
    const { generatePromptsWithLangChain } = await import('../services/directorService.js');
    
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
    console.error('[Director Proxy] Error:', error);
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
    const model = 'gemini-2.0-flash-exp'; // Default
    const contents = { parts: [{ text: prompt }] };
    const config = options; // rough mapping
    
    console.log(`[Gemini Proxy] Redirecting legacy call to generateContent`);
    
    // Dynamically import ai client to ensure env vars are loaded
    const { ai } = await import('../services/shared/apiClient.js');
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
    console.error('[Gemini Image Proxy] Error:', error);
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
    console.error('[DEAPI Image Proxy] Error:', error);
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
    console.error('[DEAPI Animate Proxy] Error:', error);
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

  console.log(`[DeAPI Proxy] ${req.method} ${endpoint}`);

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
        console.log(`[DeAPI Proxy] Multipart request detected - forwarding raw body`);
        
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
      console.warn(`[DeAPI Proxy] Rate limited (429) for ${endpoint}`);
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
      console.error(`[DeAPI Proxy] API Error (${endpoint}):`, data);
      res.status(response.status).json(data);
      return;
    }

    res.json(data);

  } catch (error: any) {
    console.error(`[DeAPI Proxy] Error (${endpoint}):`, error);
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

  console.log(`[DeAPI img2video] Received image: ${req.file.originalname} (${req.file.size} bytes)`);

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

    console.log(`[DeAPI img2video] Forwarding to DeAPI with prompt: ${(req.body.prompt || '').substring(0, 50)}...`);

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
      console.warn(`[DeAPI img2video] Rate limited (429)`);
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
        console.error(`[DeAPI img2video] Cloudflare bot protection detected`);
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

      console.error(`[DeAPI img2video] Non-JSON response:`, text.substring(0, 200));
      res.status(502).json({ error: 'DeAPI returned non-JSON response', details: text.substring(0, 200) });
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      console.error(`[DeAPI img2video] API Error:`, data);
      res.status(response.status).json(data);
      return;
    }

    console.log(`[DeAPI img2video] Success:`, data.request_id || data.data?.request_id || 'immediate result');
    res.json(data);

  } catch (error: any) {
    console.error(`[DeAPI img2video] Error:`, error);

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
app.post('/api/generate-video-prompt', async (req: Request, res: Response) => {
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
      return res.status(400).json({ error: 'sceneDescription is required' });
    }

    console.log(`[Video Prompt] Generating professional prompt for: "${sceneDescription.substring(0, 50)}..."`);
    console.log(`[Video Prompt] Style: ${style}, Mood: ${mood}, Duration: ${duration}s`);

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

    console.log(`[Video Prompt] Generated prompt (${prompt.length} chars)`);
    res.json({ success: true, prompt });
  } catch (error: any) {
    console.error('[Video Prompt] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate video prompt' });
  }
});

/**
 * Veo 3.1 Video Generation (Test UI Endpoint)
 * Generates video using Veo 3.1 with the provided prompt
 */
app.post('/api/generate-video', async (req: Request, res: Response) => {
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
      return res.status(400).json({ error: 'prompt is required' });
    }

    console.log(`[Video Gen] Generating Veo 3.1 video (${useFastModel ? 'Fast' : 'Standard'} model)`);
    console.log(`[Video Gen] Prompt preview: "${prompt.substring(0, 100)}..."`);
    console.log(`[Video Gen] Settings: ${aspectRatio}, ${duration}s`);
    console.log(`[Video Gen] API Key available:`, !!process.env.VITE_GEMINI_API_KEY);

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

    console.log(`[Video Gen] Video generated successfully`);
    res.json({ success: true, videoUrl });
  } catch (error: any) {
    console.error('[Video Gen] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate video' });
  }
});

/**
 * Professional Video Generation (Combined endpoint)
 * First generates a professional prompt, then generates the video
 */
app.post('/api/generate-professional-video', async (req: Request, res: Response) => {
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
      return res.status(400).json({ error: 'sceneDescription is required' });
    }

    console.log(`[Pro Video] Starting professional video generation pipeline`);

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

    console.log(`[Pro Video] Video generated successfully`);
    res.json({ success: true, videoUrl });
  } catch (error: any) {
    console.error('[Pro Video] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate professional video' });
  }
});


/**
 * Video Download Proxy
 * Proxies video downloads from Google APIs to avoid CORS issues
 */
app.get('/api/download-video', async (req: Request, res: Response) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url parameter is required' });
    }

    console.log(`[Video Download] Proxying download from: ${url.substring(0, 100)}...`);

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

    console.log(`[Video Download] Download complete`);
  } catch (error: any) {
    console.error('[Video Download] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to download video' });
  }
});
// --- Real-Time Cloud Autosave Endpoints ---

// Lazy-load Google Cloud Storage
let gcsStorage: any = null;
let GcsStorageClass: any = null;
const GCS_BUCKET_NAME = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'aisoul-studio-storage';

function getGcsStorageClient(): any {
  if (gcsStorage) return gcsStorage;

  try {
    if (!GcsStorageClass) {
      const gcs = require('@google-cloud/storage');
      GcsStorageClass = gcs.Storage;
    }
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.VITE_GOOGLE_CLOUD_PROJECT;
    gcsStorage = projectId ? new GcsStorageClass({ projectId }) : new GcsStorageClass();
    return gcsStorage;
  } catch (error) {
    console.error('[Cloud] Failed to initialize GCS:', error);
    throw new Error(`Failed to load @google-cloud/storage: ${error}`);
  }
}

/**
 * Initialize Cloud Session Folder
 * Called immediately when "Plan Video" is started.
 */
app.post('/api/cloud/init', async (req: Request, res: Response) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const folderPath = `production_${sessionId}/`;

  try {
    const storage = getGcsStorageClient();
    const bucket = storage.bucket(GCS_BUCKET_NAME);

    const [exists] = await bucket.exists();
    if (!exists) {
      console.warn(`[Cloud] Bucket ${GCS_BUCKET_NAME} not found. Auto-save disabled.`);
      return res.status(404).json({ error: 'Bucket not found', bucketName: GCS_BUCKET_NAME });
    }

    // Create a "marker" file to officially "start" the folder
    await bucket.file(`${folderPath}_session_started.txt`).save(
      `Session Started: ${new Date().toISOString()}\nSessionId: ${sessionId}`
    );

    console.log(`[Cloud] ✓ Session folder initialized: ${folderPath}`);
    res.json({ success: true, folderPath, bucketName: GCS_BUCKET_NAME });
  } catch (error: any) {
    console.error('[Cloud] Init failed:', error.message);
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

app.post('/api/cloud/upload-asset', memoryUpload.single('file'), async (req: Request, res: Response) => {
  const { sessionId, assetType, filename } = req.body;

  if (!req.file || !sessionId) {
    return res.status(400).json({ error: 'Missing file or sessionId' });
  }

  // Validate assetType to prevent path traversal
  const validAssetTypes = ['visuals', 'audio', 'music', 'video_clips', 'sfx', 'subtitles'];
  const safeAssetType = validAssetTypes.includes(assetType) ? assetType : 'misc';

  // Sanitize filename
  const safeFilename = path.basename(filename || `asset_${Date.now()}`);
  const destination = `production_${sessionId}/${safeAssetType}/${safeFilename}`;

  try {
    const storage = getGcsStorageClient();
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
      console.error('[Cloud] Upload stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    });

    blobStream.on('finish', () => {
      console.log(`[Cloud] ✓ Saved: ${destination} (${Math.round(req.file!.size / 1024)}KB)`);
      res.json({
        success: true,
        path: destination,
        gsUri: `gs://${GCS_BUCKET_NAME}/${destination}`,
        size: req.file!.size
      });
    });

    blobStream.end(req.file.buffer);

  } catch (error: any) {
    console.error('[Cloud] Upload failed:', error.message);
    // Return success:false but don't fail hard - autosave is optional
    res.json({ success: false, error: error.message, warning: 'Asset not saved to cloud' });
  }
});

/**
 * Health check for cloud storage availability
 */
app.get('/api/cloud/status', async (req: Request, res: Response) => {
  try {
    const storage = getGcsStorageClient();
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
  console.log(`[Server] FFmpeg export server running on http://localhost:${PORT}`);
  console.log(`[Server] Temp directory: ${TEMP_DIR}`);
  console.log(`[Server] Test UI available at: file://${path.resolve(__dirname, '../test-video-ui.html')}`);
});

