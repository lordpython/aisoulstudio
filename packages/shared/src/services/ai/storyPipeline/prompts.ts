/**
 * Story Pipeline — Duration helpers and prompt builder functions
 */

import { formatRegistry } from "../../format/formatRegistry";
import { loadTemplate, substituteVariables } from "../../prompt/templateLoader";
import { detectLanguage } from "../../content/languageDetector";
import type { ScreenplayScene, FormatMetadata, FormatAwareGenerationOptions } from "./schemas";

export type { FormatAwareGenerationOptions };

/** Estimated narration speech rate (words per second) — ~140 wpm */
export const WORDS_PER_SECOND = 140 / 60;

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
        targetDurationSeconds,
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

    // Duration: use user-selected target if provided, otherwise fall back to format registry
    const formatMeta = formatRegistry.getFormat(formatId);
    let minDuration: number;
    let maxDuration: number;
    if (targetDurationSeconds) {
        // User picked an explicit duration — clamp to ±15 s so LLM understands range
        const targetMins = targetDurationSeconds / 60;
        minDuration = Math.max(0.25, Math.round((targetMins - 0.25) * 4) / 4);
        maxDuration = Math.round((targetMins + 0.25) * 4) / 4;
    } else {
        minDuration = formatMeta ? Math.round(formatMeta.durationRange.min / 60) : 3;
        maxDuration = formatMeta ? Math.round(formatMeta.durationRange.max / 60) : 10;
    }

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
        targetDurationSeconds,
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

    // Build duration guidance so the LLM sizes the screenplay appropriately
    let durationGuidance = '';
    if (targetDurationSeconds) {
        const targetMins = targetDurationSeconds / 60;
        const minMins = Math.max(0.25, Math.round((targetMins - 0.25) * 4) / 4);
        const maxMins = Math.round((targetMins + 0.25) * 4) / 4;
        durationGuidance = `\nTarget duration: ${minMins}-${maxMins} minutes. Size each scene's action and dialogue to fit this total length.\n`;
    }

    const template = loadTemplate(formatId, 'screenplay');

    const base = substituteVariables(template, {
        idea: '',
        genre: genre || 'General',
        language_instruction: langInstruction,
        research: researchBlock,
        references: referenceBlock,
        breakdown: breakdownText,
        actCount: String(breakdownActs.length),
    });

    return durationGuidance ? base + durationGuidance : base;
}
