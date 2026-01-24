/**
 * Visual Consistency Service
 * 
 * Extracts visual style elements from the first generated scene and applies
 * them to subsequent scene prompts for visual cohesion across the video.
 * 
 * Features:
 * - Color palette extraction using AI vision
 * - Style keyword injection
 * - Consistent lighting and mood descriptors
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { API_KEY, MODELS } from "./shared/apiClient";
import type { CharacterProfile } from "../types";

/**
 * Result of a character consistency check
 */
export interface ConsistencyReport {
    /** Consistency score from 0 to 100 */
    score: number;
    /** Whether the character is considered consistent (score > 75) */
    isConsistent: boolean;
    /** List of specific consistency issues found (e.g., "Hair color changed from blonde to brown") */
    issues: string[];
    /** Suggestions to fix the issues in subsequent prompts */
    suggestions: string[];
    /** Detailed textual analysis from the AI */
    details: string;
}

/**
 * Extracted visual style from a reference image
 */
export interface VisualStyle {
    /** Dominant colors (e.g., "teal", "warm orange", "deep blue") */
    colorPalette: string[];
    /** Lighting description (e.g., "golden hour", "soft diffused", "harsh contrast") */
    lighting: string;
    /** Texture/film style (e.g., "film grain", "clean digital", "vintage fade") */
    texture: string;
    /** Mood keywords (e.g., "mysterious", "serene", "intense") */
    moodKeywords: string[];
    /** Raw style prompt to append to other prompts */
    stylePrompt: string;
}

// Cache for visual style per session
const styleCache = new Map<string, VisualStyle>();

/**
 * Extract visual style from a reference image using Gemini Vision
 * 
 * @param imageUrl - URL or base64 of the reference image
 * @param sessionId - Optional session ID for caching
 * @returns Extracted visual style
 */
