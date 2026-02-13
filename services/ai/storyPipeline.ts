/**
 * Story Pipeline - Discrete LLM Calls for Story Generation
 *
 * Breaks story generation into separate, focused LLM calls to avoid
 * context explosion. Each step only receives the input it needs.
 *
 * Pipeline stages:
 * 1. Topic → Breakdown (minimal context)
 * 2. Breakdown → Screenplay (only breakdown)
 * 3. Screenplay → Characters (only screenplay)
 * 4. Scene → Visual (one scene at a time)
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { GEMINI_API_KEY, MODELS } from "../shared/apiClient";
import { agentLogger } from "../logger";
import { storyModeStore } from "./production/store";
import type { StoryModeState } from "./production/types";
import type { ScreenplayScene, CharacterProfile } from "@/types";
import { generateImageFromPrompt } from "../imageService";
import { cloudAutosave } from "../cloudStorageService";

const log = agentLogger.child('StoryPipeline');

// --- Schemas for structured output ---

const BreakdownSchema = z.object({
    acts: z.array(z.object({
        title: z.string(),
        emotionalHook: z.string(),
        narrativeBeat: z.string(),
    })).min(3).max(5),
});

const ScreenplaySchema = z.object({
    scenes: z.array(z.object({
        heading: z.string(),
        action: z.string(),
        dialogue: z.array(z.object({
            speaker: z.string(),
            text: z.string(),
        })),
    })).min(3).max(8),
});

const CharacterSchema = z.object({
    characters: z.array(z.object({
        name: z.string(),
        role: z.string(),
        visualDescription: z.string(),
    })),
});

// --- Progress callback type ---

export interface StoryProgress {
    stage: 'breakdown' | 'screenplay' | 'characters' | 'visuals' | 'complete' | 'error';
    message: string;
    progress?: number; // 0-100
    currentStep?: number;
    totalSteps?: number;
}

// --- Pipeline Functions (Discrete LLM Calls) ---

/**
 * Step 1: Generate narrative breakdown from topic
 * Context: Only the topic (minimal)
 */
async function generateBreakdown(topic: string): Promise<{ acts: { title: string; emotionalHook: string; narrativeBeat: string }[] }> {
    log.info('Step 1: Generating breakdown from topic');

    const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.7,
    }).withStructuredOutput(BreakdownSchema);

    const prompt = `Create a narrative breakdown for a short video story about:
"${topic}"

Divide into 3-5 acts. For each act provide:
1. Title - A compelling act title
2. Emotional Hook - The emotional core of this act
3. Narrative Beat - Key story event or revelation

Keep each field concise (1-2 sentences max).`;

    const result = await model.invoke(prompt);
    log.info(`Breakdown complete: ${result.acts.length} acts`);
    return result;
}

/**
 * Step 2: Generate screenplay from breakdown
 * Context: Only the breakdown (not the original topic)
 */
async function generateScreenplay(
    breakdownActs: { title: string; emotionalHook: string; narrativeBeat: string }[]
): Promise<ScreenplayScene[]> {
    log.info('Step 2: Generating screenplay from breakdown');

    const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.7,
    }).withStructuredOutput(ScreenplaySchema);

    // Format breakdown concisely
    const breakdownText = breakdownActs.map((act, i) =>
        `Act ${i + 1}: ${act.title}\n- Hook: ${act.emotionalHook}\n- Beat: ${act.narrativeBeat}`
    ).join('\n\n');

    const prompt = `Write a short screenplay based on this outline:

${breakdownText}

Create 3-8 scenes. For each scene:
1. Heading - Location/time (e.g., "INT. SPACESHIP - DAY")
2. Action - Visual description of what happens
3. Dialogue - Character lines (if any)

Keep action descriptions vivid but concise.`;

    const result = await model.invoke(prompt);

    // Map to ScreenplayScene format
    const scenes: ScreenplayScene[] = result.scenes.map((s, i) => ({
        id: `scene_${i}`,
        sceneNumber: i + 1,
        heading: s.heading,
        action: s.action,
        dialogue: s.dialogue,
        charactersPresent: [],
    }));

    log.info(`Screenplay complete: ${scenes.length} scenes`);
    return scenes;
}

