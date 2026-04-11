/**
 * DeAPI video generation: txt2video, img2video (animate), and batch
 */

import { cloudAutosave } from '../../cloud/cloudStorageService';
import { mediaLogger } from '../../infrastructure/logger';
import {
  DEAPI_DIRECT_BASE,
  DEFAULT_VIDEO_MODEL,
  isBrowser,
  API_KEY,
  base64ToBlob,
  getDeApiDimensions,
  pollRequest,
  Semaphore,
} from './config';
import { isDeApiConfigured } from './apiConfig';
import { removeImageBackground } from './styleProcessing';

const log = mediaLogger.child('DeAPI:Video');
import type {
  Txt2VideoParams,
  DeApiResponse,
  BatchGenerationResult,
  BatchGenerationProgress,
} from './types';

export const generateVideoWithDeApi = async (
  params: Txt2VideoParams,
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
  sessionId?: string,
  sceneIndex?: number,
  onProgress?: (progress: number, preview?: string) => void,
): Promise<string> => {
  if (!isDeApiConfigured()) {
    throw new Error(
      "DeAPI API key is not configured on the server.\n\n" +
      "To use DeAPI text-to-video:\n" +
      "1. Get an API key from https://deapi.ai\n" +
      "2. Add VITE_DEAPI_API_KEY=your_key to your .env.local file\n" +
      "3. Restart the development server (npm run dev:all)"
    );
  }

  const { width, height } = getDeApiDimensions(aspectRatio);

  const {
    prompt,
    model = DEFAULT_VIDEO_MODEL,
    guidance = 0,
    steps = 1,
    frames = 120,
    fps = 30,
    seed = -1,
    webhook_url,
  } = params;

  log.info(`Generating video from text: ${width}x${height}, prompt: ${prompt.substring(0, 50)}...`);

  let response: Response;

  if (isBrowser) {
    // Browser: send JSON to the dedicated server proxy endpoint.
    // FormData is NOT used here — the server route accepts JSON for txt2video.
    // webhook_url included only when provided (server validates it server-side).
    const jsonBody: Record<string, unknown> = {
      prompt, model, width, height, guidance, steps, frames, fps, seed,
    };
    if (webhook_url) jsonBody.webhook_url = webhook_url;

    response = await fetch('/api/deapi/txt2video', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jsonBody),
      signal: AbortSignal.timeout(60_000),
    });
  } else {
    // Server: send multipart/form-data directly to DeAPI.
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("model", model);
    formData.append("width", width.toString());
    formData.append("height", height.toString());
    formData.append("guidance", guidance.toString());
    formData.append("steps", steps.toString());
    formData.append("frames", frames.toString());
    formData.append("fps", fps.toString());
    formData.append("seed", seed.toString());
    if (webhook_url) formData.append("webhook_url", webhook_url);

    response = await fetch(`${DEAPI_DIRECT_BASE}/txt2video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AISoulStudio/1.0",
      },
      body: formData,
      signal: AbortSignal.timeout(60_000),
    });
  }

  if (!response.ok) {
    const errText = await response.text();
    let errorMessage = `DeAPI txt2video request failed (${response.status})`;

    if (errText.includes('Just a moment') || errText.includes('challenge-platform')) {
      throw new Error(
        `DeAPI txt2video blocked by Cloudflare bot protection.\n` +
        `Use the app in browser (npm run dev:all) - browsers handle Cloudflare automatically.`
      );
    }

    try {
      const errJson = JSON.parse(errText);
      if (errJson.message) errorMessage = `DeAPI: ${errJson.message}`;
      else if (errJson.error) errorMessage = `DeAPI: ${errJson.error}`;
    } catch {
      if (errText) errorMessage = `DeAPI txt2video: ${errText.substring(0, 200)}`;
    }

    throw new Error(errorMessage);
  }

  const rawData = await response.json();
  log.debug('txt2video raw response', rawData);

  const data: DeApiResponse = rawData.data || rawData;

  let videoUrl: string;

  if (data.result_url) {
    log.info('Video ready immediately!');
    videoUrl = data.result_url;
  } else if (data.status === "error") {
    throw new Error(data.error || "Video generation failed at provider");
  } else if (data.request_id) {
    log.info(`Polling for txt2video request: ${data.request_id}`);
    videoUrl = await pollRequest(data.request_id, onProgress);
  } else {
    throw new Error("No request_id or result_url received from DeAPI txt2video");
  }

  log.info(`Downloading video from: ${videoUrl.substring(0, 80)}...`);
  const vidResp = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });

  if (!vidResp.ok) {
    throw new Error(`Failed to download generated video: ${vidResp.status}`);
  }

  const vidBlob = await vidResp.blob();
  log.info(`Video downloaded: ${(vidBlob.size / 1024 / 1024).toFixed(2)} MB`);

  if (sessionId && sceneIndex !== undefined) {
    cloudAutosave.saveAsset(
      sessionId,
      vidBlob,
      `scene_${sceneIndex}_txt2video.mp4`,
      'video_clips'
    ).catch(err => {
      log.warn('Cloud upload failed (non-fatal)', err);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to convert video to base64"));
    reader.readAsDataURL(vidBlob);
  });
};

export const animateImageWithDeApi = async (
  base64ImageInput: string,
  prompt: string,
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
  sessionId?: string,
  sceneIndex?: number,
  options?: {
    last_frame_image?: string;
    webhook_url?: string;
    motionStrength?: 'subtle' | 'moderate' | 'dynamic';
    targetDurationSeconds?: number;
    seed?: number;
    removeBackground?: boolean;
    onProgress?: (progress: number, preview?: string) => void;
  },
): Promise<string> => {
  let base64Image = base64ImageInput;

  if (!isDeApiConfigured()) {
    throw new Error(
      "DeAPI API key is not configured on the server.\n\n" +
      "DeAPI is an optional video animation provider that converts still images to video loops.\n\n" +
      "To use DeAPI:\n" +
      "1. Get an API key from https://deapi.ai ($20 free credits for new accounts)\n" +
      "2. Add VITE_DEAPI_API_KEY=your_key to your .env.local file\n" +
      "3. Restart the development server (npm run dev:all)\n\n" +
      "Alternatives:\n" +
      "• Switch to 'Google Veo' as your video provider (requires paid Gemini API plan)\n" +
      "• Use 'Image' generation mode instead of video",
    );
  }

  if (!base64Image || (!base64Image.startsWith('data:image/') && !base64Image.startsWith('data:application/octet-stream'))) {
    if (base64Image && /^[A-Za-z0-9+/=]/.test(base64Image) && !base64Image.includes(':')) {
      log.warn('Received raw base64 without data URL prefix, adding image/png prefix');
      base64Image = `data:image/png;base64,${base64Image}`;
    } else {
      throw new Error(
        `DeAPI img2video requires a valid image data URL. ` +
        `Received: ${base64Image ? base64Image.substring(0, 50) + '...' : 'empty/null'}`
      );
    }
  }

  if (options?.removeBackground) {
    try {
      log.info('Removing background before animation...');
      base64Image = await removeImageBackground(base64Image, sessionId, sceneIndex);
      log.info('Background removed — proceeding to animate');
    } catch (err) {
      log.warn('Background removal failed (non-fatal), animating with original', err);
    }
  }

  log.info('Proceeding with animation...');

  const { width, height } = getDeApiDimensions(aspectRatio);

  const formData = new FormData();
  const imageBlob = await base64ToBlob(base64Image);

  const motionFrameMap = {
    subtle: 73,
    moderate: 121,
    dynamic: 241,
  } as const;
  const motionStrength = options?.motionStrength || 'moderate';
  const frames = options?.targetDurationSeconds
    ? Math.round(options.targetDurationSeconds * 24)
    : (motionFrameMap[motionStrength] || 121);

  const safeWidth = Math.max(width, 512);
  const safeHeight = Math.max(height, 512);
  if (safeWidth !== width || safeHeight !== height) {
    log.warn(`Dimension clamp applied: ${width}x${height} → ${safeWidth}x${safeHeight}. Update getDeApiDimensions() to fix at source.`);
  }

  formData.append("first_frame_image", imageBlob, "frame0.png");
  formData.append("prompt", prompt);
  formData.append("frames", frames.toString());
  formData.append("width", safeWidth.toString());
  formData.append("height", safeHeight.toString());
  formData.append("fps", "24");
  formData.append("model", DEFAULT_VIDEO_MODEL);
  formData.append("guidance", "0");
  formData.append("steps", "1");
  formData.append("seed", (options?.seed ?? -1).toString());

  if (options?.last_frame_image) {
    const lastFrameBlob = await base64ToBlob(options.last_frame_image);
    formData.append("last_frame_image", lastFrameBlob, "frame_last.png");
  }

  if (options?.webhook_url) {
    formData.append("webhook_url", options.webhook_url);
  }

  log.info(`Submitting img2video request: ${safeWidth}x${safeHeight}, prompt: ${prompt.substring(0, 50)}...`);

  let response: Response;

  if (isBrowser) {
    response = await fetch('/api/deapi/img2video', {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(60_000),
    });
  } else {
    response = await fetch(`${DEAPI_DIRECT_BASE}/img2video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AISoulStudio/1.0",
      },
      body: formData,
      signal: AbortSignal.timeout(60_000),
    });
  }

  if (!response.ok) {
    const errText = await response.text();
    let errorMessage = `DeAPI request failed (${response.status})`;

    if (errText.includes('Just a moment') || errText.includes('challenge-platform') || errText.includes('_cf_chl')) {
      throw new Error(
        `DeAPI img2video blocked by Cloudflare bot protection.\n\n` +
        `This happens because DeAPI's video generation endpoint has stricter protection ` +
        `against automated/server-side requests.\n\n` +
        `Solutions:\n` +
        `1. Use the app in browser (npm run dev:all) - browsers handle Cloudflare automatically\n` +
        `2. Contact DeAPI support (support@deapi.ai) to request server-to-server access\n` +
        `3. Switch to Google Veo as your video provider (requires paid Gemini API plan)`
      );
    }

    try {
      const errJson = JSON.parse(errText);
      if (errJson.message) errorMessage = `DeAPI: ${errJson.message}`;
      else if (errJson.error) errorMessage = `DeAPI: ${errJson.error}`;
    } catch {
      if (errText) errorMessage = `DeAPI img2video failed: API error: ${errText.substring(0, 200)}...`;
    }

    throw new Error(errorMessage);
  }

  const rawData = await response.json();
  log.debug('Raw response', rawData);

  const data: DeApiResponse = rawData.data || rawData;
  log.debug('Parsed response', data);

  let videoUrl: string;

  if (data.result_url) {
    log.info(`Video ready immediately! Status: ${data.status || 'unknown'}`);
    videoUrl = data.result_url;
  } else if (data.status === "error") {
    throw new Error(data.error || "Generation failed at provider");
  } else if (data.request_id) {
    log.info(`Polling for request: ${data.request_id}, status: ${data.status}`);
    videoUrl = await pollRequest(data.request_id, options?.onProgress);
  } else {
    log.error('Unexpected response structure', rawData);
    throw new Error(
      `No request_id or result_url received from DeAPI.\n\n` +
      `Response structure: ${JSON.stringify(rawData, null, 2)}\n\n` +
      `This might indicate:\n` +
      `1. API key is invalid or expired\n` +
      `2. API endpoint has changed\n` +
      `3. Request parameters are incorrect\n\n` +
      `Check browser console for full response details.`
    );
  }

  log.info(`Downloading video from: ${videoUrl.substring(0, 80)}...`);
  const vidResp = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });

  if (!vidResp.ok) {
    throw new Error(`Failed to download generated video: ${vidResp.status}`);
  }

  const vidBlob = await vidResp.blob();
  log.info(`Video downloaded: ${(vidBlob.size / 1024 / 1024).toFixed(2)} MB`);

  if (sessionId && sceneIndex !== undefined) {
    cloudAutosave.saveAsset(
      sessionId,
      vidBlob,
      `scene_${sceneIndex}_deapi.mp4`,
      'video_clips'
    ).catch(err => {
      log.warn('Cloud upload failed (non-fatal)', err);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to convert video to base64"));
    reader.readAsDataURL(vidBlob);
  });
};