export async function extractVisualStyle(
    imageUrl: string,
    sessionId?: string
): Promise<VisualStyle> {
    // Check cache first
    if (sessionId && styleCache.has(sessionId)) {
        console.log(`[VisualConsistency] Using cached style for session ${sessionId}`);
        return styleCache.get(sessionId)!;
    }

    console.log(`[VisualConsistency] Extracting visual style from reference image`);

    if (!API_KEY) {
        console.warn(`[VisualConsistency] No API key, using default style`);
        return getDefaultStyle();
    }

    try {
        const model = new ChatGoogleGenerativeAI({
            apiKey: API_KEY,
            model: MODELS.TEXT,
            temperature: 0.3,
        });

        // Convert URL to base64 if needed (Gemini requires base64 data URLs)
        let base64Image: string;

        if (imageUrl.startsWith('data:image')) {
            // Already base64
            base64Image = imageUrl;
        } else if (imageUrl.startsWith('http')) {
            // Fetch and convert to base64
            try {
                console.log(`[VisualConsistency] Fetching image from URL for analysis...`);
                const response = await fetch(imageUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch image: ${response.status}`);
                }
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const base64 = btoa(
                    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                );
                const mimeType = blob.type || 'image/png';
                base64Image = `data:${mimeType};base64,${base64}`;
                console.log(`[VisualConsistency] Converted image to base64 (${(base64.length / 1024).toFixed(1)} KB)`);
            } catch (fetchError) {
                console.warn(`[VisualConsistency] Failed to fetch image, using default style:`, fetchError);
                return getDefaultStyle();
            }
        } else {
            // Assume it's already base64 without data prefix
            base64Image = `data:image/png;base64,${imageUrl}`;
        }

        const response = await model.invoke([
            new HumanMessage({
                content: [
                    {
                        type: "image_url" as const,
                        image_url: base64Image
                    },
                    {
                        type: "text",
                        text: `Analyze this image and extract its visual style for consistency in subsequent images.

Return a JSON object with these exact fields:
{
  "colorPalette": ["color1", "color2", "color3"], // 3-5 dominant colors as descriptive names
  "lighting": "description of lighting style",
  "texture": "film grain/clean digital/vintage/etc",
  "moodKeywords": ["mood1", "mood2"], // 2-3 mood descriptors
  "stylePrompt": "A complete style description that can be appended to image prompts"
}

Focus on:
- Specific color names (not "blue" but "deep navy" or "teal")
- Lighting quality (soft, harsh, directional, ambient)
- Overall mood and atmosphere
- Film/photo style (cinematic, documentary, artistic)

Return ONLY the JSON object, no markdown.`
                    }
                ],
            }),
        ]);

        const content = typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);

        // Parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn(`[VisualConsistency] Failed to parse style, using default`);
            return getDefaultStyle();
        }

        const parsed = JSON.parse(jsonMatch[0]) as VisualStyle;

        // Validate and fill missing fields
        const style: VisualStyle = {
            colorPalette: parsed.colorPalette || ["warm amber", "deep shadow", "soft cream"],
            lighting: parsed.lighting || "cinematic lighting with soft shadows",
            texture: parsed.texture || "subtle film grain",
            moodKeywords: parsed.moodKeywords || ["atmospheric", "evocative"],
            stylePrompt: parsed.stylePrompt || generateStylePrompt(parsed),
        };

        // Cache the result
        if (sessionId) {
            styleCache.set(sessionId, style);
        }

        console.log(`[VisualConsistency] Extracted style:`, style.colorPalette.join(", "));
        return style;

    } catch (error) {
        console.error(`[VisualConsistency] Extraction failed:`, error);
        return getDefaultStyle();
    }
}

/**
 * Inject visual style into a scene prompt for consistency
 * 
 * @param prompt - Original visual description prompt
 * @param style - Extracted visual style to apply
 * @returns Enhanced prompt with style elements
 */
export function injectStyleIntoPrompt(
    prompt: string,
    style: VisualStyle
): string {
    // Build style suffix
    const colorDesc = style.colorPalette.slice(0, 3).join(" and ") + " color palette";
    const styleElements = [
        colorDesc,
        style.lighting,
        style.texture,
        ...style.moodKeywords.slice(0, 2),
    ].filter(Boolean).join(", ");

    // Append style to prompt (limit total length to avoid API issues)
    const enhancedPrompt = `${prompt}. Style: ${styleElements}`;

    // Truncate if too long (max 500 chars for most image APIs)
    if (enhancedPrompt.length > 500) {
        return enhancedPrompt.substring(0, 497) + "...";
    }

    return enhancedPrompt;
}

/**
 * Generate a style prompt from extracted elements
 */
function generateStylePrompt(style: Partial<VisualStyle>): string {
    const parts = [];

    if (style.colorPalette?.length) {
        parts.push(`${style.colorPalette.slice(0, 3).join(" and ")} color palette`);
    }
    if (style.lighting) {
        parts.push(style.lighting);
    }
    if (style.texture) {
        parts.push(style.texture);
    }
    if (style.moodKeywords?.length) {
        parts.push(style.moodKeywords.join(", ") + " atmosphere");
    }

    return parts.join(", ");
}

/**
 * Get default cinematic style as fallback
 */
function getDefaultStyle(): VisualStyle {
    return {
        colorPalette: ["teal", "warm orange", "deep shadow"],
        lighting: "cinematic lighting with dramatic shadows",
        texture: "subtle film grain, 35mm look",
        moodKeywords: ["atmospheric", "cinematic"],
        stylePrompt: "teal and orange color palette, cinematic lighting with dramatic shadows, subtle film grain, atmospheric mood",
    };
}

/**
 * Clear cached style for a session
 */
export function clearStyleCache(sessionId: string): void {
    styleCache.delete(sessionId);
}

/**
 * Check if style is cached for a session
 */
export function hasStyleCache(sessionId: string): boolean {
    return styleCache.has(sessionId);
}

/**
 * Verify character consistency across multiple images using Gemini Vision.
 * Compares actors in generated shots against the provided CharacterProfile.
 * 
 * @param imageUrls - Array of URLs or base64 data for the images to verify
 * @param profile - The reference character profile
 * @param language - Optional language for the report (e.g., 'ar')
 * @returns Comparison report with consistency score and issues
 */
export async function verifyCharacterConsistency(
    imageUrls: string[],
    profile: CharacterProfile,
    language: string = 'en'
): Promise<ConsistencyReport> {
    console.log(`[VisualConsistency] Verifying consistency for character: ${profile.name} across ${imageUrls.length} images (Language: ${language})`);

    if (!API_KEY) {
        return {
            score: 100,
            isConsistent: true,
            issues: [],
            suggestions: [],
            details: "API Authentication missing - skipped consistency check."
        };
    }

    if (imageUrls.length === 0) {
        return {
            score: 100,
            isConsistent: true,
            issues: [],
            suggestions: [],
            details: "No images provided for verification."
        };
    }

    try {
        const model = new ChatGoogleGenerativeAI({
            apiKey: API_KEY,
            model: MODELS.TEXT, // Using latest Gemini for vision
            temperature: 0.2,
        });

        // Prepare image parts for Gemini
        const imageParts: any[] = [];

        // Add character profile as text first
        const profileText = `
CHARACTER PROFILE:
Name: ${profile.name}
Role: ${profile.role}
Visual Description: ${profile.visualDescription}
`;

        // Process images (limit to first 5 for performance/quota)
        const activeImages = imageUrls.slice(0, 5);
        for (let i = 0; i < activeImages.length; i++) {
            const url = activeImages[i];
            if (!url) continue;

            let base64Data: string;

            if (url.startsWith('data:image')) {
                base64Data = url;
            } else {
                // Fetch and convert
                const response = await fetch(url);
                const blob = await response.blob();
                const buffer = await blob.arrayBuffer();
                const base64 = btoa(
                    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                );
                base64Data = `data:${blob.type || 'image/png'};base64,${base64}`;
            }

            imageParts.push({
                type: "image_url",
                image_url: base64Data
            });
        }

        const prompt = `
You are a Visual Continuity Supervisor. Your task is to verify if the character "${profile.name}" looks consistent across these ${activeImages.length} images.

${profileText}

Compare the actor/character in each image against the profile and against the other images.
Look specifically for consistency in:
1. Facial features and bone structure
2. Hair color and style
3. Eye color
4. Apparent age
5. Body type
6. Clothing (if applicable to the profile)

IMPORTANT: Provide all text fields (issues, suggestions, details) in ${language === 'ar' ? 'Arabic' : 'the requested language'}.

Return a JSON object with this exact structure:
{
  "score": number, // 0-100
  "isConsistent": boolean, // true if score > 75
  "issues": ["list of specific discrepancies"],
  "suggestions": ["how to fix the prompts for better consistency"],
  "details": "detailed analysis of the character appearance across all shots"
}

Return ONLY the JSON object.
`;

        const response = await model.invoke([
            new HumanMessage({
                content: [
                    ...imageParts,
                    { type: "text", text: prompt }
                ]
            })
        ]);

        const content = typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Failed to parse consistency report JSON");
        }

        return JSON.parse(jsonMatch[0]) as ConsistencyReport;

    } catch (error) {
        console.error(`[VisualConsistency] Verification failed:`, error);
        return {
            score: 50,
            isConsistent: false,
            issues: ["AI verification failed"],
            suggestions: ["Try manual verification"],
            details: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
