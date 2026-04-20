/**
 * Brief Enrichment — one LLM call that fills missing ProductionBrief fields
 * before any expensive generation (research, script, visuals) runs.
 *
 * Input:  UserIntent (what the user typed) + FormatConfig (static per-format)
 * Output: inferred audience/tone + draft characters + emotional arc
 *
 * The output is shown to the user at the "Brief Approval" checkpoint — they
 * confirm or tweak before the pipeline spends Gemini tokens on scene generation.
 * This is the highest-leverage 10 seconds in the whole flow: one cheap Flash
 * call saves 10x on rejected expensive scene generations.
 */

import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GEMINI_API_KEY, MODELS } from "../shared/apiClient";
import { agentLogger } from "../infrastructure/logger";
import type {
    ProductionBrief,
    UserIntent,
    Character,
    ArcBeat,
    NarrativeContext,
} from "./productionBrief";
import type { FormatConfig } from "../pipelines/BasePipeline";
import type { SessionIdentity } from "./productionBrief";

const log = agentLogger.child("BriefEnrichment");

// ============================================================================
// Schema — what the LLM returns (strict shape, validated by Zod)
// ============================================================================

const CharacterSchema = z.object({
    role: z.string().describe(
        "Stable role identifier: 'narrator', 'protagonist', 'antagonist', 'interviewee', 'host', or 'supporting'. Use role labels, not names.",
    ),
    displayName: z.string().describe("How the character is referred to in dialogue."),
    visualDesc: z.string().describe(
        "1-2 sentence visual description for image generation. Include appearance, wardrobe, distinguishing features. Must be specific enough that every scene's image generator produces the same person.",
    ),
    personality: z.string().describe(
        "Short personality/delivery cue for TTS director note (e.g. 'weary but determined, speaks in measured tones').",
    ),
});

const ArcBeatSchema = z.object({
    actIndex: z.number().int().min(0),
    emotionalTone: z.string().describe(
        "One phrase describing the emotional state this beat must land (e.g. 'tense anticipation', 'cathartic release').",
    ),
    keyInfo: z.string().describe("The single fact or feeling this beat must deliver."),
    priorBeat: z.string().optional().describe(
        "One sentence recapping the prior beat, so scene generation maintains continuity.",
    ),
});

const EnrichmentResultSchema = z.object({
    inferredAudience: z.string().describe(
        "Best guess at the target audience if the user did not specify one (e.g. 'curious adults interested in history').",
    ),
    inferredTone: z.string().describe(
        "Overall tonal register of the piece (e.g. 'authoritative and reverent', 'playful and irreverent').",
    ),
    characters: z.array(CharacterSchema).min(1).max(5).describe(
        "The characters or voices present. For single-narrator formats (documentary, educational), return one narrator. For dialogue-heavy formats, return 2-3 speakers with distinct roles.",
    ),
    arc: z.array(ArcBeatSchema).min(2).max(8).describe(
        "Emotional arc broken into beats. Each beat's priorBeat references the previous — this is what fixes scene-to-scene tonal whiplash.",
    ),
});

type EnrichmentResult = z.infer<typeof EnrichmentResultSchema>;

// ============================================================================
// Prompt builder
// ============================================================================

function buildEnrichmentPrompt(intent: UserIntent, format: FormatConfig): string {
    const parts: string[] = [];

    parts.push(
        `You are a production designer preparing a brief for a ${format.formatId} video.`,
        `Your job is to infer the narrative scaffolding the downstream AI pipeline will use for every scene, image, and narration call.`,
        ``,
        `## The user's idea`,
        intent.idea,
        ``,
        `## Format constraints`,
        `- Video purpose: ${format.videoPurpose}`,
        `- Visual style: ${format.visualStyle}`,
        `- Default mood: ${format.defaultMood}`,
        `- Aspect ratio: ${format.aspectRatio}`,
        `- Emotional tone baseline: ${format.emotionalTone}`,
    );

    if (intent.genre) parts.push(`- Genre: ${intent.genre}`);
    if (intent.targetDurationSec) parts.push(`- Target duration: ${intent.targetDurationSec}s`);
    if (intent.language) parts.push(`- Language: ${intent.language}`);

    if (intent.targetAudience) {
        parts.push(``, `## User-specified audience`, intent.targetAudience);
    }

    if (intent.brand?.voiceTone || intent.brand?.name) {
        parts.push(``, `## Brand voice`);
        if (intent.brand.name) parts.push(`- Brand: ${intent.brand.name}`);
        if (intent.brand.voiceTone) parts.push(`- Voice tone: ${intent.brand.voiceTone}`);
    }

    parts.push(
        ``,
        `## Your task`,
        `1. Infer the target audience (or restate if user gave one).`,
        `2. Infer the overall tonal register.`,
        `3. Draft the characters or voices. CRITICAL: key them by stable ROLE ('narrator', 'protagonist', 'interviewee', etc.), not name — names drift across scenes but roles don't. For each, give a visual description specific enough that a downstream image generator produces the SAME person every time.`,
        `4. Break the piece into 2-8 arc beats. Each beat has an emotional tone and a keyInfo. Fill priorBeat for every beat after the first — this is how scene generation maintains continuity.`,
        ``,
        `Be concrete. Vague briefs produce vague output.`,
    );

    return parts.join("\n");
}

// ============================================================================
// Public API
// ============================================================================

export interface EnrichBriefOptions {
    /** Override the model (for tests) */
    model?: string;
    /** Temperature — default 0.4 (lower than script gen, higher than extraction) */
    temperature?: number;
}

/**
 * Run the enrichment LLM call and return a fully-populated ProductionBrief.
 * The returned brief has narrative + inferred fields set. Research is left
 * undefined — populated later by the research phase if the format needs it.
 */
export async function enrichBrief(
    intent: UserIntent,
    session: SessionIdentity,
    format: FormatConfig,
    options?: EnrichBriefOptions,
): Promise<ProductionBrief> {
    log.info(`Enriching brief for ${format.formatId}: "${intent.idea.slice(0, 60)}..."`);

    const model = new ChatGoogleGenerativeAI({
        model: options?.model ?? MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: options?.temperature ?? 0.4,
    });

    const prompt = buildEnrichmentPrompt(intent, format);
    const result = await model.withStructuredOutput(EnrichmentResultSchema).invoke(prompt);

    const typed = result as EnrichmentResult;

    const narrative: NarrativeContext = {
        characters: typed.characters as Character[],
        arc: typed.arc as ArcBeat[],
    };

    const brief: ProductionBrief = {
        intent,
        session,
        format,
        narrative,
        inferred: {
            audience: intent.targetAudience ?? typed.inferredAudience,
            tone: typed.inferredTone,
        },
    };

    log.info(
        `Enriched brief: ${narrative.characters.length} characters, ${narrative.arc.length} beats, tone="${typed.inferredTone}"`,
    );

    return brief;
}

/**
 * Merge user edits from the Brief Approval checkpoint back into the brief.
 * Shallow merge on top-level fields; deep on narrative.
 */
export function applyBriefEdits(
    brief: ProductionBrief,
    edits: Partial<Pick<ProductionBrief, "narrative" | "inferred">> & {
        intent?: Partial<UserIntent>;
    },
): ProductionBrief {
    return {
        ...brief,
        intent: edits.intent ? { ...brief.intent, ...edits.intent } : brief.intent,
        narrative: edits.narrative ?? brief.narrative,
        inferred: edits.inferred ? { ...brief.inferred, ...edits.inferred } : brief.inferred,
    };
}
