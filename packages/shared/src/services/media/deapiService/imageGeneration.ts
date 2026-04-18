/**
 * DeAPI image generation (txt2img and batch)
 */

import {
  API_BASE,
  isBrowser,
  API_KEY,
  getDeApiDimensions,
  pollRequest,
  Semaphore,
  withExponentialBackoff,
  deapiGlobalLimiter,
  DeApiPayloadError,
  DeApiRateLimitError,
} from './config';
import { isDeApiConfigured } from './apiConfig';
import { DEAPI_DEFAULTS, IMAGE_MODEL_META } from './models';
import { mediaLogger } from '../../infrastructure/logger';
import { enhanceImagePrompt } from '../deapiPromptService';

import type {
  Txt2ImgParams,
  DeApiImageModel,
  BatchGenerationItem,
  BatchGenerationResult,
  BatchGenerationProgress,
  DeApiResponse,
} from './types';

const log = mediaLogger.child('DeAPI:Image');

export const generateImageWithDeApi = async (
  params: Txt2ImgParams
): Promise<string> => {
  if (!isDeApiConfigured()) {
    throw new Error(
      "DeAPI API key is not configured on the server.\n\n" +
      "To use DeAPI text-to-image:\n" +
      "1. Get an API key from https://deapi.ai\n" +
      "2. Add DEAPI_API_KEY=your_key to your .env.local file\n" +
      "3. Restart the development server (npm run dev:all)"
    );
  }

  const {
    prompt,
    model = DEAPI_DEFAULTS.IMAGE_MODEL,
    width = 768,
    height = 768,
    guidance,
    steps = 4,
    seed = -1,
    negative_prompt = "blur, darkness, noise, low quality, watermark, text overlay, UI elements, blurry, low resolution",
    loras,
    webhook_url,
  } = params;

  const modelMeta = IMAGE_MODEL_META[model as DeApiImageModel];
  const effectiveGuidance = guidance ?? (modelMeta?.supportsGuidance === false ? 1 : 7.5);

  // Model-aware prompt shaping:
  // Schnell/turbo models degrade with long descriptive prompts — compress to keyword form.
  // Guidance-capable models (Klein, ZImageTurbo) benefit from fuller descriptive prompts.
  const words = prompt.trim().split(/\s+/);
  const promptWordLimit = modelMeta?.supportsGuidance === false ? 50 : 150;
  const shapedPrompt = words.length > promptWordLimit
    ? words.slice(0, promptWordLimit).join(' ')
    : prompt;

  // Enhance prompt via DeAPI's own /prompt/image model — browser only.
  // Skipped server-side to avoid an extra outbound hop before the main txt2img call.
  const finalPrompt = isBrowser ? await enhanceImagePrompt(shapedPrompt) : shapedPrompt;

  log.info(`Generating image: ${model}, ${width}x${height}, prompt: ${finalPrompt.substring(0, 50)}...`);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (!isBrowser) {
    headers.Authorization = `Bearer ${API_KEY}`;
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AISoulStudio/1.0";
  }

  const requestBody: Record<string, unknown> = {
    prompt: finalPrompt, model, width, height, guidance: effectiveGuidance, steps, seed, negative_prompt,
  };

  if (loras) requestBody.loras = loras;
  if (webhook_url) requestBody.webhook_url = webhook_url;

  const rawData = await withExponentialBackoff(async () => {
    await deapiGlobalLimiter.waitForSlot();
    const response = await fetch(`${API_BASE}/txt2img`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMessage = `DeAPI txt2img request failed (${response.status})`;

      try {
        const errJson = JSON.parse(errText);
        if (errJson.message) errorMessage = `DeAPI: ${errJson.message}`;
        else if (errJson.error) errorMessage = `DeAPI: ${errJson.error}`;
      } catch {
        if (errText) errorMessage = `DeAPI: ${errText}`;
      }

      if (response.status === 422) throw new DeApiPayloadError(errorMessage);
      if (response.status === 429) throw new DeApiRateLimitError(errorMessage);
      throw new Error(errorMessage);
    }

    return response.json();
  }, { maxRetries: 3, initialDelayMs: 1000 });
  log.debug(`txt2img raw response: ${JSON.stringify(rawData, null, 2)}`);

  const data: DeApiResponse = rawData.data || rawData;
  log.debug(`txt2img parsed response: ${JSON.stringify(data)}`);

  let imageUrl: string;

  if (data.result_url) {
    log.info(`Image ready immediately! Status: ${data.status || 'unknown'}`);
    imageUrl = data.result_url;
  } else if (data.status === "error") {
    throw new Error(data.error || "Image generation failed at provider");
  } else if (data.request_id) {
    log.info(`Polling for txt2img request: ${data.request_id}`);
    imageUrl = await pollRequest(data.request_id);
  } else {
    log.error(`Unexpected txt2img response: ${JSON.stringify(rawData)}`);
    throw new Error("No request_id or result_url received from DeAPI txt2img");
  }

  log.debug(`Downloading image from: ${imageUrl.substring(0, 80)}...`);
  const imgBlob = await withExponentialBackoff(async () => {
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) {
      throw new Error(`Failed to download generated image: ${imgResp.status}`);
    }
    return imgResp.blob();
  }, { maxRetries: 3, initialDelayMs: 1000 });
  log.info(`Image downloaded: ${(imgBlob.size / 1024).toFixed(2)} KB`);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to convert image to base64"));
    reader.readAsDataURL(imgBlob);
  });
};

