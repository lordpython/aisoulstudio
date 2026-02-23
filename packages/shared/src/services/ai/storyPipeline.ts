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
import { cleanForTTS } from "../textSanitizer";
import { agentLogger } from "../logger";
import { storyModeStore } from "./production/store";
import type { StoryModeState } from "./production/types";
import type { ScreenplayScene, CharacterProfile, FormatMetadata, VideoFormat } from "@/types";
import { generateImageFromPrompt } from "../imageService";
import { buildImageStyleGuide } from "../prompt/imageStyleGuide";
import { cloudAutosave } from "../cloudStorageService";
import { loadTemplate, substituteVariables } from "../prompt/templateLoader";
import { formatRegistry } from "../formatRegistry";
import { detectLanguage } from "../languageDetector";

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
            // Hard cap: a character name is never more than 4 words / 30 chars.
            // This rejects paragraphs mistakenly placed in the speaker field.
            speaker: z.string().max(30).describe(
                "Character name ONLY (1-4 words, e.g. 'Faisal', 'Maya', 'Narrator'). " +
                "NEVER put scene descriptions, emotions, or visual directions here."
            ).refine(
                val => val.trim().split(/\s+/).length <= 4,
                { message: "Speaker must be a character name (≤4 words), not a description" }
            ),
            text: z.string().min(1).describe(
                "The spoken dialogue line. Must not be empty."
            ),
        })),
    })).min(3).max(8),
});

const CharacterSchema = z.object({
    characters: z.array(z.object({
        name: z.string(),
        role: z.string(),
        visualDescription: z.string(),
        facialTags: z.string().optional(),
    })),
});

const VoiceoverSchema = z.object({
    voiceovers: z.array(z.object({
        sceneId: z.string(),
        script: z.string().describe(
            "The voiceover narration rewritten for spoken delivery. " +
            "Include delivery markers: [pause: short|medium|long|beat], " +
            "[emphasis]word[/emphasis], [whisper]text[/whisper], " +
            "[rising-tension]text[/rising-tension], [slow]text[/slow], [breath]."
        ),
    })),
});

// --- Progress callback type ---

export interface StoryProgress {
    stage: 'breakdown' | 'screenplay' | 'characters' | 'voiceover' | 'visuals' | 'complete' | 'error';
    message: string;
    progress?: number; // 0-100
    currentStep?: number;
    totalSteps?: number;
}

// --- Format-Aware Generation Options ---

/**
 * Options for format-specific narrative generation.
 * All fields are optional; when omitted the pipeline falls back to 'movie-animation' defaults.
 */
export interface FormatAwareGenerationOptions {
    /** Video format identifier — defaults to 'movie-animation' */
    formatId?: VideoFormat;
    /** Genre style modifier (e.g., 'Drama', 'Comedy') */
    genre?: string;
    /** Explicit language override — auto-detected from topic if omitted */
    language?: 'ar' | 'en';
    /** Research summary to incorporate in the prompt (from ResearchService) */
    researchSummary?: string;
    /** Formatted citation list to include alongside the research summary */
    researchCitations?: string;
    /** Raw reference document content to treat as primary source material */
    referenceContent?: string;
}

// --- Duration Constraint Helpers ---

/** Estimated narration speech rate (words per second) — ~140 wpm */
const WORDS_PER_SECOND = 140 / 60;

/**
 * Estimate video duration in seconds based on script word count.
 * Assumes a typical narration pace of ~140 words per minute.
 *
 * @param wordCount - Total words in the script
 * @returns Estimated duration in seconds
 */
export function estimateDurationSeconds(wordCount: number): number {
    return Math.ceil(wordCount / WORDS_PER_SECOND);
}

/**
 * Validate whether a script's estimated duration falls within a format's allowed range.
 * Returns a result with `valid`, the `estimatedSeconds`, and an optional human-readable `message`.
 *
 * Requirements: 12.3
 *
 * @param wordCount  - Word count of the combined script (action + dialogue)
 * @param formatMeta - Format metadata containing the durationRange to validate against
 */
