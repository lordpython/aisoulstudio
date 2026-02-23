/**
 * Enhancement Tools - LangChain tools for visual enhancement
 * 
 * Provides tools for enhancing generated visuals:
 * - Background removal (transparent PNG output)
 * - Style transfer (Anime, Watercolor, Oil Painting, etc.)
 * 
 * Requirements: 2.1, 2.2, 2.4, 2.5
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ai, MODELS, withRetry } from "../shared/apiClient";

// --- Types ---

/**
 * Result of background removal operation
 */
export interface BackgroundRemovalResult {
  success: boolean;
  imageBase64?: string;
  originalImageBase64?: string;
  error?: string;
  sceneIndex?: number;
}

/**
 * Result of style transfer operation
 */
export interface StyleTransferResult {
  success: boolean;
  imageBase64?: string;
  originalImageBase64?: string;
  appliedStyle?: string;
  error?: string;
  sceneIndex?: number;
  suggestedStyles?: string[];
}

/**
 * Enhanced image stored in session
 */
export interface EnhancedImage {
  sceneIndex: number;
  originalBase64: string;
  enhancedBase64: string;
  enhancementType: "background_removal" | "style_transfer";
  style?: string;
  timestamp: number;
}

// --- Session State ---

const enhancedImagesStore: Map<string, EnhancedImage[]> = new Map();

/**
 * Get enhanced images for a session
 */
export function getEnhancedImages(sessionId: string): EnhancedImage[] {
  return enhancedImagesStore.get(sessionId) || [];
}

/**
 * Add an enhanced image to a session
 */
export function addEnhancedImage(sessionId: string, image: EnhancedImage): void {
  const existing = enhancedImagesStore.get(sessionId) || [];
  existing.push(image);
  enhancedImagesStore.set(sessionId, existing);
}

/**
 * Clear enhanced images for a session
 */
export function clearEnhancedImages(sessionId: string): void {
  enhancedImagesStore.delete(sessionId);
}

// --- Available Styles ---

/**
 * Supported style options for style transfer
 */
export const AVAILABLE_STYLES = [
  "Anime",
  "Watercolor",
  "Oil Painting",
  "Pencil Sketch",
  "Pop Art",
  "Impressionist",
  "Cyberpunk",
  "Vintage Film",
  "Comic Book",
  "Minimalist",
  "Surrealist",
  "Art Nouveau",
  "Pixel Art",
  "Neon Glow",
  "Pastel Dream",
] as const;

export type StyleOption = typeof AVAILABLE_STYLES[number];

/**
 * Check if a style is recognized
 */
export function isRecognizedStyle(style: string): boolean {
  return AVAILABLE_STYLES.some(
    s => s.toLowerCase() === style.toLowerCase()
  );
}

/**
 * Find closest matching style
 */
export function findClosestStyle(input: string): string | null {
  const inputLower = input.toLowerCase();
  
  // Exact match
  const exact = AVAILABLE_STYLES.find(s => s.toLowerCase() === inputLower);
  if (exact) return exact;
  
  // Partial match
  const partial = AVAILABLE_STYLES.find(s => 
    s.toLowerCase().includes(inputLower) || inputLower.includes(s.toLowerCase())
  );
  if (partial) return partial;
  
  return null;
}

/**
 * Get style suggestions based on partial input
 */
export function getStyleSuggestions(input: string): string[] {
  const inputLower = input.toLowerCase();
  return AVAILABLE_STYLES.filter(s => 
    s.toLowerCase().includes(inputLower) || 
    inputLower.split(' ').some(word => s.toLowerCase().includes(word))
  );
}

// --- Tool Schemas ---

/**
 * Schema for background removal tool
 */
const RemoveBackgroundSchema = z.object({
  contentPlanId: z.string().describe("Session ID containing the visuals"),
  sceneIndex: z.number().describe("Index of the scene to process (0-based)"),
  imageBase64: z.string().describe("Base64-encoded image data (with or without data URI prefix)"),
});

/**
 * Schema for style transfer tool
 */
const RestyleImageSchema = z.object({
  contentPlanId: z.string().describe("Session ID containing the visuals"),
  sceneIndex: z.number().describe("Index of the scene to process (0-based)"),
  imageBase64: z.string().describe("Base64-encoded image data (with or without data URI prefix)"),
  targetStyle: z.string().describe("Target style (e.g., 'Anime', 'Watercolor', 'Oil Painting')"),
});

// --- Helper Functions ---

/**
 * Extract base64 data from a data URI or return as-is
 */
