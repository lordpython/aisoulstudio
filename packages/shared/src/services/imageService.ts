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
import { refineImagePrompt, compressPromptForGeneration } from "./promptService";
import {
  buildImageStyleGuide,
  serializeStyleGuideAsText,
  type ImageStyleGuide,
} from "./prompt/imageStyleGuide";
import { traceAsync } from "./tracing";
import { cloudAutosave } from "./cloudStorageService";
import { withAILogging } from "./aiLogService";

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
  // Extract key visual descriptors in order (no sorting to preserve intent)
  // "tall young woman" and "young tall woman" should be different if intended
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2)
    .slice(0, 10) // Take first 10 meaningful words
    // NOTE: Removed .sort() - sorting destroys word order which may be intentional
    // e.g., "young woman with brown hair" vs "brown-haired young woman" are now distinct
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
 * NOTE: The `seed` parameter is NOT supported by the Gemini API for imagen-4.0.
 * Character consistency is achieved by embedding detailed physical descriptions
 * in the prompt text instead (see getCharacterSeed → prompt-based approach).
 *
 * @param prompt - The image generation prompt
 * @param aspectRatio - Image aspect ratio
 * @param _seed - Deprecated: seed is not supported by Imagen API. Kept for signature compat.
 */
async function generateWithImagenAPI(
  prompt: string,
  aspectRatio: string,
  _seed?: number
): Promise<string> {
  console.log(`[ImageService] Using Imagen API with model: ${MODELS.IMAGE}`);

  // Build config — seed is NOT supported by imagen-4.0 via @google/genai SDK
  const config: Record<string, unknown> = {
    numberOfImages: 1,
    aspectRatio: aspectRatio,
    personGeneration: "allow_adult",
  };

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
 * Used for gemini-2.5-flash-image, gemini-3-pro-preview, etc.
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
 * Transform a sketch into a detailed image (Storyboarder.ai-style sketch-to-image).
 * Uses the sketch as a composition guide while generating a detailed final image.
 * 
 * @param sketchBase64 - Base64-encoded sketch image (PNG/JPEG)
 * @param promptText - Description of what the final image should look like
 * @param style - Art style preset
 * @param aspectRatio - Output aspect ratio
 */
export const sketchToImage = async (
  sketchBase64: string,
  promptText: string,
  style: string = "Cinematic",
  aspectRatio: string = "16:9"
): Promise<string> => {
  console.log(`[ImageService] Sketch-to-image transformation with style: ${style}`);

  // Build a style guide for consistency, then prepend sketch-specific instructions
  const guide = buildImageStyleGuide({ scene: promptText, style });
  const guideText = serializeStyleGuideAsText(guide);

  const transformPrompt = `Transform this rough sketch into a detailed, polished ${style} image.
Maintain the exact composition, subject positions, and framing from the sketch.
Add professional lighting, textures, and details while preserving the sketch's layout.

${guideText}

Important: Keep the same composition and subject placement as the sketch.`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.IMAGE,
      contents: [
        {
          role: "user",
          parts: [
            { text: transformPrompt },
            {
              inlineData: {
                mimeType: sketchBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
                data: sketchBase64.replace(/^data:image\/\w+;base64,/, ''),
              },
            },
          ],
        },
      ],
      config: {
        // @ts-ignore
        imageConfig: { aspectRatio },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image data in sketch-to-image response");
  } catch (error) {
    console.error("[ImageService] Sketch-to-image failed:", error);
    throw error;
  }
};

/**
 * Generate an image using a style reference image (Storyboarder.ai-style custom art style).
 * The reference image defines the visual style, colors, and aesthetic.
 * 
 * @param styleReferenceBase64 - Base64-encoded style reference image
 * @param promptText - Description of the scene to generate
 * @param aspectRatio - Output aspect ratio
 */
export const generateWithStyleReference = async (
  styleReferenceBase64: string,
  promptText: string,
  aspectRatio: string = "16:9"
): Promise<string> => {
  console.log(`[ImageService] Generating with custom style reference`);

  // Build a style guide for the scene description portion
  const guide = buildImageStyleGuide({ scene: promptText });
  const guideText = serializeStyleGuideAsText(guide);

  const stylePrompt = `Generate a new image matching the artistic style, color palette, and visual aesthetic of the reference image.

${guideText}

Important instructions:
- Match the art style, brushwork, and texture of the reference
- Use the same color palette and lighting mood
- Apply the same level of detail and rendering style
- Create a NEW scene (not a copy of the reference)`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.IMAGE,
      contents: [
        {
          role: "user",
          parts: [
            { text: stylePrompt },
            {
              inlineData: {
                mimeType: styleReferenceBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
                data: styleReferenceBase64.replace(/^data:image\/\w+;base64,/, ''),
              },
            },
          ],
        },
      ],
      config: {
        // @ts-ignore
        imageConfig: { aspectRatio },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image data in style reference response");
  } catch (error) {
    console.error("[ImageService] Style reference generation failed:", error);
    throw error;
  }
};

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
 * @param prebuiltGuide - Optional pre-built ImageStyleGuide. When provided, skips both refinement and guide building to avoid double-wrapping.
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
    prebuiltGuide?: ImageStyleGuide,
  ): Promise<string> {
    return withRetry(async () => {
      let finalPrompt: string;

      if (prebuiltGuide) {
        // Caller already built a guide — serialize directly (no refinement, no re-wrapping)
        finalPrompt = serializeStyleGuideAsText(prebuiltGuide);
      } else {
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

        // Build structured style guide and serialize as natural-language prompt
        const guide = buildImageStyleGuide({
          promptText: refinedPrompt,
          style,
          globalSubject,
        });
        finalPrompt = serializeStyleGuideAsText(guide);
      }

      // Compress long prompts to reduce instruction dilution (story-mode shots can exceed 200 words)
      finalPrompt = await compressPromptForGeneration(finalPrompt);

      // Determine seed: use provided seed, or auto-generate from globalSubject for consistency
      let effectiveSeed = seed;
      if (!effectiveSeed && globalSubject && globalSubject.trim().length > 0) {
        effectiveSeed = getCharacterSeed(globalSubject);
      }

      // Check if we're using an Imagen model (requires different API)
      let imageUrl: string;
      if (isImagenModel(MODELS.IMAGE)) {
        imageUrl = await withAILogging(
          sessionId,
          'image_gen',
          MODELS.IMAGE,
          finalPrompt,
          () => generateWithImagenAPI(finalPrompt, aspectRatio, effectiveSeed),
          () => `image generated (${aspectRatio})`,
        );
      } else {
        imageUrl = await withAILogging(
          sessionId,
          'image_gen',
          MODELS.IMAGE,
          finalPrompt,
          () => generateWithGeminiAPI(finalPrompt, aspectRatio),
          () => `image generated (${aspectRatio})`,
        );
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