/**
 * Step 3: Extract characters from screenplay
 * Context: Only the screenplay (not breakdown or topic)
 */
async function extractCharactersFromScreenplay(
    scenes: ScreenplayScene[]
): Promise<CharacterProfile[]> {
    log.info('Step 3: Extracting characters from screenplay');

    const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.3,
    }).withStructuredOutput(CharacterSchema);

    // Minimal screenplay summary for character extraction
    const scenesSummary = scenes.map(s =>
        `${s.heading}: ${s.action.slice(0, 200)}${s.action.length > 200 ? '...' : ''}`
    ).join('\n');

    const dialogueSpeakers = new Set<string>();
    scenes.forEach(s => s.dialogue.forEach(d => dialogueSpeakers.add(d.speaker)));

    const prompt = `Extract main characters from this screenplay:

${scenesSummary}

Characters mentioned in dialogue: ${Array.from(dialogueSpeakers).join(', ')}

For each character provide:
1. Name
2. Role (protagonist, antagonist, supporting)
3. Visual Description - Detailed appearance for image generation (age, gender, ethnicity, hair, clothing, distinguishing features)

Focus on characters with significant presence.`;

    const result = await model.invoke(prompt);

    const characters: CharacterProfile[] = result.characters.map((c, i) => ({
        id: `char_${Date.now()}_${i}`,
        name: c.name,
        role: c.role,
        visualDescription: c.visualDescription,
    }));

    log.info(`Characters extracted: ${characters.length}`);
    return characters;
}

/**
 * Step 4: Generate character reference images
 * Context: One character at a time
 */
async function generateCharacterReferences(
    characters: CharacterProfile[],
    sessionId: string,
    onProgress?: (current: number, total: number) => void
): Promise<CharacterProfile[]> {
    log.info(`Step 4: Generating ${characters.length} character references`);

    const results: CharacterProfile[] = [];

    for (let i = 0; i < characters.length; i++) {
        const char = characters[i];
        if (!char) continue;

        onProgress?.(i + 1, characters.length);
        log.info(`Generating reference ${i + 1}/${characters.length}: ${char.name}`);

        try {
            const prompt = `Character Design Sheet for "${char.name}".
${char.visualDescription}
White background, neutral lighting, clean studio setting.
Front view and three-quarter view, full body visible.
Professional character reference sheet style.`;

            const referenceUrl = await generateImageFromPrompt(
                prompt,
                "Character Sheet",
                char.name,
                "1:1",
                false,
                undefined,
                sessionId
            );

            results.push({
                ...char,
                referenceImageUrl: referenceUrl,
            });
        } catch (error) {
            log.error(`Failed to generate reference for ${char.name}:`, error);
            results.push(char); // Keep character without reference
        }
    }

    return results;
}

/**
 * Build a compact visual anchor for a character (clothing/face tags only, not full bio).
 * This keeps prompts focused on the action while maintaining character consistency.
 */
function buildVisualAnchor(char: CharacterProfile): string {
    // Extract just the visual identifiers (first 2 sentences or 30 words max)
    const desc = char.visualDescription || '';
    const words = desc.split(/\s+/);
    const compact = words.slice(0, 30).join(' ');
    return `[${char.name}: ${compact}]`;
}

/**
 * Step 5: Generate scene visuals
 * Context: One scene at a time with character references and emotional context
 */