function extractBase64Data(input: string): { data: string; mimeType: string } {
  const dataUriMatch = input.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch && dataUriMatch[1] && dataUriMatch[2]) {
    return {
      mimeType: dataUriMatch[1],
      data: dataUriMatch[2],
    };
  }
  // Assume PNG if no prefix
  return {
    mimeType: "image/png",
    data: input,
  };
}

/**
 * Create a data URI from base64 data
 */
function createDataUri(base64: string, mimeType: string = "image/png"): string {
  return `data:${mimeType};base64,${base64}`;
}

// --- Core Enhancement Functions ---

/**
 * Remove background from an image using Gemini
 * Returns transparent PNG
 */
async function removeBackgroundWithGemini(
  imageBase64: string,
  mimeType: string
): Promise<string> {
  console.log("[EnhancementTools] Removing background with Gemini...");

  const prompt = `You are an expert image editor. Remove the background from this image completely.
Keep only the main subject(s) in the foreground.
The background should be completely transparent.
Maintain the quality and details of the foreground subject.
Output the result as a PNG image with transparent background.`;

  const response = await withRetry(async () => {
    return ai.models.generateContent({
      model: MODELS.TEXT,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      config: {
        // @ts-ignore - responseModalities may not be in types
        responseModalities: ["IMAGE", "TEXT"],
      },
    });
  });

  // Extract image from response
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData?.data) {
      return part.inlineData.data;
    }
  }

  throw new Error("No image data in response. Background removal may not be supported by the current model.");
}

/**
 * Apply style transfer to an image using Gemini
 */
async function applyStyleTransferWithGemini(
  imageBase64: string,
  mimeType: string,
  targetStyle: string
): Promise<string> {
  console.log(`[EnhancementTools] Applying ${targetStyle} style with Gemini...`);

  const stylePrompts: Record<string, string> = {
    "anime": "Transform this image into anime/manga art style with bold outlines, vibrant colors, and characteristic anime aesthetics.",
    "watercolor": "Transform this image into a beautiful watercolor painting with soft edges, color bleeding, and organic brush strokes.",
    "oil painting": "Transform this image into a classic oil painting with visible brush strokes, rich textures, and painterly qualities.",
    "pencil sketch": "Transform this image into a detailed pencil sketch with fine lines, shading, and artistic hatching.",
    "pop art": "Transform this image into bold pop art style with bright colors, halftone dots, and graphic design elements.",
    "impressionist": "Transform this image into an impressionist painting with visible brush strokes, light effects, and soft color blending.",
    "cyberpunk": "Transform this image into cyberpunk aesthetic with neon colors, futuristic elements, and high-tech atmosphere.",
    "vintage film": "Transform this image into vintage film photography style with grain, faded colors, and nostalgic atmosphere.",
    "comic book": "Transform this image into comic book art with bold outlines, halftone shading, and dynamic composition.",
    "minimalist": "Transform this image into minimalist art with simplified shapes, limited color palette, and clean design.",
    "surrealist": "Transform this image into surrealist art with dreamlike elements, unexpected combinations, and artistic distortions.",
    "art nouveau": "Transform this image into Art Nouveau style with organic curves, decorative elements, and elegant flowing lines.",
    "pixel art": "Transform this image into pixel art with visible pixels, limited color palette, and retro game aesthetics.",
    "neon glow": "Transform this image with neon glow effects, vibrant glowing colors, and dark background contrast.",
    "pastel dream": "Transform this image into soft pastel art with gentle colors, dreamy atmosphere, and ethereal quality.",
  };

  const styleLower = targetStyle.toLowerCase();
  const stylePrompt = stylePrompts[styleLower] || 
    `Transform this image into ${targetStyle} art style while maintaining the subject and composition.`;

  const prompt = `You are an expert digital artist specializing in style transfer.
${stylePrompt}
Maintain the core subject and composition of the original image.
Ensure high quality output with the distinctive characteristics of the ${targetStyle} style.
Output the result as a high-quality image.`;

  const response = await withRetry(async () => {
    return ai.models.generateContent({
      model: MODELS.TEXT,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      config: {
        // @ts-ignore - responseModalities may not be in types
        responseModalities: ["IMAGE", "TEXT"],
      },
    });
  });

  // Extract image from response
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData?.data) {
      return part.inlineData.data;
    }
  }

  throw new Error("No image data in response. Style transfer may not be supported by the current model.");
}

// --- Tool Implementations ---

