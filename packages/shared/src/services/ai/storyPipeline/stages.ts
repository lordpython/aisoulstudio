/**
 * Story Pipeline — Discrete LLM pipeline stages
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GEMINI_API_KEY, MODELS } from "../../shared/apiClient";
import { cleanForTTS } from "../../audio-processing/textSanitizer";
import { agentLogger } from "../../infrastructure/logger";
import { generateImageFromPrompt } from "../../media/imageService";
import { buildImageStyleGuide } from "../../prompt/imageStyleGuide";
import { ParallelExecutionEngine, type Task } from "../../orchestration/parallelExecutionEngine";
import {
    BreakdownSchema,
    ScreenplaySchema,
    CharacterSchema,
    VoiceoverSchema,
    type FormatAwareGenerationOptions,
} from "./schemas";
import type { ScreenplayScene, CharacterProfile } from "./schemas";
import { buildBreakdownPrompt, buildScreenplayPrompt } from "./prompts";

const log = agentLogger.child('StoryPipeline');

/**
 * Step 1: Generate narrative breakdown from topic.
 * Context: Only the topic (minimal).
 */
export async function generateBreakdown(
    topic: string,
    formatOptions?: FormatAwareGenerationOptions
): Promise<{ acts: { title: string; emotionalHook: string; narrativeBeat: string }[] }> {
    log.info('Step 1: Generating breakdown from topic');

    const opts: FormatAwareGenerationOptions = {
        formatId: formatOptions?.formatId ?? 'movie-animation',
        genre: formatOptions?.genre ?? '',
        language: formatOptions?.language,
        researchSummary: formatOptions?.researchSummary,
        researchCitations: formatOptions?.researchCitations,
        referenceContent: formatOptions?.referenceContent,
    };

    const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.7,
    }).withStructuredOutput(BreakdownSchema);

    const prompt = buildBreakdownPrompt(topic, opts);
    const result = await model.invoke(prompt);
    log.info(`Breakdown complete: ${result.acts.length} acts`);
    return result;
}

/**
 * Step 2: Generate screenplay from breakdown.
 * Context: Only the breakdown (not the original topic).
 */
export async function generateScreenplay(
    breakdownActs: { title: string; emotionalHook: string; narrativeBeat: string }[],
    formatOptions?: FormatAwareGenerationOptions
): Promise<ScreenplayScene[]> {
    log.info('Step 2: Generating screenplay from breakdown');

    const opts: FormatAwareGenerationOptions = {
        formatId: formatOptions?.formatId ?? 'movie-animation',
        genre: formatOptions?.genre ?? '',
        language: formatOptions?.language,
        researchSummary: formatOptions?.researchSummary,
        researchCitations: formatOptions?.researchCitations,
        referenceContent: formatOptions?.referenceContent,
    };

    const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.7,
    }).withStructuredOutput(ScreenplaySchema);

    const prompt = buildScreenplayPrompt(breakdownActs, opts);
    const result = await model.invoke(prompt);

    // Map to ScreenplayScene format with speaker repair
    const scenes: ScreenplayScene[] = result.scenes.map((s, i) => ({
        id: `scene_${i}`,
        sceneNumber: i + 1,
        heading: s.heading,
        action: s.action,
        dialogue: s.dialogue
            .map(d => {
                const speakerWords = d.speaker.trim().split(/\s+/).length;
                const speakerTooLong = speakerWords > 4 || d.speaker.length > 30;
                if (speakerTooLong) {
                    log.warn(`[generateScreenplay] Misaligned speaker field detected — recovering as Narrator`);
                    const rescuedText = d.text && d.text.trim().length > 5 ? d.text : d.speaker;
                    return { speaker: 'Narrator', text: cleanForTTS(rescuedText) };
                }
                return { speaker: d.speaker, text: cleanForTTS(d.text) };
            })
            .filter(d => d.text.trim().length > 0),
        charactersPresent: [],
    }));

    log.info(`Screenplay complete: ${scenes.length} scenes`);
    return scenes;
}

