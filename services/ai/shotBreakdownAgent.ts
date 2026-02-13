/**
 * Shot Breakdown Agent
 *
 * AI service that breaks screenplay scenes into 4-6 individual camera shots.
 * Each shot includes cinematography details for image generation.
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MODELS } from "../shared/apiClient";
import { agentLogger } from "../logger";
import type { ScreenplayScene } from "@/types";
import { withAILogging } from "../aiLogService";

const log = agentLogger.child('ShotBreakdown');

/**
 * Shot type definitions
 */
export type ShotType =
    | 'Wide'
    | 'Medium'
    | 'Close-up'
    | 'Extreme Close-up'
    | 'POV'
    | 'Over-the-shoulder';

export type CameraAngle =
    | 'Eye-level'
    | 'High'
    | 'Low'
    | 'Dutch'
    | "Bird's-eye"
    | "Worm's-eye";

export type CameraMovement =
    | 'Static'
    | 'Pan'
    | 'Tilt'
    | 'Zoom'
    | 'Dolly'
    | 'Tracking'
    | 'Handheld';

/**
 * Individual shot within a scene
 */
export interface Shot {
    id: string;
    sceneId: string;
    shotNumber: number;
    shotType: ShotType;
    cameraAngle: CameraAngle;
    movement: CameraMovement;
    duration: number;
    description: string;
    emotion: string;
    lighting: string;
}

/**
 * Raw shot data from AI response
 */
interface RawShotData {
    shotType?: string;
    cameraAngle?: string;
    movement?: string;
    duration?: number;
    description?: string;
    visualDescription?: string;
    emotion?: string;
    emotionalTone?: string;
    lighting?: string;
    lightingStyle?: string;
}

const SHOT_BREAKDOWN_PROMPT = `You are an expert film director and cinematographer. Your goal is to translate a screenplay scene into a series of dynamic, narrative-driven shots.

SCENE:
Heading: {heading}
Action: {action}
Genre: {genre}
Characters Present: {characters}
Dialogue: {dialogue}
Mood/Vibe: {mood}

CRITICAL INSTRUCTION:
- Do NOT just describe the set (e.g., "A market with spices").
- YOU MUST describe the DRAMATIC ACTION (e.g., "The camera pushes in on Faisal's hand as he hesitates to touch the jar, his fingers trembling.").
- Every shot must have a SUBJECT performing an ACTION with a specific EMOTION.
- MANDATORY: Assign a camera movement to every shot. Never leave the camera static for emotional scenes.

For EACH shot provide:
1. Shot Type: Wide/Medium/Close-up/Extreme Close-up/POV/Over-the-shoulder
2. Camera Angle: Eye-level/High/Low/Dutch/Bird's-eye/Worm's-eye
3. Movement: Pan/Tilt/Zoom/Dolly/Tracking/Handheld (use Static only for contemplative pauses)
4. Duration: 3-8 seconds
5. Description: NARRATIVE-FOCUSED - describe what the character DOES, what the camera REVEALS, and what the viewer FEELS. Include lighting and atmosphere woven into the action.
6. Emotion: Specific emotional beat (not just "tense" - say "mounting dread", "reluctant hope", "quiet defiance")
7. Lighting: How light serves the emotion (e.g., "harsh overhead isolating the figure", "warm rim light suggesting hidden warmth")

Consider:
- {genre} genre conventions and visual style
- The emotional arc and vibe of the scene
- Characters as ACTORS in a drama, not mannequins in a diorama
- Camera as a storytelling tool that reveals character psychology

Output as JSON array with exactly this format:
\`\`\`json
[
  {
    "shotType": "Close-up",
    "cameraAngle": "Dutch",
    "movement": "Dolly",
    "duration": 5,
    "description": "The camera slowly pushes toward Faisal's face as recognition dawns in his eyes, the narrow alley walls seeming to close in around him, harsh sidelight cutting across his features",
    "emotion": "dawning realization",
    "lighting": "High contrast, claustrophobic sidelight"
  }
]
\`\`\`

IMPORTANT:
- Generate 4-6 shots only
- Each shot must drive the narrative forward, not just establish a location
- Vary shot types and camera movements for dynamic visual rhythm
- Maintain 180-degree rule for dialogue scenes
- Total duration should roughly match scene importance`;

/**
 * Initialize Gemini model for shot breakdown
 */
function getGeminiModel() {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY is required for shot breakdown');
    }

    return new ChatGoogleGenerativeAI({
        apiKey,
        model: MODELS.TEXT,
        temperature: 0.7,
    });
}

/**
 * Parse JSON from AI response (handles markdown code blocks)
 */