export function validateDurationConstraint(
    wordCount: number,
    formatMeta: FormatMetadata
): { valid: boolean; estimatedSeconds: number; message?: string } {
    const estimatedSeconds = estimateDurationSeconds(wordCount);
    const { min, max } = formatMeta.durationRange;

    if (estimatedSeconds < min) {
        const estMin = Math.round(estimatedSeconds / 60);
        const minMin = Math.round(min / 60);
        return {
            valid: false,
            estimatedSeconds,
            message: `Script too short: ~${estMin} min estimated, minimum is ${minMin} min for "${formatMeta.name}"`,
        };
    }

    if (estimatedSeconds > max) {
        const estMin = Math.round(estimatedSeconds / 60);
        const maxMin = Math.round(max / 60);
        return {
            valid: false,
            estimatedSeconds,
            message: `Script too long: ~${estMin} min estimated, maximum is ${maxMin} min for "${formatMeta.name}"`,
        };
    }

    return { valid: true, estimatedSeconds };
}

/** Count words across all screenplay scenes (action + dialogue). */
export function countScriptWords(scenes: ScreenplayScene[]): number {
    return scenes.reduce((total, scene) => {
        const actionWords = scene.action.trim().split(/\s+/).filter(Boolean).length;
        const dialogueWords = scene.dialogue.reduce(
            (d, line) => d + line.text.trim().split(/\s+/).filter(Boolean).length,
            0
        );
        return total + actionWords + dialogueWords;
    }, 0);
}

// --- Pure Prompt Builder Functions (exported for testing) ---

/**
 * Build a breakdown prompt for the given topic and format options.
 * Loads the format-specific template and substitutes all variables.
 *
 * Requirements: 12.1, 12.2, 12.6, 19.1, 21.1, 21.3
 *
 * @param topic   - User's idea or topic
 * @param options - Format-aware generation options
 * @returns Fully resolved prompt string ready for the LLM
 */
export function buildBreakdownPrompt(
    topic: string,
    options: FormatAwareGenerationOptions = {}
): string {
    const {
        formatId = 'movie-animation',
        genre = '',
        language,
        researchSummary,
        researchCitations,
        referenceContent,
    } = options;

    // Auto-detect language from topic if not explicitly set
    const detectedLang: 'ar' | 'en' = language ?? (/[\u0600-\u06FF]/.test(topic) ? 'ar' : 'en');

    // Build optional context blocks (empty string when not provided)
    const researchBlock = researchSummary
        ? `\nRESEARCH CONTEXT:\n${researchSummary}` +
          (researchCitations ? `\nCitations: ${researchCitations}` : '') + '\n\n'
        : '';

    const referenceBlock = referenceContent
        ? `\nREFERENCE MATERIAL (treat as primary source):\n${referenceContent}\n\n`
        : '';

    const langInstruction = detectedLang === 'ar'
        ? 'Write your response entirely in Arabic.'
        : 'Write your response in English.';

    // Duration hints from format registry
    const formatMeta = formatRegistry.getFormat(formatId);
    const minDuration = formatMeta ? Math.round(formatMeta.durationRange.min / 60) : 3;
    const maxDuration = formatMeta ? Math.round(formatMeta.durationRange.max / 60) : 10;

    const template = loadTemplate(formatId, 'breakdown');

    return substituteVariables(template, {
        idea: topic,
        genre: genre || 'General',
        language_instruction: langInstruction,
        research: researchBlock,
        references: referenceBlock,
        minDuration: String(minDuration),
        maxDuration: String(maxDuration),
    });
}

/**
 * Build a screenplay prompt from breakdown acts and format options.
 * Loads the format-specific template and substitutes all variables.
 *
 * Requirements: 12.1, 12.2, 12.6, 21.1, 21.3
 *
 * @param breakdownActs - Structured acts from the breakdown phase
 * @param options       - Format-aware generation options
 * @returns Fully resolved prompt string ready for the LLM
 */