/**
 * Step 3: Extract characters from screenplay.
 * Context: Only the screenplay (not breakdown or topic).
 */
export async function extractCharactersFromScreenplay(
    scenes: ScreenplayScene[]
): Promise<CharacterProfile[]> {
    log.info('Step 3: Extracting characters from screenplay');

    const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.3,
    }).withStructuredOutput(CharacterSchema);

    // Build extended scene context (300 chars) and per-speaker dialogue samples
    const scenesSummary = scenes.map(s =>
        `${s.heading}: ${s.action.slice(0, 300)}${s.action.length > 300 ? '...' : ''}`
    ).join('\n');

    // Collect up to 2 sample lines per speaker to give the model voice/personality context
    const dialogueSampleMap = new Map<string, string[]>();
    scenes.forEach(s => s.dialogue.forEach(d => {
        if (!dialogueSampleMap.has(d.speaker)) dialogueSampleMap.set(d.speaker, []);
        const samples = dialogueSampleMap.get(d.speaker)!;
        if (samples.length < 2) samples.push(d.text.slice(0, 80));
    }));
    const dialogueContext = Array.from(dialogueSampleMap.entries())
        .map(([speaker, lines]) => `  ${speaker}: "${lines.join('" / "')}"`)
        .join('\n');

    const prompt = `Extract main characters from this screenplay:

${scenesSummary}

Character dialogue samples:
${dialogueContext}

For each character provide:
1. Name
2. Role (protagonist, antagonist, supporting)
3. Visual Description - Detailed appearance for image generation (age, gender, ethnicity, hair, clothing, distinguishing features). Be specific about: age range, build, skin tone, hair style/color, and 1-2 distinctive outfit items.
4. Facial Tags - REQUIRED: Exactly 5 comma-separated visual keywords that uniquely identify this character (e.g., "sharp jawline, dark curly hair, olive skin, worn leather jacket, silver earring"). These will be embedded in every image prompt to maintain consistency.

Focus on characters with significant presence. Each character must have all 4 fields.`;

    const result = await model.invoke(prompt);

    const characters: CharacterProfile[] = result.characters.map((c, i) => ({
        id: `char_${Date.now()}_${i}`,
        name: c.name,
        role: c.role,
        visualDescription: c.visualDescription,
        facialTags: c.facialTags,
    }));

    log.info(`Characters extracted: ${characters.length}`);
    return characters;
}

/**
 * Generate voiceover scripts from screenplay action text.
 * Rewrites camera-facing action descriptions into spoken narration
 * optimized for TTS delivery, with inline delivery markers.
 *
 * @param scenes - Screenplay scenes with action text
 * @param emotionalHooks - Per-act emotional hooks from breakdown
 * @returns Map of sceneId → voiceover script string (with delivery markers)
 */