export const generateImageWithAspectRatio = async (
  prompt: string,
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
  model: DeApiImageModel = DEAPI_DEFAULTS.IMAGE_MODEL,
  negativePrompt?: string
): Promise<string> => {
  const dimensions = getDeApiDimensions(aspectRatio);

  return generateImageWithDeApi({
    prompt,
    model,
    width: dimensions.width,
    height: dimensions.height,
    negative_prompt: negativePrompt,
  });
};

export const generateImageBatch = async (
  items: BatchGenerationItem[],
  concurrencyLimit: number = 5,
  onProgress?: (progress: BatchGenerationProgress) => void
): Promise<BatchGenerationResult[]> => {
  if (!isDeApiConfigured()) {
    throw new Error("DeAPI API key is not configured.");
  }

  if (items.length === 0) {
    return [];
  }

  // Cap at 5 (matches premium-tier `getRecommendedConcurrency`); the global limiter still gates per-request spacing.
  const effectiveConcurrency = Math.max(1, Math.min(concurrencyLimit, 5));
  const semaphore = new Semaphore(effectiveConcurrency);
  const results: BatchGenerationResult[] = [];
  let completed = 0;
  const totalBatches = Math.ceil(items.length / effectiveConcurrency);

  log.info(`Batch: Starting generation: ${items.length} items, concurrency: ${effectiveConcurrency}`);

  const processItem = async (item: BatchGenerationItem): Promise<BatchGenerationResult> => {
    await semaphore.acquire();

    try {
      log.debug(`Batch: Processing item ${item.id}: ${item.prompt.substring(0, 50)}...`);

      const imageUrl = await generateImageWithAspectRatio(
        item.prompt,
        item.aspectRatio || "16:9",
        item.model || DEAPI_DEFAULTS.IMAGE_MODEL,
        item.negativePrompt
      );

      return { id: item.id, success: true, imageUrl };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Batch: Failed to generate item ${item.id}: ${errorMessage}`);
      return { id: item.id, success: false, error: errorMessage };
    } finally {
      semaphore.release();
      completed++;

      const currentBatch = Math.ceil(completed / effectiveConcurrency);
      onProgress?.({
        completed,
        total: items.length,
        currentBatch,
        totalBatches,
        results: [...results],
      });
    }
  };

  const promises = items.map(processItem);
  const allResults = await Promise.all(promises);

  const resultMap = new Map(allResults.map(r => [r.id, r]));
  const orderedResults = items.map(item => resultMap.get(item.id)!);

  const successCount = orderedResults.filter(r => r.success).length;
  log.info(`Batch complete: ${successCount}/${items.length} successful`);

  return orderedResults;
};
