/**
 * Video Service
 * Handles video generation functionality using Gemini Veo AI.
 *
 * Features:
 * - Veo 3.1 video generation (Fast and Standard modes)
 * - Professional AI-powered cinematographer prompt generation
 * - Automatic prompt enhancement for cinematic quality
 */

import { GoogleGenAI } from "@google/genai";
import { VIDEO_STYLE_MODIFIERS } from "../constants";
import { generateProfessionalVideoPrompt } from "./promptService";
import { cloudAutosave } from "./cloudStorageService";

// Initialize the AI client
const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";

if (!API_KEY) {
  console.warn("[Video Service] No API key found. Video generation will fail.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Veo 3.1 Model Names
const MODELS = {
  VIDEO_STANDARD: "veo-3.1-generate-preview",
  VIDEO_FAST: "veo-3.1-fast-generate-preview",
} as const;

/**
 * Simple retry wrapper for API calls
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      console.warn(`[Video Service] Attempt ${i + 1}/${maxRetries} failed:`, error.message);

      // Don't retry on permission/auth errors
      if (error.status === 403 || error.status === 401 || error.status === 404) {
        throw error;
      }

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }

  throw lastError;
}

/**
 * Poll a Veo video generation operation until complete.
 */
async function pollVideoOperation(
  operation: any,
  maxAttempts: number = 60,
  delayMs: number = 15000
): Promise<any> {
  let currentOp = operation;

  for (let i = 0; i < maxAttempts; i++) {
    // Check if operation is already done
    if (currentOp.done) {
      if (currentOp.error) {
        throw new Error(
          `Video generation failed: ${currentOp.error.message || JSON.stringify(currentOp.error)}`
        );
      }
      return currentOp;
    }

    console.log(
      `[Video Service] Video generation in progress... (attempt ${i + 1}/${maxAttempts})`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // FIXED: Use getVideosOperation instead of get
    try {
      currentOp = await ai.operations.getVideosOperation({ operation: currentOp });
    } catch (err: any) {
      // Fallback: try the generic get method if getVideosOperation isn't available
      console.warn("[Video Service] getVideosOperation failed, trying fallback...");
      currentOp = await ai.operations.get(currentOp);
    }
  }

  throw new Error(
    `Video generation timed out after ${(maxAttempts * delayMs) / 1000} seconds`
  );
}

/**
 * Extract a thumbnail from a video URL and save to cloud storage.
 * Uses video element + canvas to capture first frame.
 * Only runs in browser environment.
 */
async function extractVideoThumbnail(
  videoUrl: string,
  sessionId: string,
  sceneIndex: number = 0
): Promise<string | null> {
  // Only run in browser (canvas API not available in Node.js)
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    console.log('[Video Service] Thumbnail extraction skipped (server-side)');
    return null;
  }

  try {
    console.log('[Video Service] Extracting thumbnail from video...');

    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      video.muted = true;

      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        video.remove();
        console.warn('[Video Service] Thumbnail extraction timed out');
        resolve(null);
      }, 30000);

      video.onloadeddata = async () => {
        try {
          // Seek to first frame
          video.currentTime = 0;
        } catch (err) {
          clearTimeout(timeout);
          video.remove();
          resolve(null);
        }
      };

      video.onseeked = async () => {
        try {
          // Create canvas and draw frame
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            throw new Error('Failed to get canvas context');
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Convert to blob
          canvas.toBlob(async (blob) => {
            clearTimeout(timeout);
            video.remove();

            if (!blob) {
              console.warn('[Video Service] Failed to create thumbnail blob');
              resolve(null);
              return;
            }

            // Save to cloud storage
            const filename = `scene_${sceneIndex}.png`;
            await cloudAutosave.saveAsset(sessionId, blob, filename, 'visuals');
            console.log(`[Video Service] ✓ Thumbnail saved: ${filename}`);

            // Return as data URL for immediate use
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          }, 'image/png', 0.9);
        } catch (err) {
          clearTimeout(timeout);
          video.remove();
          console.warn('[Video Service] Thumbnail extraction failed:', err);
          resolve(null);
        }
      };

      video.onerror = () => {
        clearTimeout(timeout);
        video.remove();
        console.warn('[Video Service] Video load failed for thumbnail');
        resolve(null);
      };

      video.src = videoUrl;
      video.load();
    });
  } catch (err) {
    console.warn('[Video Service] Thumbnail extraction error:', err);
    return null;
  }
}