export async function generateVoiceoverScripts(
    scenes: ScreenplayScene[],
    emotionalHooks?: string[],
    language?: 'ar' | 'en',
): Promise<Map<string, string>> {
    log.info(`Generating voiceover scripts for ${scenes.length} scenes`);

    const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.6,
    }).withStructuredOutput(VoiceoverSchema);

    // Build scene context for the LLM
    const sceneDescriptions = scenes.map((s, i) => {
        const emotion = emotionalHooks?.[i] || emotionalHooks?.[0] || '';
        const dialogueText = s.dialogue.length > 0
            ? `\nDialogue: ${s.dialogue.map(d => `${d.speaker}: "${d.text}"`).join(' | ')}`
            : '';
        return `Scene ${i + 1} [id: ${s.id}]${emotion ? ` (mood: ${emotion})` : ''}:\n` +
            `Location: ${s.heading}\n` +
            `Action: ${s.action}${dialogueText}`;
    }).join('\n\n');

    const prompt = `You are a voiceover scriptwriter. Rewrite these screenplay action descriptions into narration scripts optimized for spoken delivery.

SCREENPLAY SCENES:
${sceneDescriptions}

RULES:
1. Convert visual/camera directions into evocative spoken narration (what a narrator would SAY, not what a camera would SEE)
2. Use sensory language: sounds, textures, temperature, movement
3. Keep roughly the same length as the original action text (±20%)
4. Do NOT include character dialogue — only the narrator's voiceover
5. Do NOT include scene headings, metadata labels, or markdown formatting
6. ${language === 'ar' ? 'Write ALL voiceovers in Arabic. Use natural Modern Standard Arabic suitable for spoken narration.' : 'Write the voiceovers in English.'}

DELIVERY MARKERS — Insert these where appropriate for natural spoken pacing:
- [pause: beat] — After a dramatic reveal or scene transition
- [pause: long] — Before a climactic moment
- [emphasis]key phrase[/emphasis] — On emotionally charged words or character names on first appearance
- [rising-tension]text[/rising-tension] — When intensity builds (chase, confrontation, countdown)
- [slow]text[/slow] — For solemn, reflective, or awe-inspiring moments
- [whisper]text[/whisper] — For secrets, danger, or intimacy
- [breath] — Before a long emotional passage

EXAMPLE:
Action: "Sami hurls a dodgeball with wild intensity, but it misses the target by a wide margin. Rajih stands with crossed arms, his eyes sharp and unyielding."
Voiceover: "[breath] With every fiber of his being, [emphasis]Sami[/emphasis] hurls the ball forward [pause: beat] but it sails wide, kicking up dust where the target once stood. [slow]Rajih watches, arms crossed, his gaze cutting deeper than any throw.[/slow]"

Return one voiceover script per scene, preserving the scene IDs exactly.`;

    try {
        const result = await model.invoke(prompt);

        const voiceoverMap = new Map<string, string>();
        for (const vo of result.voiceovers) {
            voiceoverMap.set(vo.sceneId, vo.script);
        }

        log.info(`Voiceover scripts generated: ${voiceoverMap.size}/${scenes.length}`);
        return voiceoverMap;
    } catch (error) {
        log.error('Voiceover generation failed, falling back to raw action text:', error);
        // Non-fatal: return empty map, caller uses original action text
        return new Map();
    }
}

/**
 * Step 4: Generate character reference images.
 * Context: One character at a time.
 */
