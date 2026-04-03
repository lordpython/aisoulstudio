/**
 * Story Pipeline — Main pipeline entry point and token estimation
 */

import { agentLogger } from "../../infrastructure/logger";
import { storyModeStore } from "../production/store";
import type { StoryModeState } from "../production/types";
import { cloudAutosave } from "../../cloud/cloudStorageService";
import { formatRegistry } from "../../format/formatRegistry";
import type {
    StoryProgress,
    FormatAwareGenerationOptions,
    VideoFormat,
} from "./schemas";
import { countScriptWords, validateDurationConstraint } from "./prompts";
import {
    generateBreakdown,
    generateScreenplay,
    extractCharactersFromScreenplay,
    generateVoiceoverScripts,
    generateSceneVisuals,
    generateCharacterReferences,
} from "./stages";

const log = agentLogger.child('StoryPipeline');

export interface StoryPipelineOptions {
    topic: string;
    sessionId?: string;
    generateCharacterRefs?: boolean;
    generateVisuals?: boolean;
    visualStyle?: string;
    onProgress?: (progress: StoryProgress) => void;
    // Format-aware options (Task 6.1)
    formatId?: VideoFormat;
    genre?: string;
    language?: 'ar' | 'en';
    researchSummary?: string;
    researchCitations?: string;
    referenceContent?: string;
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
        formatId,
        genre,
        language,
        researchSummary,
        researchCitations,
        referenceContent,
    } = options;

    // Compose format-aware options to pass to internal pipeline steps
    const formatOptions: FormatAwareGenerationOptions | undefined = formatId
        ? { formatId, genre, language, researchSummary, researchCitations, referenceContent }
        : undefined;

    log.info(`Starting story pipeline for: ${topic.slice(0, 50)}...`);

    // Initialize cloud autosave
    cloudAutosave.initSession(sessionId).catch(err => {
        log.warn('Cloud autosave init failed (non-fatal):', err);
    });

    try {
        // Step 1: Topic → Breakdown
        onProgress?.({ stage: 'breakdown', message: 'Creating story outline...', progress: 10 });
        const breakdown = await generateBreakdown(topic, formatOptions);

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
            // Persist format metadata in session state (Req 18.3)
            formatId: formatId ?? 'movie-animation',
            language: formatOptions
                ? (language ?? (/[\u0600-\u06FF]/.test(topic) ? 'ar' : 'en'))
                : undefined,
        };
        storyModeStore.set(sessionId, state);

        // Step 2: Breakdown → Screenplay
        onProgress?.({ stage: 'screenplay', message: 'Writing screenplay...', progress: 30 });
        const screenplay = await generateScreenplay(breakdown.acts, formatOptions);

        state.screenplay = screenplay;
        state.currentStep = 'screenplay';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        // Duration constraint validation (Task 6.4 — Requirements 12.3)
        // Non-fatal: log a warning if the script is outside the format's target range.
        if (formatId) {
            const formatMeta = formatRegistry.getFormat(formatId);
            if (formatMeta) {
                const wordCount = countScriptWords(screenplay);
                const durationResult = validateDurationConstraint(wordCount, formatMeta);
                if (!durationResult.valid) {
                    log.warn(`Duration constraint: ${durationResult.message} (${wordCount} words, ~${durationResult.estimatedSeconds}s estimated)`);
                } else {
                    log.info(`Duration OK: ~${durationResult.estimatedSeconds}s for ${formatMeta.name} (${wordCount} words)`);
                }
            }
        }

        // Step 3: Screenplay → Characters (text extraction only, no images yet)
        onProgress?.({ stage: 'characters', message: 'Extracting characters...', progress: 45 });
        let characters = await extractCharactersFromScreenplay(screenplay);

        state.characters = characters;
        state.currentStep = 'characters';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        // Populate charactersPresent on each scene by matching character names
        // against dialogue speakers and action text.
        const charNames = characters.map(c => c.name);
        for (const scene of screenplay) {
            const matched = new Set<string>();
            for (const name of charNames) {
                const nameLower = name.toLowerCase();
                // Check dialogue speakers
                if (scene.dialogue.some(d => d.speaker.toLowerCase() === nameLower)) {
                    matched.add(name);
                    continue;
                }
                // Check action text
                if (scene.action.toLowerCase().includes(nameLower)) {
                    matched.add(name);
                }
            }
            scene.charactersPresent = Array.from(matched);
        }
        state.screenplay = screenplay;
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        // Step 3.5: Generate voiceover scripts (text → delivery-marked narration)
        onProgress?.({ stage: 'voiceover', message: 'Writing voiceover scripts...', progress: 50 });
        const emotionalHooks = breakdown.acts.map(a => a.emotionalHook);
        const detectedLang: 'ar' | 'en' = formatOptions?.language
            ?? (/[\u0600-\u06FF]/.test(topic) ? 'ar' : 'en');

        const voiceoverMap = await generateVoiceoverScripts(screenplay, emotionalHooks, detectedLang);
        const voiceovers: Record<string, string> = {};
        voiceoverMap.forEach((script, sceneId) => { voiceovers[sceneId] = script; });

        state.voiceovers = voiceovers;
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        log.info(`Voiceover scripts generated: ${voiceoverMap.size}/${screenplay.length}`);

        // Step 4: Generate scene visuals
        let visualCount = 0;
        if (generateVisuals) {
            onProgress?.({
                stage: 'visuals',
                message: 'Generating scene visuals...',
                progress: 55,
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
                        progress: 55 + (current / total) * 20,
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

        // Step 5: Generate character references (after art step — uses the same visual style)
        if (generateCharacterRefs && characters.length > 0) {
            onProgress?.({
                stage: 'characters',
                message: 'Generating character reference sheets...',
                progress: 80,
                currentStep: 0,
                totalSteps: characters.length,
            });

            characters = await generateCharacterReferences(
                characters,
                sessionId,
                visualStyle,
                (current, total) => {
                    onProgress?.({
                        stage: 'characters',
                        message: `Generating reference ${current}/${total}...`,
                        progress: 80 + (current / total) * 15,
                        currentStep: current,
                        totalSteps: total,
                    });
                }
            );

            state.characters = characters;
            state.updatedAt = Date.now();
            storyModeStore.set(sessionId, state);
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