/**
 * Background Removal Tool
 * 
 * Removes background from an image, returning transparent PNG.
 * Requirements: 2.1, 2.4
 */
export const removeBackgroundTool = tool(
  async ({ contentPlanId, sceneIndex, imageBase64 }) => {
    console.log(`[EnhancementTools] Removing background for scene ${sceneIndex} in session ${contentPlanId}`);

    try {
      // Extract base64 data
      const { data, mimeType } = extractBase64Data(imageBase64);

      // Attempt background removal
      const resultBase64 = await removeBackgroundWithGemini(data, mimeType);

      // Store the enhanced image
      addEnhancedImage(contentPlanId, {
        sceneIndex,
        originalBase64: data,
        enhancedBase64: resultBase64,
        enhancementType: "background_removal",
        timestamp: Date.now(),
      });

      return JSON.stringify({
        success: true,
        sceneIndex,
        imageBase64: createDataUri(resultBase64, "image/png"),
        message: `Successfully removed background from scene ${sceneIndex}`,
      });

    } catch (error) {
      console.error("[EnhancementTools] Background removal error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Return original image on failure (graceful degradation per Requirement 2.4)
      return JSON.stringify({
        success: false,
        sceneIndex,
        error: errorMessage,
        originalImagePreserved: true,
        message: `Background removal failed for scene ${sceneIndex}. Original image preserved.`,
        suggestion: "The image will be used as-is. You can try again or proceed with the original.",
      });
    }
  },
  {
    name: "remove_background",
    description: "Remove the background from an image, returning a transparent PNG. If removal fails, the original image is preserved and production continues.",
    schema: RemoveBackgroundSchema,
  }
);

/**
 * Style Transfer Tool
 * 
 * Applies artistic style transfer to an image.
 * Requirements: 2.2, 2.5
 */
export const restyleImageTool = tool(
  async ({ contentPlanId, sceneIndex, imageBase64, targetStyle }) => {
    console.log(`[EnhancementTools] Applying ${targetStyle} style to scene ${sceneIndex} in session ${contentPlanId}`);

    // Check if style is recognized
    if (!isRecognizedStyle(targetStyle)) {
      const closestMatch = findClosestStyle(targetStyle);
      const suggestions = getStyleSuggestions(targetStyle);
      
      if (closestMatch) {
        console.log(`[EnhancementTools] Using closest match: ${closestMatch} for input: ${targetStyle}`);
        targetStyle = closestMatch;
      } else {
        return JSON.stringify({
          success: false,
          sceneIndex,
          error: `Style "${targetStyle}" is not recognized`,
          availableStyles: AVAILABLE_STYLES,
          suggestions: suggestions.length > 0 ? suggestions : AVAILABLE_STYLES.slice(0, 5),
          message: `Please choose from the available styles: ${AVAILABLE_STYLES.join(", ")}`,
        });
      }
    }

    try {
      // Extract base64 data
      const { data, mimeType } = extractBase64Data(imageBase64);

      // Apply style transfer
      const resultBase64 = await applyStyleTransferWithGemini(data, mimeType, targetStyle);

      // Store the enhanced image
      addEnhancedImage(contentPlanId, {
        sceneIndex,
        originalBase64: data,
        enhancedBase64: resultBase64,
        enhancementType: "style_transfer",
        style: targetStyle,
        timestamp: Date.now(),
      });

      return JSON.stringify({
        success: true,
        sceneIndex,
        appliedStyle: targetStyle,
        imageBase64: createDataUri(resultBase64, "image/png"),
        message: `Successfully applied ${targetStyle} style to scene ${sceneIndex}`,
      });

    } catch (error) {
      console.error("[EnhancementTools] Style transfer error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Return available styles on failure (per Requirement 2.5)
      return JSON.stringify({
        success: false,
        sceneIndex,
        error: errorMessage,
        requestedStyle: targetStyle,
        availableStyles: AVAILABLE_STYLES,
        message: `Style transfer failed for scene ${sceneIndex}. Try a different style or proceed with the original image.`,
        suggestion: `Available styles: ${AVAILABLE_STYLES.slice(0, 5).join(", ")}...`,
      });
    }
  },
  {
    name: "restyle_image",
    description: "Apply artistic style transfer to an image. Supports styles like Anime, Watercolor, Oil Painting, etc. If the style is not recognized, suggests available options.",
    schema: RestyleImageSchema,
  }
);

// --- Export all enhancement tools ---

export const enhancementTools = [
  removeBackgroundTool,
  restyleImageTool,
];