export function buildScreenplayPrompt(
    breakdownActs: { title: string; emotionalHook: string; narrativeBeat: string }[],
    options: FormatAwareGenerationOptions = {}
): string {
    const {
        formatId = 'movie-animation',
        genre = '',
        language,
        researchSummary,
        researchCitations,
        referenceContent,
    } = options;

    const breakdownSample = breakdownActs.map(a => a.title + ' ' + a.narrativeBeat).join(' ');
    const detectedLang: 'ar' | 'en' = language ?? detectLanguage(breakdownSample);

    const breakdownText = breakdownActs.map((act, i) =>
        `Act ${i + 1}: ${act.title}\n- Hook: ${act.emotionalHook}\n- Beat: ${act.narrativeBeat}`
    ).join('\n\n');

    const researchBlock = researchSummary
        ? `\nRESEARCH CONTEXT:\n${researchSummary}` +
          (researchCitations ? `\nCitations: ${researchCitations}` : '') + '\n\n'
        : '';

    const referenceBlock = referenceContent
        ? `\nREFERENCE MATERIAL:\n${referenceContent}\n\n`
        : '';

    const langInstruction = detectedLang === 'ar'
        ? 'Write the screenplay in Arabic.'
        : 'Write the screenplay in English.';

    const template = loadTemplate(formatId, 'screenplay');

    return substituteVariables(template, {
        idea: '',
        genre: genre || 'General',
        language_instruction: langInstruction,
        research: researchBlock,
        references: referenceBlock,
        breakdown: breakdownText,
        actCount: String(breakdownActs.length),
    });
}

// --- Pipeline Functions (Discrete LLM Calls) ---

/**
 * Step 1: Generate narrative breakdown from topic
 * Context: Only the topic (minimal)
 */
async function generateBreakdown(
    topic: string,
    formatOptions?: FormatAwareGenerationOptions
): Promise<{ acts: { title: string; emotionalHook: string; narrativeBeat: string }[] }> {
    log.info('Step 1: Generating breakdown from topic');

    const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.7,
    }).withStructuredOutput(BreakdownSchema);

    // Use format-aware template when format options are provided; otherwise use the
    // legacy hardcoded prompt for backward compatibility with non-format-aware callers.
    let prompt: string;
    if (formatOptions?.formatId) {
        prompt = buildBreakdownPrompt(topic, formatOptions);
    } else {
        prompt = `You are a story development expert.

Before writing, silently identify:
- Protagonist and their central desire or goal
- Core conflict they face (internal or external)
- Emotional arc: how does the protagonist change from start to finish?
- One key turning point per act

Then create a narrative breakdown for a short video story about:
"${topic}"

Divide into 3-5 acts. For each act provide:
1. Title - A compelling act title referencing a specific story moment (not generic like "Introduction")
2. Emotional Hook - The dominant emotion the audience should feel in this act (grief, awe, tension, triumph...)
3. Narrative Beat - The specific story event or revelation that drives this act forward (name characters, describe the action)

Keep each field concise (1-2 sentences max). Be specific — avoid vague labels like "conflict begins" or "things get harder".`;
    }

    const result = await model.invoke(prompt);
    log.info(`Breakdown complete: ${result.acts.length} acts`);
    return result;
}

/**
 * Step 2: Generate screenplay from breakdown
 * Context: Only the breakdown (not the original topic)
 */
