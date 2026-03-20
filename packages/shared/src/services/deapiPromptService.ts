/**
 * DeAPI Prompt Enhancement Service
 *
 * Wraps DeAPI's three prompt-enhancement endpoints:
 *   /prompt/image        — for txt2img / img generation prompts
 *   /prompt/video        — for txt2video / img2video motion prompts
 *   /prompt/image2image  — for img2img style-transfer prompts
 *
 * Each function falls back silently to the original text if:
 *   - DeAPI is not configured (no API key)
 *   - The request fails for any reason
 *
 * This makes every call non-blocking and non-fatal.
 *
 * Server routes: /api/deapi/prompt/:type (added in deapi.ts)
 */

// @ts-ignore — Vite injects import.meta.env at build time
const VITE_API_KEY: string = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DEAPI_API_KEY) || '';
const API_KEY: string = VITE_API_KEY || (typeof process !== 'undefined' ? (process.env?.DEAPI_API_KEY ?? '') : '');

const DEAPI_DIRECT_BASE = 'https://api.deapi.ai/api/v1/client';
const isBrowser = typeof window !== 'undefined';

const isConfigured = (): boolean => {
  if (isBrowser) return true; // proxy handles auth
  return Boolean(API_KEY?.trim());
};

type PromptEndpointType = 'image' | 'video' | 'image2image';

/**
 * Core helper: POST to a DeAPI /prompt/* endpoint and return the enhanced string.
 * Returns null on any failure so callers can fall back to the original prompt.
 */
async function callPromptEndpoint(
  type: PromptEndpointType,
  prompt: string,
): Promise<string | null> {
  try {
    const url = isBrowser
      ? `/api/deapi/prompt/${type}`
      : `${DEAPI_DIRECT_BASE}/prompt/${type}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (!isBrowser) {
      headers['Authorization'] = `Bearer ${API_KEY}`;
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AISoulStudio/1.0';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      console.warn(`[DeAPI Prompt] /prompt/${type} returned ${response.status}`);
      return null;
    }

    const rawData = await response.json();
    const data = rawData.data ?? rawData;
    const enhanced: string | undefined = data.enhanced_prompt;

    if (!enhanced?.trim()) return null;

    console.log(`[DeAPI Prompt] /prompt/${type} enhanced (${prompt.length} → ${enhanced.length} chars)`);
    return enhanced.trim();
  } catch (err) {
    console.warn(`[DeAPI Prompt] /prompt/${type} failed (non-fatal):`, err);
    return null;
  }
}

// ---- Public API -----------------------------------------------------------

/**
 * Enhance an image generation prompt via DeAPI's specialized image prompt model.
 * Adds photography technique keywords, improves composition language, and
 * refines lighting/style descriptors.
 *
 * Use as a final polish pass after `serializeStyleGuideAsText()` or
 * after Gemini's `refineImagePromptWithAI()`.
 *
 * @param prompt - The prompt to enhance
 * @returns Enhanced prompt, or the original if DeAPI is unavailable
 */
export async function enhanceImagePrompt(prompt: string): Promise<string> {
  if (!isConfigured() || !prompt.trim()) return prompt;
  return (await callPromptEndpoint('image', prompt)) ?? prompt;
}

/**
 * Enhance a video/motion prompt via DeAPI's specialized video prompt model.
 * Improves temporal language, motion descriptions, and camera movement cues.
 *
 * Use on the combined motion prompt string from `generateMotionPrompt()`
 * before passing it to `animateImageWithDeApi()` or `generateVideoFromText()`.
 *
 * @param prompt - Camera/motion prompt to enhance
 * @returns Enhanced prompt, or the original if DeAPI is unavailable
 */
export async function enhanceVideoPrompt(prompt: string): Promise<string> {
  if (!isConfigured() || !prompt.trim()) return prompt;
  return (await callPromptEndpoint('video', prompt)) ?? prompt;
}

/**
 * Enhance an image-to-image transformation prompt via DeAPI's img2img prompt model.
 * Optimized for reference-image style transfers: clarifies what to preserve,
 * what to change, and how to blend styles.
 *
 * Use on the scene description before calling `applyStyleConsistency()`.
 *
 * @param prompt - Scene/transformation description to enhance
 * @returns Enhanced prompt, or the original if DeAPI is unavailable
 */
export async function enhanceImg2ImgPrompt(prompt: string): Promise<string> {
  if (!isConfigured() || !prompt.trim()) return prompt;
  return (await callPromptEndpoint('image2image', prompt)) ?? prompt;
}