/**
 * Generate a video from a prompt using Veo 3.1.
 * @param promptText - The prompt describing the video to generate
 * @param style - Art style preset (default: "Cinematic")
 * @param globalSubject - Subject to keep consistent across scenes
 * @param aspectRatio - Video aspect ratio (default: "16:9")
 * @param durationSeconds - Video duration: 4, 6, or 8 seconds (default: 8)
 * @param useFastModel - Use Veo 3.1 Fast (40% faster, lower cost) vs Standard (highest quality)
 * @param outputGcsUri - Optional GCS URI for output
 * @param sessionId - Optional session ID for cloud autosave
 * @param sceneIndex - Optional scene index for cloud autosave filename
 */
export const generateVideoFromPrompt = async (
  promptText: string,
  style: string = "Cinematic",
  globalSubject: string = "",
  aspectRatio: "16:9" | "9:16" = "16:9",
  durationSeconds: 4 | 6 | 8 = 8,
  useFastModel: boolean = true,
  outputGcsUri?: string,
  sessionId?: string,
  sceneIndex?: number
): Promise<string> => {
  if (!API_KEY) {
    throw new Error(
      "Google API key not configured. Video generation requires a valid API key.\n" +
      "Set VITE_GEMINI_API_KEY in your .env file."
    );
  }

  return withRetry(async () => {
    // Get style modifier or use default
    const modifier = VIDEO_STYLE_MODIFIERS?.[style] || "Cinematic film look with professional color grading";

    const subjectBlock = globalSubject
      ? `Global Subject (keep consistent): ${globalSubject}`
      : "";

    const finalPrompt = `
${modifier}. ${promptText}${subjectBlock ? `. ${subjectBlock}` : ""}
Smooth camera motion. Focus on clean visuals without any text elements.
    `.trim();

    // Validate duration (Veo 3.1 supports 4, 6, or 8 seconds)
    const validDurations = [4, 6, 8] as const;
    if (!validDurations.includes(durationSeconds as any)) {
      console.warn(
        `[Video Service] Invalid duration ${durationSeconds}s. Defaulting to 8s. Valid: 4, 6, or 8 seconds.`
      );
      durationSeconds = 8;
    }

    // Select model
    const modelToUse = useFastModel ? MODELS.VIDEO_FAST : MODELS.VIDEO_STANDARD;

    console.log(`[Video Service] Using ${modelToUse} for ${durationSeconds}s video generation`);
    console.log(`[Video Service] Prompt: ${finalPrompt.substring(0, 100)}...`);

    // Build config object
    const config: {
      numberOfVideos?: number;
      aspectRatio?: string;
      outputGcsUri?: string;
    } = {
      numberOfVideos: 1,
      aspectRatio: aspectRatio,
    };

    // Add outputGcsUri if provided
    if (outputGcsUri) {
      config.outputGcsUri = outputGcsUri;
      console.log(`[Video Service] Output will be saved to: ${outputGcsUri}`);
    }

    // Generate video
    let operation;
    try {
      // @ts-ignore - generateVideos types may be incomplete
      operation = await ai.models.generateVideos({
        model: modelToUse,
        prompt: finalPrompt,
        config: config,
      });

      console.log(
        `[Video Service] Video generation started. Operation:`,
        operation.name || "started"
      );
    } catch (err: any) {
      // Provide helpful error messages for common issues
      if (err.status === 404 || err.message?.includes("NOT_FOUND")) {
        throw new Error(
          `Veo 3.1 model not available. Ensure you have:\n` +
          `1. A paid Gemini API plan (Veo requires paid tier)\n` +
          `2. Accepted Veo terms of service in AI Studio\n` +
          `3. Valid model: ${modelToUse}\n\n` +
          `Original error: ${err.message}`
        );
      }
      if (err.status === 403 || err.message?.includes("PERMISSION_DENIED")) {
        throw new Error(
          `Permission denied for Veo 3.1. Ensure your API key has video generation access.\n` +
          `Original error: ${err.message}`
        );
      }
      if (err.status === 429 || err.message?.includes("RATE_LIMIT")) {
        throw new Error(
          `Rate limit exceeded. Please wait before generating another video.\n` +
          `Original error: ${err.message}`
        );
      }
      throw err;
    }

    // Poll until complete
    const completedOp = await pollVideoOperation(operation);

    console.log(`[Video Service] Video generation complete!`);

    const response = completedOp.response;

    if (!response) {
      throw new Error("No response received from video generation");
    }

    console.log(`[Video Service] Response keys:`, Object.keys(response));

    // Extract video from response - handle multiple formats
    let videoObj: any = null;

    // Format 1: { generatedVideos: [{ video: {...} }] }
    if (response.generatedVideos?.length > 0) {
      console.log(`[Video Service] Found generatedVideos array format`);
      videoObj = response.generatedVideos[0].video || response.generatedVideos[0];
    }
    // Format 2: { video: {...} }
    else if (response.video) {
      console.log(`[Video Service] Found direct video object format`);
      videoObj = response.video;
    }
    // Format 3: REST API format
    else if (response.generateVideoResponse?.generatedSamples?.length > 0) {
      console.log(`[Video Service] Found generateVideoResponse format`);
      videoObj = response.generateVideoResponse.generatedSamples[0].video;
    }

    if (!videoObj) {
      console.error(
        `[Video Service] Unexpected response structure:`,
        JSON.stringify(response, null, 2)
      );
      throw new Error("No video found in response. Check logs for response structure.");
    }

    console.log(`[Video Service] Video object keys:`, Object.keys(videoObj));

    // Helper to trigger cloud autosave and thumbnail extraction
    const triggerAutosave = (videoUrl: string) => {
      if (sessionId && videoUrl) {
        // Save the video clip
        cloudAutosave.saveVideoClip(sessionId, videoUrl, sceneIndex ?? Date.now()).catch(err => {
          console.warn('[Video Service] Cloud autosave failed (non-fatal):', err);
        });

        // Extract and save thumbnail as fallback (fire-and-forget)
        extractVideoThumbnail(videoUrl, sessionId, sceneIndex ?? 0).catch(err => {
          console.warn('[Video Service] Thumbnail extraction failed (non-fatal):', err);
        });
      }
    };

    // Return URI if available
    if (videoObj.uri) {
      console.log(`[Video Service] ✓ Video URI found: ${videoObj.uri}`);
      // Append API key for authenticated download
      const videoUri = videoObj.uri.includes("?")
        ? `${videoObj.uri}&key=${API_KEY}`
        : `${videoObj.uri}?key=${API_KEY}`;

      // Cloud autosave trigger (fire-and-forget, non-blocking)
      triggerAutosave(videoUri);

      return videoUri;
    }

    // Return data URL if inline data
    const videoData =
      videoObj.data || videoObj.videoData || videoObj.bytesBase64Encoded;
    const mimeType = videoObj.mimeType || "video/mp4";

    if (videoData) {
      console.log(`[Video Service] ✓ Video data found inline (${mimeType})`);
      const sizeKB = ((videoData.length * 0.75) / 1024).toFixed(2);
      console.log(`[Video Service] Video size: ~${sizeKB} KB`);
      const dataUrl = `data:${mimeType};base64,${videoData}`;

      // Cloud autosave trigger (fire-and-forget, non-blocking)
      triggerAutosave(dataUrl);

      return dataUrl;
    }

    console.error(
      `[Video Service] Video object has no data:`,
      JSON.stringify(videoObj, null, 2)
    );
    throw new Error("No video URI or inline data found.");
  });
};

