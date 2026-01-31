/**
 * Image Service
 * Handles image generation functionality using Gemini AI.
 * 
 * Features:
 * - Character seed tracking for visual consistency
 * - Automatic prompt refinement and linting
 * - Support for both Imagen and Gemini image models
 */

import { ai, MODELS, withRetry } from "./shared/apiClient";
import { IMAGE_STYLE_MODIFIERS, DEFAULT_NEGATIVE_CONSTRAINTS } from "../constants";
import { refineImagePrompt } from "./promptService";
import { traceAsync } from "./tracing";
import { cloudAutosave } from "./cloudStorageService";

// --- Character Seed Registry ---
// Stores seeds for character consistency across scenes

interface CharacterSeed {
  characterKey: string; // Normalized character identifier
  seed: number;
  createdAt: number;
  usageCount: number;
}

const characterSeedRegistry: Map<string, CharacterSeed> = new Map();

/**
 * Normalize a character description to create a consistent key.
 * Extracts key features like "young woman, brown hair, blue dress"
 */
function normalizeCharacterKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2)
    .slice(0, 10) // Take first 10 meaningful words
    .sort()
    .join('_');
}

/**
 * Generate a random seed value.
 */
function generateRandomSeed(): number {
  return Math.floor(Math.random() * 2147483647); // Max 32-bit int
}

/**
 * Get or create a seed for a character.
 * If the character has been seen before, returns the same seed.
 */
export function getCharacterSeed(characterDescription: string): number {
  const key = normalizeCharacterKey(characterDescription);

  const existing = characterSeedRegistry.get(key);
  if (existing) {
    existing.usageCount++;
    console.log(`[ImageService] Reusing seed ${existing.seed} for character: ${key} (usage #${existing.usageCount})`);
    return existing.seed;
  }

  const newSeed = generateRandomSeed();
  characterSeedRegistry.set(key, {
    characterKey: key,
    seed: newSeed,
    createdAt: Date.now(),
    usageCount: 1,
  });

  console.log(`[ImageService] Created new seed ${newSeed} for character: ${key}`);
  return newSeed;
}

/**
 * Clear all character seeds (e.g., when starting a new project).
 */
export function clearCharacterSeeds(): void {
  characterSeedRegistry.clear();
  console.log('[ImageService] Cleared all character seeds');
}

/**
 * Get all registered character seeds (for debugging/display).
 */
export function getCharacterSeedRegistry(): CharacterSeed[] {
  return Array.from(characterSeedRegistry.values());
}

/**
 * Check if the model is an Imagen model (requires generateImages API).
 */
function isImagenModel(model: string): boolean {
  return model.toLowerCase().includes("imagen");
}

/**
 * Generate image using Imagen API (generateImages method).
 * Used for imagen-3.0, imagen-4.0, etc.
 * 
 * @param prompt - The image generation prompt
 * @param aspectRatio - Image aspect ratio
 * @param seed - Optional seed for consistent character generation
 */
async function generateWithImagenAPI(
  prompt: string,
  aspectRatio: string,
  seed?: number
): Promise<string> {
  console.log(`[ImageService] Using Imagen API with model: ${MODELS.IMAGE}${seed ? ` (seed: ${seed})` : ''}`);

  // Build base config
  const config: Record<string, unknown> = {
    numberOfImages: 1,
    aspectRatio: aspectRatio,
    personGeneration: "allow_adult",
  };

  // Add seed if provided - NOTE: seed requires addWatermark=false and enhancePrompt=false
  if (seed !== undefined) {
    config.seed = seed;
    config.addWatermark = false;
    config.enhancePrompt = false;
  }

  const response = await ai.models.generateImages({
    model: MODELS.IMAGE,
    prompt: prompt,
    // @ts-ignore - some config options may not be in types yet
    config,
  });

  // Check if we got generated images
  const img = response.generatedImages?.[0];
  if (img) {
    // Check if image was filtered
    if (img.raiFilteredReason) {
      console.warn(`[ImageService] Image was filtered: ${img.raiFilteredReason}`);
      throw new Error(`Image generation was filtered by safety system: ${img.raiFilteredReason}`);
    }

    // Get the image bytes
    if (img.image?.imageBytes) {
      return `data:image/png;base64,${img.image.imageBytes}`;
    }
  }

  throw new Error("No image data found in Imagen response");
}