async function generateSceneVisuals(
    scenes: ScreenplayScene[],
    characters: CharacterProfile[],
    sessionId: string,
    style: string = "Cinematic",
    onProgress?: (current: number, total: number) => void,
    emotionalHooks?: string[],
): Promise<{ sceneId: string; imageUrl: string }[]> {
    log.info(`Step 5: Generating ${scenes.length} scene visuals`);

    // Build character visual anchor map (compact, not full bios)
    const charAnchorMap = new Map<string, string>();
    characters.forEach(c => {
        charAnchorMap.set(c.name.toLowerCase(), buildVisualAnchor(c));
    });

    const results: { sceneId: string; imageUrl: string }[] = [];

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        if (!scene) continue;

        onProgress?.(i + 1, scenes.length);
        log.info(`Generating visual ${i + 1}/${scenes.length}: ${scene.heading}`);

        try {
            // Determine emotional context for this scene
            const emotionalVibe = emotionalHooks?.[i] || emotionalHooks?.[0] || 'Cinematic';

            // Build narrative-integrated prompt: character IN the action, not bio + description
            const charAnchors = scene.charactersPresent
                .map(charName => charAnchorMap.get(charName.toLowerCase()))
                .filter(Boolean)
                .join(' ');

            // Compose: visual anchors + scene action + emotional vibe + cinematic polish
            let visualPrompt = charAnchors
                ? `${charAnchors} in a cinematic shot, ${scene.action}.`
                : `${scene.heading}. ${scene.action}.`;

            // Inject emotional context and cinematic direction
            visualPrompt += ` ${emotionalVibe} mood, ${style} lighting, dynamic camera movement.`;

            // Quality control: negative prompt suffix
            visualPrompt += ` --no text, watermark, split screen, morphing, disfigured hands, blurry, static image`;

            const imageUrl = await generateImageFromPrompt(
                visualPrompt,
                style,
                "",
                "16:9",
                false,
                undefined,
                sessionId,
                i
            );

            results.push({ sceneId: scene.id, imageUrl });
        } catch (error) {
            log.error(`Failed to generate visual for scene ${i + 1}:`, error);
        }
    }

    return results;
}

// --- Main Pipeline Entry Point ---

export interface StoryPipelineOptions {
    topic: string;
    sessionId?: string;
    generateCharacterRefs?: boolean;
    generateVisuals?: boolean;
    visualStyle?: string;
    onProgress?: (progress: StoryProgress) => void;
}

export interface StoryPipelineResult {
    success: boolean;
    sessionId: string;
    actCount: number;
    sceneCount: number;
    characterCount: number;
    visualCount: number;
    error?: string;
}

/**
 * Run the complete story pipeline with discrete LLM calls.
 * Each step uses minimal context - no accumulated history.
 */
