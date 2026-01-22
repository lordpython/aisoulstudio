/**
 * Subtitle Tools - LangChain tools for subtitle generation
 * 
 * Provides tools for generating subtitles from narration:
 * - generate_subtitles: Create SRT-formatted captions from narration transcripts
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { splitTextIntoSegments } from "../subtitleService";
import { SubtitleItem } from "../../types";
import { subtitlesToSRT } from "../../utils/srtParser";
import { productionStore } from "../ai/productionAgent";

// --- Types ---

/**
 * Result of subtitle generation operation
 */
export interface SubtitleResult {
  /** Subtitle format (srt or vtt) */
  format: "srt" | "vtt";
  /** Generated subtitle content as string */
  content: string;
  /** Language code */
  language: string;
  /** Number of subtitle segments */
  segmentCount: number;
  /** Whether the language is RTL (Arabic, Hebrew) */
  isRTL: boolean;
  /** Parsed subtitle items for programmatic access */
  items: SubtitleItem[];
}

/**
 * Narration segment input for subtitle generation
 */
export interface NarrationInput {
  /** Scene ID this narration belongs to */
  sceneId: string;
  /** Transcript text */
  transcript: string;
  /** Start time in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;
}

/**
 * Session storage for subtitle results
 */
const subtitleStore = new Map<string, SubtitleResult>();

/**
 * Get subtitle result for a session
 */
export function getSubtitles(sessionId: string): SubtitleResult | undefined {
  return subtitleStore.get(sessionId);
}

/**
 * Store subtitle result for a session
 */
export function setSubtitles(sessionId: string, result: SubtitleResult): void {
  subtitleStore.set(sessionId, result);
}

/**
 * Clear subtitles for a session
 */
export function clearSubtitles(sessionId: string): boolean {
  return subtitleStore.delete(sessionId);
}

// --- RTL Language Support ---

/**
 * RTL language codes
 */
const RTL_LANGUAGES = ["ar", "he", "fa", "ur", "yi", "ara", "heb", "fas", "urd"];

/**
 * Check if a language code is RTL
 */
export function isRTLLanguage(language: string): boolean {
  const normalizedLang = language.toLowerCase().trim();
  return RTL_LANGUAGES.some(rtl =>
    normalizedLang === rtl ||
    normalizedLang.startsWith(`${rtl}-`) ||
    normalizedLang.startsWith(`${rtl}_`)
  );
}

/**
 * Unicode RTL markers
 */
const RLM = "\u200F"; // Right-to-Left Mark
const LRM = "\u200E"; // Left-to-Right Mark
const RLE = "\u202B"; // Right-to-Left Embedding
const PDF = "\u202C"; // Pop Directional Formatting

/**
 * Add RTL direction markers to text
 */
export function addRTLMarkers(text: string): string {
  // Wrap text with RTL embedding markers
  return `${RLE}${RLM}${text}${PDF}`;
}

// --- Tool Schema ---

/**
 * Schema for generate_subtitles tool
 */
const GenerateSubtitlesSchema = z.object({
  contentPlanId: z.string().describe("Session ID containing the content plan and narration"),
  language: z.string().default("en").describe("Language code for subtitles (e.g., 'en', 'ar', 'he'). Default is 'en'."),
  format: z.enum(["srt", "vtt"]).default("srt").describe("Output format: 'srt' (SubRip) or 'vtt' (WebVTT). Default is 'srt'."),
  narrationSegments: z.array(z.object({
    sceneId: z.string().describe("Scene ID"),
    transcript: z.string().describe("Narration transcript text"),
    startTime: z.number().describe("Start time in seconds"),
    duration: z.number().describe("Duration in seconds"),
  })).optional().describe("Optional array of narration segments. If not provided, will be auto-fetched from session."),
  maxWordsPerSegment: z.number().min(1).max(20).default(8).describe("Maximum words per subtitle segment (default 8)"),
});

// --- Helper Functions ---

/**
 * Convert seconds to SRT timestamp format (HH:MM:SS,mmm)
 */
function formatSRTTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Convert seconds to VTT timestamp format (HH:MM:SS.mmm)
 */
function formatVTTTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Generate SRT content from subtitle items
 */
function generateSRTContent(items: SubtitleItem[], isRTL: boolean): string {
  return items.map((item, index) => {
    const id = item.id || index + 1;
    const start = formatSRTTimestamp(item.startTime);
    const end = formatSRTTimestamp(item.endTime);
    const text = isRTL ? addRTLMarkers(item.text) : item.text;
    return `${id}\n${start} --> ${end}\n${text}`;
  }).join('\n\n');
}

/**
 * Generate VTT content from subtitle items
 */
function generateVTTContent(items: SubtitleItem[], isRTL: boolean): string {
  const header = "WEBVTT\n\n";
  const cues = items.map((item, index) => {
    const id = item.id || index + 1;
    const start = formatVTTTimestamp(item.startTime);
    const end = formatVTTTimestamp(item.endTime);
    const text = isRTL ? addRTLMarkers(item.text) : item.text;
    return `${id}\n${start} --> ${end}\n${text}`;
  }).join('\n\n');

  return header + cues;
}

/**
 * Process narration segments into subtitle items with word-level timing
 * 
 * Enhanced to include word-level timing data for karaoke-style highlighting.
 * Each subtitle segment now includes a `words` array with precise timing
 * for each word, enabling smooth word-by-word reveal animations.
 */
export function processNarrationToSubtitles(
  narrationSegments: NarrationInput[],
  maxWordsPerSegment: number = 8
): SubtitleItem[] {
  const allSubtitles: SubtitleItem[] = [];
  let subtitleId = 1;

  for (const segment of narrationSegments) {
    // Use splitTextIntoSegments to break up the transcript
    const textSegments = splitTextIntoSegments(
      segment.transcript,
      segment.duration,
      { maxWordsPerSegment }
    );

    // Calculate timing for each text segment
    let currentTime = segment.startTime;

    for (const textSeg of textSegments) {
      const segmentText = textSeg.text.trim();
      const segmentDuration = textSeg.duration;

      // Calculate word-level timing for karaoke highlighting
      const words = segmentText.split(/\s+/).filter(w => w.length > 0);
      const wordCount = words.length;

      // Distribute time evenly across words (with slight adjustment for natural pacing)
      // Average speaking rate: ~150 words/min = 0.4s per word, but adjust based on actual duration
      const timePerWord = wordCount > 0 ? segmentDuration / wordCount : segmentDuration;

      let wordTime = currentTime;
      const wordTimings: { word: string; startTime: number; endTime: number }[] = [];

      for (let i = 0; i < wordCount; i++) {
        const wordDuration = timePerWord;
        wordTimings.push({
          word: words[i],
          startTime: wordTime,
          endTime: wordTime + wordDuration,
        });
        wordTime += wordDuration;
      }

      const subtitleItem: SubtitleItem = {
        id: subtitleId++,
        startTime: currentTime,
        endTime: currentTime + segmentDuration,
        text: segmentText,
        words: wordTimings, // Add word-level timing for karaoke highlighting
      };

      allSubtitles.push(subtitleItem);
      currentTime += segmentDuration;
    }
  }

  return allSubtitles;
}

// --- Tool Implementation ---

/**
 * Generate Subtitles Tool
 * 
 * Creates SRT or VTT formatted subtitles from narration transcripts.
 * Supports RTL languages with proper direction markers.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
export const generateSubtitlesTool = tool(
  async ({
    contentPlanId,
    language = "en",
    format = "srt",
    narrationSegments,
    maxWordsPerSegment = 8,
  }) => {
    console.log(`[SubtitleTools] Generating subtitles for session: ${contentPlanId}`);
    console.log(`[SubtitleTools] Language: ${language}, Format: ${format}, Max words: ${maxWordsPerSegment}`);

    // Auto-fetch narration segments from session if not provided
    let finalNarrationSegments = narrationSegments;
    if (!finalNarrationSegments || finalNarrationSegments.length === 0) {
      const state = productionStore.get(contentPlanId);
      if (!state || !state.narrationSegments || state.narrationSegments.length === 0) {
        return JSON.stringify({
          success: false,
          error: "No narration segments found in session and none provided",
          suggestion: "Run narrate_scenes first to generate narration",
        });
      }

      // Build narration input array from session state
      let currentTime = 0;
      finalNarrationSegments = state.narrationSegments.map((segment, index) => {
        const scene = state.contentPlan?.scenes[index];
        const result = {
          sceneId: segment.sceneId,
          transcript: segment.transcript,
          startTime: currentTime,
          duration: segment.audioDuration,
        };
        currentTime += segment.audioDuration;
        return result;
      });
      console.log(`[SubtitleTools] Auto-fetched ${finalNarrationSegments.length} narration segments from session`);
    }

    // Validate each segment has required fields
    for (let i = 0; i < finalNarrationSegments.length; i++) {
      const seg = finalNarrationSegments[i];
      if (!seg.transcript || seg.transcript.trim().length === 0) {
        return JSON.stringify({
          success: false,
          error: `Narration segment ${i + 1} has empty transcript`,
          suggestion: "Ensure all narration segments have non-empty transcript text",
        });
      }
      if (typeof seg.startTime !== 'number' || seg.startTime < 0) {
        return JSON.stringify({
          success: false,
          error: `Narration segment ${i + 1} has invalid startTime`,
          suggestion: "Ensure all narration segments have a valid startTime >= 0",
        });
      }
      if (typeof seg.duration !== 'number' || seg.duration <= 0) {
        return JSON.stringify({
          success: false,
          error: `Narration segment ${i + 1} has invalid duration`,
          suggestion: "Ensure all narration segments have a valid duration > 0",
        });
      }
    }

    try {
      // Check if language is RTL
      const isRTL = isRTLLanguage(language);
      console.log(`[SubtitleTools] RTL language: ${isRTL}`);

      // Process narration into subtitle items
      const subtitleItems = processNarrationToSubtitles(
        finalNarrationSegments,
        maxWordsPerSegment
      );

      if (subtitleItems.length === 0) {
        return JSON.stringify({
          success: false,
          error: "No subtitle segments generated",
          suggestion: "Check that narration segments contain valid text content",
        });
      }

      // Generate content in requested format
      let content: string;
      if (format === "vtt") {
        content = generateVTTContent(subtitleItems, isRTL);
      } else {
        content = generateSRTContent(subtitleItems, isRTL);
      }

      // Calculate total duration
      const lastItem = subtitleItems[subtitleItems.length - 1];
      const totalDuration = lastItem.endTime;

      // Create result object
      const result: SubtitleResult = {
        format,
        content,
        language,
        segmentCount: subtitleItems.length,
        isRTL,
        items: subtitleItems,
      };

      // Store the result
      setSubtitles(contentPlanId, result);

      return JSON.stringify({
        success: true,
        sessionId: contentPlanId,
        format,
        language,
        segmentCount: subtitleItems.length,
        isRTL,
        totalDuration: Math.round(totalDuration * 100) / 100,
        contentLength: content.length,
        preview: content.substring(0, 300) + (content.length > 300 ? "..." : ""),
        message: `Successfully generated ${subtitleItems.length} subtitle segments in ${format.toUpperCase()} format`,
      });

    } catch (error) {
      console.error("[SubtitleTools] Generation error:", error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      return JSON.stringify({
        success: false,
        error: errorMessage,
        suggestion: "Check that narration segments are properly formatted with valid timing",
      });
    }
  },
  {
    name: "generate_subtitles",
    description: "Generate SRT or VTT formatted subtitles from narration transcripts. Narration segments are automatically fetched from session - you only need to provide contentPlanId. Optionally specify language (default 'en'), format (default 'srt'), or maxWordsPerSegment (default 8). Supports RTL languages (Arabic, Hebrew) with proper direction markers.",
    schema: GenerateSubtitlesSchema,
  }
);

// --- Export all subtitle tools ---

export const subtitleTools = [
  generateSubtitlesTool,
];