/**
 * Generate a professional cinematic video using AI-powered prompt enhancement.
 */
export const generateProfessionalVideo = async (
  sceneDescription: string,
  style: string = "Cinematic",
  mood: string = "dramatic",
  globalSubject: string = "",
  videoPurpose: string = "documentary",
  aspectRatio: "16:9" | "9:16" = "16:9",
  durationSeconds: 4 | 6 | 8 = 6,
  useFastModel: boolean = true,
  outputGcsUri?: string,
  sessionId?: string,
  sceneIndex?: number
): Promise<string> => {
  console.log(`[Video Service] Generating professional video prompt...`);
  console.log(`[Video Service] Style: ${style}, Mood: ${mood}, Duration: ${durationSeconds}s`);

  // Step 1: Generate professional prompt
  const professionalPrompt = await generateProfessionalVideoPrompt(
    sceneDescription,
    style,
    mood,
    globalSubject,
    videoPurpose,
    durationSeconds
  );

  console.log(
    `[Video Service] Professional prompt: "${professionalPrompt.substring(0, 150)}..."`
  );

  // Step 2: Generate video
  return generateVideoFromPrompt(
    professionalPrompt,
    style,
    globalSubject,
    aspectRatio,
    durationSeconds,
    useFastModel,
    outputGcsUri,
    sessionId,
    sceneIndex
  );
};

