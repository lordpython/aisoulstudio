/**
 * ProductionBrief — Single source of truth carried through every pipeline phase.
 *
 * Replaces the overlapping PipelineRequest / FormatAwareGenerationOptions /
 * hookData:Record<string,unknown> shapes with one typed object composed of
 * six focused sub-types. Pipelines thread this brief into prompt builders,
 * image generation, and TTS so every generation call receives the same
 * structured context.
 *
 * Design principles:
 *   1. Tiny user-facing surface (UserIntent has 4 required fields).
 *   2. AI auto-fills the rest in a "brief enrichment" phase before expensive work.
 *   3. Characters keyed by ROLE, not name — roles are stable under LLM drift.
 *   4. Research is structured (citations + keyFacts), not blob text.
 */

import type { VideoFormat } from "../../types";
import type { LanguageCode } from "../../constants";
import type { IndexedDocument } from "../content/researchService";
import type { TTSVoice } from "../media/narratorService";
import type { FormatConfig } from "../pipelines/BasePipeline";

// ============================================================================
// 1. User intent — what the user explicitly asked for
// ============================================================================

export interface UserIntent {
    /** The user's core idea — required */
    idea: string;
    /** Which pipeline to run — required */
    formatId: VideoFormat;
    /** Output language — required */
    language: LanguageCode;
    /** Genre modifier (e.g. "Drama", "Comedy") */
    genre?: string;
    /** User-selected target duration — overrides format-registry defaults */
    targetDurationSec?: number;
    /** Who the video is for (e.g. "Gen Z creators", "medical professionals") */
    targetAudience?: string;
    /** Brand voice + visual identity — plumbs into TTS director note + image style */
    brand?: BrandProfile;
    /** Reference material the AI should treat as primary source */
    references?: ReferenceMaterial;
}

export interface BrandProfile {
    name?: string;
    /** Short tone descriptor (e.g. "warm corporate", "irreverent punk") */
    voiceTone?: string;
    /** Hex colors for visual style guide */
    palette?: string[];
}

export interface ReferenceMaterial {
    documents?: IndexedDocument[];
    /** URLs or data URIs of reference images that define visual style */
    images?: string[];
    /** URLs the AI should research */
    links?: string[];
}

// ============================================================================
// 2. Session identity
// ============================================================================

export interface SessionIdentity {
    sessionId: string;
    userId: string;
    projectId: string;
}

// ============================================================================
// 3. Research context — populated after research phase (optional per format)
// ============================================================================

export interface ResearchContext {
    summary?: string;
    citations?: Array<{ title: string; url: string }>;
    /** AI-extracted bullet facts the pipeline can cite inline */
    keyFacts?: string[];
    /** Raw reference content carried forward as primary source */
    primarySource?: string;
}

// ============================================================================
// 4. Narrative context — the big unlock. Populated by brief enrichment
//    before breakdown, so every scene/image/TTS call sees the same characters
//    and emotional arc.
// ============================================================================

export interface Character {
    /** Stable identity under LLM drift — map to CHARACTER_VOICE_MAP in voiceConfig */
    role: CharacterRole;
    /** How the character is referred to in dialogue */
    displayName: string;
    /** Plumbed to imageService for consistent visual continuity across scenes */
    visualDesc: string;
    /** Plumbed to narratorService — if omitted, role maps via CHARACTER_VOICE_MAP */
    voice?: TTSVoice;
    /** Plumbed into the TTS director note ("Speak as a weary detective...") */
    personality?: string;
}

export type CharacterRole =
    | "narrator"
    | "protagonist"
    | "antagonist"
    | "interviewee"
    | "supporting"
    | "host"
    | string; // open for per-format additions

export interface ArcBeat {
    actIndex: number;
    /** Tone this beat must land (e.g. "tense anticipation", "cathartic release") */
    emotionalTone: string;
    /** What happened in the prior beat — fixes scene-to-scene tonal whiplash */
    priorBeat?: string;
    /** The single fact or feeling this beat must deliver */
    keyInfo?: string;
}

export interface NarrativeContext {
    characters: Character[];
    arc: ArcBeat[];
}

// ============================================================================
// 5. Assembly hints — format-level timing cues consumed by visuals + narration
// ============================================================================

export interface AssemblyHints {
    /** When and what to say for a call-to-action (shorts, ads) */
    ctaTiming?: { atSecond: number; text: string };
    /** Chapter markers for long-form content (documentary, educational) */
    chapterMarkers?: Array<{ atSecond: number; title: string }>;
    /** High-level beats the narration pacing should align to */
    keyBeats?: Array<{ actIndex: number; purpose: string }>;
}

// ============================================================================
// 6. The Brief — top-level composition carried through the pipeline
// ============================================================================

export interface ProductionBrief {
    intent: UserIntent;
    session: SessionIdentity;
    format: FormatConfig;
    /** Populated after research phase (if format requires it) */
    research?: ResearchContext;
    /** Populated by brief enrichment — CRITICAL: downstream generation depends on this */
    narrative?: NarrativeContext;
    /** Populated by brief enrichment or assembly phase */
    assembly?: AssemblyHints;
    /**
     * AI-inferred fields when user left them blank. UI should show these at
     * the Brief Approval checkpoint so the user can confirm or override.
     */
    inferred?: {
        audience?: string;
        tone?: string;
    };
}

// ============================================================================
// Helpers
// ============================================================================

export function hasNarrative(brief: ProductionBrief): brief is ProductionBrief & { narrative: NarrativeContext } {
    return !!brief.narrative && brief.narrative.characters.length > 0;
}

export function findCharacter(brief: ProductionBrief, role: CharacterRole): Character | undefined {
    return brief.narrative?.characters.find(c => c.role === role);
}

export function getPriorBeat(brief: ProductionBrief, actIndex: number): string | undefined {
    return brief.narrative?.arc.find(b => b.actIndex === actIndex)?.priorBeat;
}