function parseJsonFromResponse(content: string): RawShotData[] {
    // Try to extract JSON from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = (jsonMatch && jsonMatch[1]) ? jsonMatch[1].trim() : content.trim();

    try {
        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) {
            throw new Error('Expected array of shots');
        }
        return parsed;
    } catch (e) {
        log.error('Failed to parse shot breakdown JSON:', e);
        throw new Error(`Failed to parse shot breakdown response: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/**
 * Validate and normalize shot type
 */
function normalizeShot(raw: RawShotData, index: number, sceneId: string): Shot {
    const validShotTypes: ShotType[] = ['Wide', 'Medium', 'Close-up', 'Extreme Close-up', 'POV', 'Over-the-shoulder'];
    const validAngles: CameraAngle[] = ['Eye-level', 'High', 'Low', 'Dutch', "Bird's-eye", "Worm's-eye"];
    const validMovements: CameraMovement[] = ['Static', 'Pan', 'Tilt', 'Zoom', 'Dolly', 'Tracking', 'Handheld'];

    const shotType = validShotTypes.find(t =>
        raw.shotType?.toLowerCase().includes(t.toLowerCase())
    ) || 'Medium';

    const cameraAngle = validAngles.find(a =>
        raw.cameraAngle?.toLowerCase().includes(a.toLowerCase().replace("'", ""))
    ) || 'Eye-level';

    const movement = validMovements.find(m =>
        raw.movement?.toLowerCase().includes(m.toLowerCase())
    ) || 'Static';

    return {
        id: `shot_${sceneId}_${index + 1}`,
        sceneId,
        shotNumber: index + 1,
        shotType,
        cameraAngle,
        movement,
        duration: Math.min(Math.max(raw.duration || 5, 3), 8),
        description: raw.description || raw.visualDescription || 'Scene establishing shot',
        emotion: raw.emotion || raw.emotionalTone || 'neutral',
        lighting: raw.lighting || raw.lightingStyle || 'Natural',
    };
}

/**
 * Break a screenplay scene into individual camera shots
 */
export async function breakSceneIntoShots(
    scene: ScreenplayScene,
    genre: string,
    geminiModel?: ChatGoogleGenerativeAI,
    sessionId?: string,
    emotionalContext?: string,
): Promise<Shot[]> {
    const model = geminiModel || getGeminiModel();

    // Format dialogue for prompt
    const dialogueStr = scene.dialogue.length > 0
        ? scene.dialogue.map(d => `${d.speaker}: "${d.text}"`).join('\n')
        : 'No dialogue';

    // Build prompt with emotional context
    const mood = emotionalContext || 'Cinematic';
    const prompt = SHOT_BREAKDOWN_PROMPT
        .replace('{heading}', scene.heading)
        .replace('{action}', scene.action)
        .replace('{genre}', genre)
        .replace('{characters}', scene.charactersPresent.join(', ') || 'Unknown')
        .replace('{dialogue}', dialogueStr)
        .replace('{mood}', mood)
        .replace('{genre}', genre); // Second occurrence

    log.info(`Breaking down scene ${scene.sceneNumber} into shots...`);

    try {
        const response = await withAILogging(
            sessionId,
            'shot_breakdown',
            MODELS.TEXT,
            prompt,
            () => model.invoke([{ role: 'user', content: prompt }]),
            (r) => typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
        );
        const content = typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);

        const rawShots = parseJsonFromResponse(content);

        // Validate and normalize shots
        const shots = rawShots.map((raw, idx) => normalizeShot(raw, idx, scene.id));

        log.info(`Generated ${shots.length} shots for scene ${scene.sceneNumber}`);
        return shots;

    } catch (error) {
        log.error(`Shot breakdown failed for scene ${scene.sceneNumber}:`, error);
        throw new Error(`Failed to break down scene ${scene.sceneNumber}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Break all scenes into shots
 */
export async function breakAllScenesIntoShots(
    scenes: ScreenplayScene[],
    genre: string,
    onProgress?: (sceneIndex: number, totalScenes: number) => void,
    sessionId?: string,
    emotionalContexts?: string[],
): Promise<Shot[]> {
    const model = getGeminiModel();
    const allShots: Shot[] = [];

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        if (!scene) {
            log.warn(`Skipping undefined scene at index ${i}`);
            continue;
        }

        onProgress?.(i, scenes.length);

        try {
            const emotionalContext = emotionalContexts?.[i];
            const shots = await breakSceneIntoShots(scene, genre, model, sessionId, emotionalContext);
            allShots.push(...shots);
        } catch (error) {
            log.error(`Failed to process scene ${i + 1}:`, error);
            // Continue with other scenes
        }
    }

    log.info(`Total shots generated: ${allShots.length} across ${scenes.length} scenes`);
    return allShots;
}

/**
 * Get shot type style recommendation for a genre
 */
export function getGenreStyleRecommendation(genre: string): {
    preferredShotTypes: ShotType[];
    preferredMovements: CameraMovement[];
    lightingStyle: string;
} {
    const genreLower = genre.toLowerCase();

    if (genreLower.includes('thriller') || genreLower.includes('horror')) {
        return {
            preferredShotTypes: ['Close-up', 'Extreme Close-up', 'POV'],
            preferredMovements: ['Handheld', 'Tracking', 'Zoom'],
            lightingStyle: 'Dramatic/Chiaroscuro',
        };
    }

    if (genreLower.includes('action')) {
        return {
            preferredShotTypes: ['Wide', 'Medium', 'POV'],
            preferredMovements: ['Tracking', 'Pan', 'Handheld'],
            lightingStyle: 'Hard/Dynamic',
        };
    }

    if (genreLower.includes('drama')) {
        return {
            preferredShotTypes: ['Medium', 'Close-up', 'Over-the-shoulder'],
            preferredMovements: ['Static', 'Dolly', 'Pan'],
            lightingStyle: 'Soft/Natural',
        };
    }

    if (genreLower.includes('comedy')) {
        return {
            preferredShotTypes: ['Medium', 'Wide', 'Close-up'],
            preferredMovements: ['Static', 'Pan', 'Zoom'],
            lightingStyle: 'Bright/Natural',
        };
    }

    if (genreLower.includes('sci-fi') || genreLower.includes('scifi')) {
        return {
            preferredShotTypes: ['Wide', 'Extreme Close-up', 'POV'],
            preferredMovements: ['Tracking', 'Dolly', 'Pan'],
            lightingStyle: 'Neon/Cold',
        };
    }

    // Default/Mystery
    return {
        preferredShotTypes: ['Medium', 'Close-up', 'Wide'],
        preferredMovements: ['Static', 'Pan', 'Dolly'],
        lightingStyle: 'Natural',
    };
}