/**
 * Fetch a video URL and convert to a blob URL for local caching.
 * This prevents expired URL issues during re-export by caching the video data locally.
 * @param videoUrl - The video URL to fetch (can be temporary signed URL)
 * @returns A blob URL that persists in memory until the page is closed
 */
export const fetchAndCacheAsBlob = async (videoUrl: string): Promise<string> => {
  // Skip if already a blob URL or data URL
  if (videoUrl.startsWith('blob:') || videoUrl.startsWith('data:')) {
    console.log('[Video Service] Already cached as blob/data URL');
    return videoUrl;
  }

  try {
    console.log('[Video Service] Caching video as blob URL...');
    const response = await fetch(videoUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
    console.log(`[Video Service] ✓ Video cached as blob URL (${sizeMB} MB)`);

    return blobUrl;
  } catch (error) {
    console.warn('[Video Service] Failed to cache video as blob:', error);
    // Return original URL as fallback (may work if not expired yet)
    return videoUrl;
  }
};

/**
 * Generate video with automatic prompt enhancement.
 */
export const generateVideoWithEnhancement = async (
  promptText: string,
  style: string = "Cinematic",
  globalSubject: string = "",
  aspectRatio: "16:9" | "9:16" = "16:9",
  durationSeconds: 4 | 6 | 8 = 6,
  useFastModel: boolean = true,
  enhancePrompt: boolean | "auto" = "auto",
  mood: string = "dramatic",
  videoPurpose: string = "documentary"
): Promise<string> => {
  // Determine if prompt needs enhancement
  const promptWords = promptText.trim().split(/\s+/).length;
  const hasCamera = /camera|dolly|tracking|pan|zoom|steadicam|crane/i.test(promptText);
  const hasLighting = /lighting|lit|glow|backlight|silhouette|golden hour/i.test(promptText);
  const hasTechnical = /35mm|anamorphic|shallow depth|bokeh|lens/i.test(promptText);

  const isAlreadyProfessional =
    promptWords > 80 && (hasCamera || hasLighting || hasTechnical);

  const shouldEnhance =
    enhancePrompt === true || (enhancePrompt === "auto" && !isAlreadyProfessional);

  if (shouldEnhance) {
    console.log(
      `[Video Service] Enhancing prompt (${promptWords} words, professional: ${isAlreadyProfessional})`
    );
    return generateProfessionalVideo(
      promptText,
      style,
      mood,
      globalSubject,
      videoPurpose,
      aspectRatio,
      durationSeconds,
      useFastModel
    );
  }

  console.log(`[Video Service] Using prompt directly (already professional)`);
  return generateVideoFromPrompt(
    promptText,
    style,
    globalSubject,
    aspectRatio,
    durationSeconds,
    useFastModel
  );
};