/**
 * Generate image using Gemini API (generateContent method).
 * Used for gemini-2.5-flash-image, gemini-3-pro-image-preview, etc.
 */
async function generateWithGeminiAPI(prompt: string, aspectRatio: string): Promise<string> {
  console.log(`[ImageService] Using Gemini API with model: ${MODELS.IMAGE}`);

  const response = await ai.models.generateContent({
    model: MODELS.IMAGE,
    contents: { parts: [{ text: prompt }] },
    config: {
      // @ts-ignore
      imageConfig: { aspectRatio: aspectRatio },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image data found in Gemini response");
}

/**
 * Generate an image from a prompt.
 * @param promptText - The prompt describing the image to generate
 * @param style - Art style preset (default: "Cinematic")
 * @param globalSubject - Subject to keep consistent across scenes (also used for seed tracking)
 * @param aspectRatio - Image aspect ratio (default: "16:9")
 * @param skipRefine - Skip AI refinement if prompt was already refined upstream
 * @param seed - Optional seed for reproducibility. If globalSubject is provided, a consistent seed is auto-generated.
 * @param sessionId - Optional session ID for cloud autosave
 * @param sceneIndex - Optional scene index for cloud autosave filename
 */
export const generateImageFromPrompt = traceAsync(
  async function generateImageFromPromptImpl(
    promptText: string,
    style: string = "Cinematic",
    globalSubject: string = "",
    aspectRatio: string = "16:9",
    skipRefine: boolean = false,
    seed?: number,
    sessionId?: string,
    sceneIndex?: number,
  ): Promise<string> {
    return withRetry(async () => {
      const modifier = IMAGE_STYLE_MODIFIERS[style] || IMAGE_STYLE_MODIFIERS["Cinematic"];

      // Run a lightweight lint + (optional) AI refinement before image generation.
      // Skip if already refined upstream (e.g., during bulk generation with cross-scene context).
      let refinedPrompt = promptText;

      if (!skipRefine) {
        const result = await refineImagePrompt({
          promptText,
          style,
          globalSubject,
          aspectRatio,
          intent: "auto",
          previousPrompts: [],
        });

        refinedPrompt = result.refinedPrompt;

        if (result.issues.length > 0) {
          console.log(
            `[prompt-lint] ${result.issues.map((i) => i.code).join(", ")} | style=${style} | aspectRatio=${aspectRatio}`,
          );
        }
      }

      const subjectBlock = globalSubject
        ? `Global Subject (keep consistent across scenes): ${globalSubject}`
        : "";

      const negative = DEFAULT_NEGATIVE_CONSTRAINTS.map((s) => `- ${s}`).join(
        "\n",
      );

      // Build the final prompt
      const finalPrompt = `
${modifier}

${subjectBlock}

${refinedPrompt}

Style: Raw photo style, 35mm film grain, high dynamic range, professional cinematography.
Avoid: Text, subtitles, typography, logos, watermarks, distorted anatomy, extra limbs.

${negative}
      `.trim();

      // Determine seed: use provided seed, or auto-generate from globalSubject for consistency
      let effectiveSeed = seed;
      if (!effectiveSeed && globalSubject && globalSubject.trim().length > 0) {
        effectiveSeed = getCharacterSeed(globalSubject);
      }

      // Check if we're using an Imagen model (requires different API)
      let imageUrl: string;
      if (isImagenModel(MODELS.IMAGE)) {
        imageUrl = await generateWithImagenAPI(finalPrompt, aspectRatio, effectiveSeed);
      } else {
        imageUrl = await generateWithGeminiAPI(finalPrompt, aspectRatio);
      }

      // Cloud autosave trigger (fire-and-forget, non-blocking)
      if (sessionId && imageUrl) {
        cloudAutosave.saveImage(sessionId, imageUrl, sceneIndex ?? Date.now()).catch(err => {
          console.warn('[ImageService] Cloud autosave failed (non-fatal):', err);
        });
      }

      return imageUrl;
    });
  },
  "generateImageFromPrompt",
  {
    runType: "tool",
    metadata: { service: "imageService", operation: "imageGen" },
    tags: ["imagen", "image-generation"],
  }
);