export const animateImageBatch = async (
  items: Array<{
    id: string;
    imageUrl: string;
    prompt: string;
    aspectRatio?: "16:9" | "9:16" | "1:1";
    seed?: number;
    targetDurationSeconds?: number;
  }>,
  concurrencyLimit: number = 2,
  onProgress?: (progress: BatchGenerationProgress) => void
): Promise<BatchGenerationResult[]> => {
  if (!isDeApiConfigured()) {
    throw new Error("DeAPI API key is not configured.");
  }

  if (items.length === 0) {
    return [];
  }

  const effectiveConcurrency = Math.max(1, Math.min(concurrencyLimit, 4));

  const sortedItems = [...items].sort((a, b) => {
    const parseId = (id: string) => {
      const parts = id.split('_');
      return { scene: parseInt(parts[2] || '0'), shot: parseInt(parts[3] || '0') };
    };
    const pa = parseId(a.id);
    const pb = parseId(b.id);
    return pa.scene - pb.scene || pa.shot - pb.shot;
  });

  const semaphore = new Semaphore(effectiveConcurrency);
  const results: BatchGenerationResult[] = [];
  let completed = 0;
  const totalBatches = Math.ceil(sortedItems.length / effectiveConcurrency);

  log.info(`Batch starting: ${sortedItems.length} items, concurrency: ${effectiveConcurrency}`);

  const processItem = async (item: typeof items[0]): Promise<BatchGenerationResult> => {
    await semaphore.acquire();

    try {
      log.info(`Batch animating item ${item.id}...`);

      const videoUrl = await animateImageWithDeApi(
        item.imageUrl,
        item.prompt,
        item.aspectRatio || "16:9",
        undefined,
        undefined,
        { seed: item.seed, targetDurationSeconds: item.targetDurationSeconds }
      );

      return { id: item.id, success: true, imageUrl: videoUrl };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Batch failed to animate item ${item.id}: ${errorMessage}`);
      return { id: item.id, success: false, error: errorMessage };
    } finally {
      semaphore.release();
      completed++;

      const currentBatch = Math.ceil(completed / effectiveConcurrency);
      onProgress?.({
        completed,
        total: sortedItems.length,
        currentBatch,
        totalBatches,
        results: [...results],
      });
    }
  };

  const promises = sortedItems.map(processItem);
  const allResults = await Promise.all(promises);

  const resultMap = new Map(allResults.map(r => [r.id, r]));
  const orderedResults = sortedItems.map(item => resultMap.get(item.id)!);

  const successCount = orderedResults.filter(r => r.success).length;
  log.info(`Batch complete: ${successCount}/${items.length} successful`);

  return orderedResults;
};