export async function runStoryPipeline(
    options: StoryPipelineOptions
): Promise<StoryPipelineResult> {
    const {
        topic,
        sessionId = `story_${Date.now()}`,
        generateCharacterRefs = true,
        generateVisuals = true,
        visualStyle = "Cinematic",
        onProgress,
    } = options;

    log.info(`Starting story pipeline for: ${topic.slice(0, 50)}...`);

    // Initialize cloud autosave
    cloudAutosave.initSession(sessionId).catch(err => {
        log.warn('Cloud autosave init failed (non-fatal):', err);
    });

    try {
        // Step 1: Topic → Breakdown
        onProgress?.({ stage: 'breakdown', message: 'Creating story outline...', progress: 10 });
        const breakdown = await generateBreakdown(topic);

        // Initialize state with breakdown
        const state: StoryModeState = {
            id: sessionId,
            topic,
            breakdown: breakdown.acts.map(a => `${a.title}: ${a.narrativeBeat}`).join('\n'),
            screenplay: [],
            characters: [],
            shotlist: [],
            currentStep: 'breakdown',
            updatedAt: Date.now(),
        };
        storyModeStore.set(sessionId, state);

        // Step 2: Breakdown → Screenplay
        onProgress?.({ stage: 'screenplay', message: 'Writing screenplay...', progress: 30 });
        const screenplay = await generateScreenplay(breakdown.acts);

        state.screenplay = screenplay;
        state.currentStep = 'screenplay';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        // Step 3: Screenplay → Characters
        onProgress?.({ stage: 'characters', message: 'Extracting characters...', progress: 50 });
        let characters = await extractCharactersFromScreenplay(screenplay);

        // Step 4: Generate character references (optional)
        if (generateCharacterRefs && characters.length > 0) {
            onProgress?.({
                stage: 'characters',
                message: 'Generating character reference sheets...',
                progress: 60,
                currentStep: 0,
                totalSteps: characters.length,
            });

            characters = await generateCharacterReferences(
                characters,
                sessionId,
                (current, total) => {
                    onProgress?.({
                        stage: 'characters',
                        message: `Generating reference ${current}/${total}...`,
                        progress: 60 + (current / total) * 15,
                        currentStep: current,
                        totalSteps: total,
                    });
                }
            );
        }

        state.characters = characters;
        state.currentStep = 'characters';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        // Step 5: Generate scene visuals (optional)
        // Bridge: carry emotional hooks from breakdown acts to visual generation
        const emotionalHooks = breakdown.acts.map(a => a.emotionalHook);

        let visualCount = 0;
        if (generateVisuals) {
            onProgress?.({
                stage: 'visuals',
                message: 'Generating scene visuals...',
                progress: 75,
                currentStep: 0,
                totalSteps: screenplay.length,
            });

            const visuals = await generateSceneVisuals(
                screenplay,
                characters,
                sessionId,
                visualStyle,
                (current, total) => {
                    onProgress?.({
                        stage: 'visuals',
                        message: `Generating visual ${current}/${total}...`,
                        progress: 75 + (current / total) * 20,
                        currentStep: current,
                        totalSteps: total,
                    });
                },
                emotionalHooks,
            );

            visualCount = visuals.length;

            // Update shotlist with visuals
            state.shotlist = visuals.map((v, i) => ({
                id: `shot_${i}`,
                sceneId: v.sceneId,
                shotNumber: i + 1,
                description: screenplay[i]?.action || '',
                cameraAngle: 'Medium',
                movement: 'Static',
                lighting: 'Cinematic',
                dialogue: screenplay[i]?.dialogue[0]?.text || '',
                imageUrl: v.imageUrl,
            }));
        }

        state.currentStep = 'shotlist';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        onProgress?.({ stage: 'complete', message: 'Story pipeline complete!', progress: 100 });

        log.info(`Pipeline complete: ${breakdown.acts.length} acts, ${screenplay.length} scenes, ${characters.length} characters, ${visualCount} visuals`);

        return {
            success: true,
            sessionId,
            actCount: breakdown.acts.length,
            sceneCount: screenplay.length,
            characterCount: characters.length,
            visualCount,
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('Pipeline failed:', errorMessage);

        onProgress?.({ stage: 'error', message: errorMessage });

        return {
            success: false,
            sessionId,
            actCount: 0,
            sceneCount: 0,
            characterCount: 0,
            visualCount: 0,
            error: errorMessage,
        };
    }
}

/**
 * Get estimated token usage for each pipeline step.
 * Useful for cost estimation.
 */
export function estimatePipelineTokens(topicLength: number): {
    breakdown: { input: number; output: number };
    screenplay: { input: number; output: number };
    characters: { input: number; output: number };
    total: { input: number; output: number };
} {
    // Conservative estimates based on typical content
    const breakdown = {
        input: Math.ceil(topicLength / 4) + 200, // topic + prompt
        output: 500, // structured breakdown
    };

    const screenplay = {
        input: 800, // breakdown text + prompt
        output: 2000, // screenplay scenes
    };

    const characters = {
        input: 1500, // screenplay summary + prompt
        output: 800, // character profiles
    };

    return {
        breakdown,
        screenplay,
        characters,
        total: {
            input: breakdown.input + screenplay.input + characters.input,
            output: breakdown.output + screenplay.output + characters.output,
        },
    };
}
