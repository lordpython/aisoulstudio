/**
 * Story Tools for Production Agent
 *
 * Tools for the step-by-step story mode workflow:
 * breakdown → screenplay → characters → shotlist → voiceover
 *
 * All prompt text is sourced from the template system (loadTemplate/substituteVariables)
 * to stay in sync with storyPipeline.ts. No inline duplicate prompts.
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { agentLogger } from "../../../logger";
import { GEMINI_API_KEY, MODELS } from "../../../shared/apiClient";
import { withAILogging } from "../../../aiLogService";
import { StoryModeSchema, VerifyCharacterConsistencySchema, type StoryModeState } from "../types";
import { storyModeStore, productionStore } from "../store";
import { verifyCharacterConsistency } from "../../../visualConsistencyService";
import { type ScreenplayScene, type CharacterProfile } from "../../../../types";
import { toCharacterInputs } from "../../../prompt/imageStyleGuide";
import { detectLanguage } from "../../../languageDetector";
import { loadTemplate, substituteVariables } from "../../../prompt/templateLoader";
import { buildBreakdownPrompt, generateVoiceoverScripts, BreakdownSchema, ScreenplaySchema } from "../../storyPipeline";

const log = agentLogger.child('Production');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip markdown formatting from LLM-generated text.
 */