export async function generateCharacterReferences(
    characters: CharacterProfile[],
    sessionId: string,
    style: string = "Cinematic",
    onProgress?: (current: number, total: number) => void
): Promise<CharacterProfile[]> {
    log.info(`Step 4: Generating ${characters.length} character references in "${style}" style`);

    const results: CharacterProfile[] = [];

    for (let i = 0; i < characters.length; i++) {
        const char = characters[i];
        if (!char) continue;

        onProgress?.(i + 1, characters.length);
        log.info(`Generating reference ${i + 1}/${characters.length}: ${char.name}`);

        try {
            const charGuide = buildImageStyleGuide({
                scene: `Character Design Sheet for "${char.name}"`,
                subjects: [{ type: "person", description: char.visualDescription ?? '', pose: "front view and three-quarter view, full body" }],
                style,
                background: "neutral white background",
                lighting: { source: "studio softbox", quality: "soft diffused", direction: "rim light accent" },
                composition: { shot_type: "medium shot", camera_angle: "eye-level", framing: "center framing" },
                avoid: ["blur", "darkness", "noise", "low quality", "text", "watermark"],
            });

            const referenceUrl = await generateImageFromPrompt(
                char.visualDescription ?? '',
                style,
                char.name,
                "1:1",
                true,       // skipRefine — guide is already complete
                undefined,
                sessionId,
                undefined,
                charGuide,  // prebuiltGuide — avoids double-wrapping
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
    if (char.facialTags) {
        return `[${char.name}: ${char.facialTags}]`;
    }
    const desc = char.visualDescription || '';
    const words = desc.split(/\s+/);
    const compact = words.slice(0, 20).join(' ');
    return `[${char.name}: ${compact}]`;
}

/**
 * Step 5: Generate scene visuals in parallel using ParallelExecutionEngine.
 * Supports resume via existingVisuals — scenes already in that list are skipped.
 */
export async function generateSceneVisuals(
    scenes: ScreenplayScene[],
    characters: CharacterProfile[],
    sessionId: string,
    style: string = "Cinematic",
    onProgress?: (current: number, total: number) => void,
    emotionalHooks?: string[],
    existingVisuals?: { sceneId: string; imageUrl: string }[],
): Promise<{ sceneId: string; imageUrl: string }[]> {
    log.info(`Step 5: Generating scene visuals (${scenes.length} total)`);

    // Build character visual anchor map (compact, not full bios)
    const charAnchorMap = new Map<string, string>();
    characters.forEach(c => {
        charAnchorMap.set(c.name.toLowerCase(), buildVisualAnchor(c));
    });

    // Build map of already-done visuals for quick lookup
    const existingMap = new Map<string, string>(
        (existingVisuals || []).map(v => [v.sceneId, v.imageUrl])
    );

    // Start results with already-generated visuals
    const results: { sceneId: string; imageUrl: string }[] = [...(existingVisuals || [])];

    // Filter to only scenes that still need generation
    const scenesToProcess = scenes.filter(s => !existingMap.has(s.id));

    if (scenesToProcess.length === 0) {
        log.info('All scene visuals already generated, skipping');
        return results;
    }

    log.info(`Generating ${scenesToProcess.length} new visuals (${existingMap.size} already done)`);

    const tasks: Task<{ sceneId: string; imageUrl: string }>[] = scenesToProcess.map(scene => {
        const sceneIndex = scenes.indexOf(scene);
        return {
            id: scene.id,
            type: 'visual' as const,
            priority: sceneIndex,
            retryable: true,
            timeout: 90_000,
            execute: async () => {
                const emotionalVibe = emotionalHooks?.[sceneIndex] || emotionalHooks?.[0] || 'Cinematic';

                const charSubjects = scene.charactersPresent
                    .map(charName => {
                        const anchor = charAnchorMap.get(charName.toLowerCase());
                        return anchor ? { type: "person" as const, description: anchor } : null;
                    })
                    .filter((s): s is { type: "person"; description: string } => s !== null);

                const sceneGuide = buildImageStyleGuide({
                    scene: scene.action,
                    subjects: charSubjects.length > 0 ? charSubjects : undefined,
                    mood: emotionalVibe,
                    style,
                    background: scene.heading,
                });

                const imageUrl = await generateImageFromPrompt(
                    scene.action,
                    style,
                    "",
                    "16:9",
                    true,
                    undefined,
                    sessionId,
                    sceneIndex,
                    sceneGuide,
                );

                log.info(`Generated visual for scene ${sceneIndex + 1}: ${scene.id}`);
                return { sceneId: scene.id, imageUrl };
            },
        };
    });

    const alreadyDoneCount = results.length;
    const engine = new ParallelExecutionEngine();
    const taskResults = await engine.execute(tasks, {
        concurrencyLimit: 4,
        retryAttempts: 2,
        retryDelay: 2000,
        exponentialBackoff: true,
        onProgress: (p) => {
            const completedCount = alreadyDoneCount + p.completedTasks;
            onProgress?.(completedCount, scenes.length);
        },
        onTaskFail: (taskId, error) => {
            log.error(`Failed to generate visual for scene ${taskId}:`, error.message);
        },
    });

    // Collect successful results
    for (const result of taskResults) {
        if (result.success && result.data) {
            results.push(result.data);
        }
    }

    log.info(`Scene visuals complete: ${results.length}/${scenes.length} generated`);
    return results;
}