async function generateScreenplay(
    breakdownActs: { title: string; emotionalHook: string; narrativeBeat: string }[],
    formatOptions?: FormatAwareGenerationOptions
): Promise<ScreenplayScene[]> {
    log.info('Step 2: Generating screenplay from breakdown');

    const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.7,
    }).withStructuredOutput(ScreenplaySchema);

    // Use format-aware template when format options are provided
    let prompt: string;
    if (formatOptions?.formatId) {
        prompt = buildScreenplayPrompt(breakdownActs, formatOptions);
    } else {
        // Legacy hardcoded prompt for backward compatibility
        const breakdownText = breakdownActs.map((act, i) =>
            `Act ${i + 1}: ${act.title}\n- Hook: ${act.emotionalHook}\n- Beat: ${act.narrativeBeat}`
        ).join('\n\n');

        prompt = `Write a short screenplay based on this outline:

${breakdownText}

Create 3-8 scenes. For each scene:
1. Heading - Location/time (e.g., "INT. SPACESHIP - DAY")
2. Action - Visual description of what happens
3. Dialogue - Character lines (if any)

DIALOGUE RULES (CRITICAL — schema will reject violations):
- "speaker" must be the character's NAME ONLY — 1 to 4 words maximum (e.g., "Faisal", "Old Man", "Narrator").
- "speaker" must NEVER contain scene descriptions, emotions, or actions. MAX 30 characters.
- "text" is the spoken/narrated line — it must NEVER be empty.
- If there is no specific speaker, use "Narrator" as the speaker name.
- NEVER put visual descriptions or action text in the "speaker" field.

VALID example:
{"speaker": "Faisal", "text": "What happened to this place?"}

INVALID example (will break the system):
{"speaker": "Faisal walks through the crumbling market, eyes wide with disbelief", "text": ""}

Keep action descriptions vivid but concise.`;
    }

    const result = await model.invoke(prompt);

    // Map to ScreenplayScene format
    const scenes: ScreenplayScene[] = result.scenes.map((s, i) => ({
        id: `scene_${i}`,
        sceneNumber: i + 1,
        heading: s.heading,
        action: s.action,
        dialogue: s.dialogue
            .map(d => {
                // Repair: detect when the LLM put a visual description in the speaker field.
                // A character name is 1-4 words at most. If it's longer, the fields are swapped.
                const speakerWords = d.speaker.trim().split(/\s+/).length;
                const speakerTooLong = speakerWords > 4 || d.speaker.length > 30;

                if (speakerTooLong) {
                    log.warn(`[generateScreenplay] Misaligned speaker field detected ("${d.speaker.substring(0, 50)}...") — recovering as Narrator`);
                    // If text is also empty/short, rescue the description as the spoken text
                    const rescuedText = d.text && d.text.trim().length > 5
                        ? d.text
                        : d.speaker; // fall back to the misplaced content
                    return { speaker: 'Narrator', text: cleanForTTS(rescuedText) };
                }

                return { speaker: d.speaker, text: cleanForTTS(d.text) };
            })
            .filter(d => d.text.trim().length > 0), // drop empty-text entries
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
6. Write in the same language as the original (if Arabic, write Arabic voiceover)

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
 * Step 4: Generate character reference images
 * Context: One character at a time
 */
async function generateCharacterReferences(
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
            // Use the project's visual style for the character reference so it
            // matches the art direction of the scene visuals, while keeping
            // character-sheet-specific composition (front + three-quarter view,
            // neutral background, studio lighting).
            const charGuide = buildImageStyleGuide({
                scene: `Character Design Sheet for "${char.name}"`,
                subjects: [{ type: "person", description: char.visualDescription, pose: "front view and three-quarter view, full body" }],
                style,
                background: "neutral white background",
                lighting: { source: "studio softbox", quality: "soft diffused", direction: "rim light accent" },
                composition: { shot_type: "medium shot", camera_angle: "eye-level", framing: "center framing" },
                avoid: ["blur", "darkness", "noise", "low quality", "text", "watermark"],
            });

            const referenceUrl = await generateImageFromPrompt(
                char.visualDescription,  // fallback text (unused when prebuiltGuide is set)
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
    // Prefer compact facial tags when available; fall back to truncated description
    if (char.facialTags) {
        return `[${char.name}: ${char.facialTags}]`;
    }
    const desc = char.visualDescription || '';
    const words = desc.split(/\s+/);
    const compact = words.slice(0, 20).join(' ');
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

            // Build character subject entries from visual anchors
            const charSubjects = scene.charactersPresent
                .map(charName => {
                    const anchor = charAnchorMap.get(charName.toLowerCase());
                    return anchor ? { type: "person" as const, description: anchor } : null;
                })
                .filter((s): s is { type: "person"; description: string } => s !== null);

            // Build structured style guide for the scene
            const sceneGuide = buildImageStyleGuide({
                scene: scene.action,
                subjects: charSubjects.length > 0 ? charSubjects : undefined,
                mood: emotionalVibe,
                style,
                background: scene.heading,
            });

            const imageUrl = await generateImageFromPrompt(
                scene.action,    // fallback text (unused when prebuiltGuide is set)
                style,
                "",
                "16:9",
                true,            // skipRefine — guide is already complete
                undefined,
                sessionId,
                i,
                sceneGuide,      // prebuiltGuide — avoids double-wrapping
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

        // Step 4: Generate scene visuals (art step — establishes the visual style)
        // Bridge: carry emotional hooks from breakdown acts to visual generation
        const emotionalHooks = breakdown.acts.map(a => a.emotionalHook);

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