function stripMarkdown(text: string): string {
    return text
        .replace(/#{1,6}\s+/g, '')
        .replace(/\*\*([^*]*?)\*\*/g, '$1')
        .replace(/\*([^*]*?)\*/g, '$1')
        .replace(/`([^`]*?)`/g, '$1')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/**
 * Detect if a string looks like a scene heading rather than a character name.
 */
function isSceneHeading(text: string): boolean {
    const trimmed = text.trim();
    return /^(INT\.|EXT\.)/i.test(trimmed)
        || trimmed.length > 30
        || trimmed.split(/\s+/).length > 4;
}

/**
 * Filter out invalid dialogue entries where the LLM confused speaker/description fields.
 */
function sanitizeDialogue(
    entries: Array<{ speaker: string; text: string }>
): Array<{ speaker: string; text: string }> {
    return entries
        .map(d => {
            if (!d.speaker || !d.text) return null;
            if (isSceneHeading(d.speaker)) {
                const rescuedText = d.text && d.text.trim().length > 5 ? d.text : d.speaker;
                return { speaker: 'Narrator', text: stripMarkdown(rescuedText) };
            }
            return d;
        })
        .filter((d): d is { speaker: string; text: string } => d !== null && d.text.trim().length > 0);
}

/**
 * Infer a story genre from the topic text using keyword matching.
 * Falls back to 'Drama' when no clear genre signal is detected.
 */
function detectGenreFromTopic(topic: string): string {
    const lower = topic.toLowerCase();
    if (/\b(horror|scary|terror|monster|ghost|haunted|nightmare)\b/.test(lower)) return 'Horror';
    if (/\b(comedy|funny|humor|laugh|joke|comic|parody|satire)\b/.test(lower)) return 'Comedy';
    if (/\b(romance|love|relationship|wedding|couple|heartbreak)\b/.test(lower)) return 'Romance';
    if (/\b(action|fight|battle|war|adventure|quest|hero|mission)\b/.test(lower)) return 'Action-Adventure';
    if (/\b(sci-fi|science fiction|space|future|robot|ai|alien|galaxy|cyberpunk)\b/.test(lower)) return 'Science Fiction';
    if (/\b(fantasy|magic|dragon|wizard|kingdom|mythical|legend|fairy)\b/.test(lower)) return 'Fantasy';
    if (/\b(thriller|mystery|detective|crime|suspect|murder|conspiracy|heist)\b/.test(lower)) return 'Thriller';
    if (/\b(animation|animated|cartoon|anime|pixar)\b/.test(lower)) return 'Animation';
    if (/\b(children|kids|family|fairy tale|bedtime)\b/.test(lower)) return 'Family';
    if (/\b(biography|biopic|true story|real events|history)\b/.test(lower)) return 'Biographical Drama';
    return 'Drama';
}

/**
 * Score the quality of the current story state (0–100).
 * Used by validateStoryTool to decide whether to retry.
 */
function scoreStoryQuality(state: StoryModeState): { score: number; suggestions: string[] } {
    const suggestions: string[] = [];
    let score = 100;

    // Breakdown quality
    if (!state.breakdown || state.breakdown.length < 80) {
        score -= 35;
        suggestions.push('Breakdown is too short. Regenerate with a more specific topic.');
    } else {
        const actCount = (
            state.breakdown.match(/(?:Act|Chapter|مشهد|الفصل)\s*[0-9\u0660-\u0669]+/gi) || []
        ).length;
        if (actCount < 3) {
            score -= 20;
            suggestions.push(`Only ${actCount} acts detected — story needs 3–5 distinct acts. Regenerate breakdown.`);
        }
        const avgWordsPerAct = state.breakdown.split(/\s+/).length / Math.max(actCount, 1);
        if (avgWordsPerAct < 15) {
            score -= 10;
            suggestions.push('Act descriptions are very brief. Consider a more detailed breakdown.');
        }
    }

    // Screenplay quality
    if (!state.screenplay || state.screenplay.length === 0) {
        if (state.currentStep !== 'breakdown') {
            score -= 30;
            suggestions.push('No screenplay yet. Call create_screenplay first.');
        }
    } else {
        if (state.screenplay.length < 3) {
            score -= 20;
            suggestions.push(`Only ${state.screenplay.length} scenes — minimum is 3. Regenerate screenplay.`);
        }
        const avgActionWords = state.screenplay.reduce(
            (sum, s) => sum + s.action.split(/\s+/).filter(Boolean).length, 0
        ) / state.screenplay.length;
        if (avgActionWords < 15) {
            score -= 15;
            suggestions.push('Scene action lines are too short. Regenerate screenplay with more vivid descriptions.');
        }
    }

    return { score: Math.max(0, score), suggestions };
}

// ---------------------------------------------------------------------------
// Tool: generate_breakdown
// ---------------------------------------------------------------------------

export const generateBreakdownTool = tool(
    async ({ topic, sessionId }) => {
        const id = sessionId || `story_${Date.now()}`;
        log.info(` Generating story breakdown for: ${topic}`);

        if (!GEMINI_API_KEY) {
            return JSON.stringify({
                success: false,
                error: 'GEMINI_API_KEY is not configured.',
            });
        }

        const model = new ChatGoogleGenerativeAI({
            model: MODELS.TEXT_EXP,
            apiKey: GEMINI_API_KEY,
            temperature: 0.7,
            maxRetries: 2,
        });

        const genre = detectGenreFromTopic(topic);
        const detectedLang = detectLanguage(topic);

        // Use the canonical template — same prompt as storyPipeline.ts
        const prompt = buildBreakdownPrompt(topic, {
            formatId: 'movie-animation',
            genre,
            language: detectedLang,
        });

        let breakdown: string;
        let actCount: number;
        try {
            const structuredModel = model.withStructuredOutput(BreakdownSchema);
            const result = await withAILogging(
                id,
                'breakdown',
                MODELS.TEXT_EXP,
                prompt,
                () => structuredModel.invoke(prompt),
                (r) => JSON.stringify(r),
            );
            // Serialize acts to a numbered paragraph format the parser can reliably split
            breakdown = result.acts
                .map((act, i) => `${i + 1}. ${act.title}\n${act.emotionalHook} ${act.narrativeBeat}`)
                .join('\n\n');
            actCount = result.acts.length;
            log.info(' Story breakdown generated');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return JSON.stringify({ success: false, error: `Breakdown generation failed: ${msg}` });
        }

        const state: StoryModeState = storyModeStore.get(id) || {
            id,
            topic,
            breakdown,
            screenplay: [],
            characters: [],
            shotlist: [],
            currentStep: 'breakdown',
            updatedAt: Date.now(),
        };

        state.topic = topic;
        state.breakdown = breakdown;
        state.genre = genre;
        state.currentStep = 'breakdown';
        state.updatedAt = Date.now();
        storyModeStore.set(id, state);

        return JSON.stringify({
            success: true,
            sessionId: id,
            genre,
            actCount,
            message: `Story breakdown created (${genre}, ${actCount} acts). Use sessionId="${id}" for next steps.`,
        });
    },
    {
        name: "generate_breakdown",
        description: "Step 1: Generate a narrative breakdown/outline for the story topic. Returns sessionId and detected genre.",
        schema: StoryModeSchema,
    }
);

// ---------------------------------------------------------------------------
// Tool: create_screenplay
// ---------------------------------------------------------------------------

export const createScreenplayTool = tool(
    async ({ sessionId }) => {
        if (!sessionId) return JSON.stringify({ success: false, error: "sessionId required" });
        const state = storyModeStore.get(sessionId);
        if (!state) return JSON.stringify({ success: false, error: "Session not found. Call generate_breakdown first." });

        log.info(` Creating screenplay for: ${sessionId}`);

        const model = new ChatGoogleGenerativeAI({
            model: MODELS.TEXT_EXP,
            apiKey: GEMINI_API_KEY,
            temperature: 0.7,
            maxRetries: 2,
        });

        const isArabicContent = detectLanguage(state.breakdown) === 'ar';
        const genre = state.genre ?? detectGenreFromTopic(state.topic);

        // Count acts from the stored breakdown text
        const actMarkers = state.breakdown.match(
            /(?:^|\n)\s*(?:مشهد|المشهد|SCENE|Act|Chapter|الفصل)\s*[0-9\u0660-\u0669\u06F0-\u06F9]+/gi
        );
        const listMarkers = !actMarkers?.length
            ? state.breakdown.match(/(?:^|\n)\s*[0-9\u0660-\u0669\u06F0-\u06F9]+[.\-)]/gm)
            : null;
        const actCount = Math.min(Math.max((actMarkers?.length || listMarkers?.length || 3), 3), 8);
        log.info(` Breakdown has ${actCount} acts → requesting ${actCount} screenplay scenes`);

        // Use the canonical screenplay template
        const template = loadTemplate('movie-animation', 'screenplay');
        const prompt = substituteVariables(template, {
            idea: state.topic,
            genre,
            language_instruction: isArabicContent
                ? 'Write the screenplay in Arabic.'
                : 'Write the screenplay in English.',
            research: '',
            references: '',
            breakdown: state.breakdown,
            actCount: String(actCount),
        });

        let scenes: ScreenplayScene[];
        try {
            const structuredModel = model.withStructuredOutput(ScreenplaySchema);
            const result = await withAILogging(
                sessionId,
                'screenplay',
                MODELS.TEXT_EXP,
                prompt,
                () => structuredModel.invoke(prompt),
                (r) => JSON.stringify(r),
            );
            scenes = result.scenes.map((s, i) => ({
                id: `scene_${i}`,
                sceneNumber: i + 1,
                heading: s.heading,
                action: s.action,
                dialogue: sanitizeDialogue(s.dialogue),
                charactersPresent: [...new Set(
                    s.dialogue.map(d => d.speaker).filter(sp => sp !== 'Narrator')
                )],
            }));
            log.info(` Screenplay generated with ${scenes.length} scenes`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return JSON.stringify({ success: false, error: `Screenplay generation failed: ${msg}` });
        }

        state.screenplay = scenes;
        state.currentStep = 'screenplay';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        return JSON.stringify({
            success: true,
            sceneCount: scenes.length,
            sceneHeadings: scenes.map(s => s.heading),
            message: `Screenplay created with ${scenes.length} scenes.`,
        });
    },
    {
        name: "create_screenplay",
        description: "Step 2: Transform the breakdown into a formatted screenplay with dialogue.",
        schema: z.object({ sessionId: z.string() }),
    }
);

// ---------------------------------------------------------------------------
// Tool: generate_characters
// ---------------------------------------------------------------------------

export const generateCharactersTool = tool(
    async ({ sessionId }) => {
        if (!sessionId) return JSON.stringify({ success: false, error: "sessionId required" });
        const state = storyModeStore.get(sessionId);
        if (!state) return JSON.stringify({ success: false, error: "Session not found" });

        log.info(` Extracting characters for: ${sessionId}`);
        const { extractCharacters, generateAllCharacterReferences } = await import("../../../characterService");

        const scriptText = state.screenplay.map(s =>
            `${s.heading}\n${s.action}\n${s.dialogue.map(d => `${d.speaker}: ${d.text}`).join('\n')}`
        ).join('\n\n');

        const characters = await extractCharacters(scriptText, sessionId);
        const charactersWithRefs = await generateAllCharacterReferences(characters, sessionId);

        state.characters = charactersWithRefs;
        state.currentStep = 'characters';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        return JSON.stringify({
            success: true,
            characterCount: charactersWithRefs.length,
            characterNames: charactersWithRefs.map(c => c.name),
            hasReferences: charactersWithRefs.filter(c => c.referenceImageUrl).length,
            message: `Extracted ${charactersWithRefs.length} characters with visual references.`,
        });
    },
    {
        name: "generate_characters",
        description: "Step 3: Extract characters from the screenplay and generate consistent visual reference sheets.",
        schema: z.object({ sessionId: z.string() }),
    }
);

// ---------------------------------------------------------------------------
// Tool: generate_shotlist
// ---------------------------------------------------------------------------

export const generateShotlistTool = tool(
    async ({ sessionId }) => {
        if (!sessionId) return JSON.stringify({ success: false, error: "sessionId required" });
        const state = storyModeStore.get(sessionId);
        if (!state) return JSON.stringify({ success: false, error: "Session not found" });
        if (!state.screenplay || state.screenplay.length === 0) {
            return JSON.stringify({ success: false, error: "Screenplay is empty. Create screenplay first." });
        }

        log.info(` Generating shotlist for: ${sessionId}`);

        try {
            const { breakAllScenesIntoShots, mapShotsToShotlistEntries } = await import("../../shotBreakdownAgent");

            // Use detected genre instead of hardcoded 'Drama'
            const genre = state.genre ?? detectGenreFromTopic(state.topic);
            const characterInputs = toCharacterInputs(state.characters);

            const shotBreakdownResult = await breakAllScenesIntoShots(
                state.screenplay,
                genre,
                (sceneIndex, totalScenes) => {
                    log.info(` Shotlist progress: scene ${sceneIndex + 1}/${totalScenes}`);
                },
                sessionId,
                undefined,
                characterInputs,
            );

            const shots = mapShotsToShotlistEntries(shotBreakdownResult.shots);

            const generatedSceneIds = new Set(shots.map(shot => shot.sceneId));
            const failedSceneSet = new Set(shotBreakdownResult.failedSceneIds);
            const failedSceneCount = state.screenplay.filter(
                scene => failedSceneSet.has(scene.id) || !generatedSceneIds.has(scene.id)
            ).length;

            state.shotlist = shots;
            state.currentStep = 'shotlist';
            state.updatedAt = Date.now();
            storyModeStore.set(sessionId, state);

            const warning = failedSceneCount > 0
                ? ` ${failedSceneCount} scene(s) failed and should be retried.`
                : '';

            return JSON.stringify({
                success: true,
                shotCount: shots.length,
                genre,
                message: `Generated ${shots.length} shots across ${state.screenplay.length} scenes (genre: ${genre}).${warning}`,
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return JSON.stringify({ success: false, error: `Shotlist generation failed: ${msg}` });
        }
    },
    {
        name: "generate_shotlist",
        description: "Step 4: Create a detailed shotlist/storyboard from the screenplay and characters.",
        schema: z.object({ sessionId: z.string() }),
    }
);

// ---------------------------------------------------------------------------
// Tool: generate_voiceover
// ---------------------------------------------------------------------------

export const generateVoiceoverTool = tool(
    async ({ sessionId }) => {
        if (!sessionId) return JSON.stringify({ success: false, error: "sessionId required" });
        const state = storyModeStore.get(sessionId);
        if (!state) return JSON.stringify({ success: false, error: "Session not found" });
        if (!state.screenplay || state.screenplay.length === 0) {
            return JSON.stringify({ success: false, error: "Screenplay required. Call create_screenplay first." });
        }

        log.info(` Generating voiceover scripts for: ${sessionId} (${state.screenplay.length} scenes)`);

        const language = detectLanguage(state.breakdown) === 'ar' ? 'ar' : 'en';

        // Extract emotional hooks from the breakdown text (best-effort)
        const hookPattern = /(?:Emotional Hook|Hook|emotion)\s*:?\s*([^\n]{10,80})/gi;
        const emotionalHooks: string[] = [];
        let hookMatch;
        while ((hookMatch = hookPattern.exec(state.breakdown)) !== null) {
            emotionalHooks.push(hookMatch[1]!.trim());
        }

        const voiceoverMap = await generateVoiceoverScripts(
            state.screenplay,
            emotionalHooks.length > 0 ? emotionalHooks : undefined,
            language,
        );

        const voiceovers: Record<string, string> = {};
        voiceoverMap.forEach((script, sceneId) => { voiceovers[sceneId] = script; });

        state.voiceovers = voiceovers;
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        log.info(` Voiceover scripts generated: ${voiceoverMap.size}/${state.screenplay.length}`);

        return JSON.stringify({
            success: true,
            voiceoverCount: voiceoverMap.size,
            sceneCount: state.screenplay.length,
            language,
            message: `Generated ${voiceoverMap.size} voiceover scripts with delivery markers. Ready for TTS narration.`,
        });
    },
    {
        name: "generate_voiceover",
        description: "Step 4.5: Generate optimized voiceover narration scripts from screenplay scenes, with delivery markers ([pause], [emphasis], [whisper], etc.) for natural TTS speech. Call after generate_shotlist.",
        schema: z.object({ sessionId: z.string() }),
    }
);

// ---------------------------------------------------------------------------
// Tool: validate_story
// ---------------------------------------------------------------------------

export const validateStoryTool = tool(
    async ({ sessionId }) => {
        if (!sessionId) return JSON.stringify({ success: false, error: "sessionId required" });
        const state = storyModeStore.get(sessionId);
        if (!state) return JSON.stringify({ success: false, error: "Session not found" });

        const { score, suggestions } = scoreStoryQuality(state);
        const needsImprovement = score < 70;

        return JSON.stringify({
            success: true,
            score,
            needsImprovement,
            canRetry: needsImprovement,
            currentStep: state.currentStep,
            genre: state.genre,
            actCount: (state.breakdown.match(/(?:Act|Chapter|مشهد|الفصل)\s*[0-9\u0660-\u0669]+/gi) || []).length,
            sceneCount: state.screenplay?.length ?? 0,
            suggestions,
            message: needsImprovement
                ? `Quality score: ${score}/100. Issues found — see suggestions.`
                : `Quality score: ${score}/100. Story looks good!`,
        });
    },
    {
        name: "validate_story",
        description: "Check story quality (0–100 score). If score < 70 and canRetry is true, regenerate the step indicated in suggestions. Call after generate_breakdown or create_screenplay.",
        schema: z.object({ sessionId: z.string() }),
    }
);

// ---------------------------------------------------------------------------
// Tool: verify_character_consistency
// ---------------------------------------------------------------------------

export const verifyCharacterConsistencyTool = tool(
    async ({ sessionId, characterName }) => {
        log.info(` Verifying consistency for ${characterName} in session ${sessionId}`);

        const storyState = storyModeStore.get(sessionId);
        let profileFound: any = storyState?.characters?.find((c: any) => c.name === characterName);
        let imageUrls: string[] = [];

        if (storyState) {
            imageUrls = storyState.shotlist
                .filter((s: any) => s.imageUrl)
                .map((s: any) => s.imageUrl);
        } else {
            const pState = productionStore.get(sessionId);
            if (pState) {
                profileFound = pState.contentPlan?.characters?.find(c => c.name === characterName);
                if (!profileFound) {
                    profileFound = (pState as any).characters?.find((c: any) => c.name === characterName);
                }
                imageUrls = pState.visuals
                    .filter(v => !v.isPlaceholder)
                    .map(v => v.imageUrl);
            }
        }

        if (!profileFound) {
            const availableChars = storyState?.characters?.map((c: any) => c.name).join(", ") ||
                productionStore.get(sessionId)?.contentPlan?.characters?.map(c => c.name).join(", ") || "None";
            return JSON.stringify({
                success: false,
                error: `Character "${characterName}" not found. Available: ${availableChars}`
            });
        }

        if (imageUrls.length === 0) {
            return JSON.stringify({
                success: false,
                error: "No generated images found. Generate visuals first."
            });
        }

        const characterToVerify: CharacterProfile = {
            id: profileFound.id || "unknown",
            name: profileFound.name,
            role: profileFound.role || "Character",
            visualDescription: profileFound.visualDescription ||
                `${profileFound.appearance || ""} ${profileFound.clothing || ""}`
        };

        const language = detectLanguage(
            (characterToVerify.visualDescription ?? '') + ' ' + characterToVerify.name
        );

        const report = await verifyCharacterConsistency(imageUrls, characterToVerify, language);

        return JSON.stringify({ success: true, report });
    },
    {
        name: "verify_character_consistency",
        description: "Verifies visual consistency of a character across all generated shots.",
        schema: VerifyCharacterConsistencySchema,
    }
);
