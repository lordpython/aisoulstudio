/**
 * Character Service - Character extraction and visual consistency
 * 
 * Handles:
 * - Character extraction from script text using AI
 * - Character reference sheet generation for visual consistency
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GEMINI_API_KEY, MODELS } from "./shared/apiClient";
import { generateImageWithDeApi } from "./deapiService";
import { getCharacterSeed } from "./imageService";
import { z } from "zod";
import type { CharacterProfile } from "@/types";
import { withAILogging } from "./aiLogService";

// Schema for structured character extraction
const CharacterExtractionSchema = z.object({
    characters: z.array(z.object({
        name: z.string().describe("Character name"),
        role: z.string().describe("Character role in the story (protagonist, antagonist, supporting, etc.)"),
        visualDescription: z.string().describe("Detailed physical appearance description (face, hair, clothes, age, distinguishing features) for image generation consistency")
    }))
});

/**
 * Extract main characters from script text using Gemini with structured output.
 * Creates consistent visual descriptions for each character.
 * 
 * @param scriptText - The full script or story text to analyze
 * @returns Array of CharacterProfile objects
 */
export async function extractCharacters(scriptText: string, sessionId?: string): Promise<CharacterProfile[]> {
    const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT_EXP,
        apiKey: GEMINI_API_KEY,
        temperature: 0.2,
    }).withStructuredOutput(CharacterExtractionSchema);

    const prompt = `Extract the main characters from this script/story.
For each character, create a detailed and consistent visual description that can be used for image generation.
The visual description should include: approximate age, gender, ethnicity, hair color/style, eye color,
body type, typical clothing/style, and any distinguishing features.
Make descriptions vivid and specific enough to maintain visual consistency across multiple images.

Script:
${scriptText}`;

    try {
        const result = await withAILogging(
            sessionId,
            'character_extract',
            MODELS.TEXT_EXP,
            prompt,
            () => model.invoke(prompt),
            (r) => JSON.stringify(r.characters),
        );

        return result.characters.map((c, i) => ({
            id: `char_${Date.now()}_${i}`,
            name: c.name,
            role: c.role,
            visualDescription: c.visualDescription,
        }));
    } catch (error) {
        console.error("[CharacterService] Failed to extract characters:", error);
        throw new Error(`Character extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Generate a character reference sheet (turnaround/model sheet) for visual consistency.
 * Creates a multi-view image of the character for reference during scene generation.
 * 
 * @param charName - Character name
 * @param description - Visual description of the character
 * @param sessionId - Session ID for cloud autosave
 * @returns URL of the generated reference image
 */
export async function generateCharacterReference(
    charName: string,
    description: string,
    sessionId: string
): Promise<string> {
    // Prompt includes explicit camera angle, lighting quality, and color palette keywords
    // to satisfy the prompt linter's visual specificity checks and improve Imagen output quality.
    const prompt = `${charName}, ${description}.
Medium shot, eye-level camera angle, front view and three-quarter view, full body visible.
Soft diffused studio lighting with rim light accent, neutral white background.
Clean muted color palette, professional character reference sheet style, consistent proportions.
High detail, sharp focus, 35mm lens, shallow depth of field on subject.
No text, no watermarks, no logos.`;

    const seed = getCharacterSeed(charName);
    console.log(`[CharacterService] Generating reference sheet for: ${charName} (DeAPI Flux_2_Klein_4B_BF16, seed=${seed})`);

    return generateImageWithDeApi({
        prompt,
        model: "Flux_2_Klein_4B_BF16",
        width: 768,
        height: 768,
        guidance: 3.5,
        steps: 4,
        seed,
        negative_prompt: "blur, darkness, noise, low quality, text, watermark",
    });
}

/**
 * Generate reference sheets for all characters in a cast.
 * 
 * @param characters - Array of CharacterProfile objects
 * @param sessionId - Session ID for cloud autosave
 * @returns Updated CharacterProfile array with referenceImageUrl populated
 */
export async function generateAllCharacterReferences(
    characters: CharacterProfile[],
    sessionId: string
): Promise<CharacterProfile[]> {
    const results: CharacterProfile[] = [];

    for (let i = 0; i < characters.length; i++) {
        const char = characters[i];
        if (!char) continue;

        console.log(`[CharacterService] Generating reference ${i + 1}/${characters.length}: ${char.name}`);

        try {
            const referenceUrl = await generateCharacterReference(
                char.name,
                char.visualDescription,
                sessionId
            );

            results.push({
                ...char,
                referenceImageUrl: referenceUrl,
            });
        } catch (error) {
            console.error(`[CharacterService] Failed to generate reference for ${char.name}:`, error);
            // Keep the character but without reference image
            results.push(char);
        }
    }

    return results;
}
