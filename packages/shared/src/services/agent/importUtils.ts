/**
 * Import Utilities - Pure functions for content import
 * 
 * This module contains pure functions that can be tested without API dependencies.
 * Used by importTools.ts for the actual tool implementations.
 * 
 * Requirements: 1.1, 1.2, 1.3
 */

import { SubtitleItem } from "../../types";

// --- Types ---

/**
 * Imported content from YouTube or audio file
 */
export interface ImportedContent {
  /** Source type */
  source: "youtube" | "audio_file";
  /** Original URL for YouTube imports */
  sourceUrl?: string;
  /** Audio blob (stored as base64 for serialization) */
  audioBase64?: string;
  /** Audio MIME type */
  audioMimeType?: string;
  /** Transcription result */
  transcript: TranscriptResult;
  /** Audio duration in seconds */
  duration: number;
  /** Optional metadata */
  metadata?: {
    title?: string;
    author?: string;
  };
}

/**
 * Transcription result with segments
 */
export interface TranscriptResult {
  /** Full text of the transcript */
  text: string;
  /** Segments with timing */
  segments: TranscriptSegment[];
  /** Detected or specified language */
  language: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * A segment of the transcript with timing
 */
export interface TranscriptSegment {
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** Text content */
  text: string;
  /** Optional word-level timing */
  words?: WordTimingInfo[];
}

/**
 * Word-level timing information
 */
export interface WordTimingInfo {
  word: string;
  start: number;
  end: number;
}

// --- Supported Formats ---

export const SUPPORTED_AUDIO_FORMATS = ["mp3", "wav", "m4a", "ogg", "webm", "flac", "aac"];
export const SUPPORTED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "audio/aac",
];

// --- Import Store ---

/**
 * Store for imported content (keyed by session ID)
 * This is shared with productionAgent's productionStore
 */
const importStore: Map<string, ImportedContent> = new Map();

/**
 * Get imported content by session ID
 */
export function getImportedContent(sessionId: string): ImportedContent | undefined {
  return importStore.get(sessionId);
}

/**
 * Store imported content
 */
export function setImportedContent(sessionId: string, content: ImportedContent): void {
  importStore.set(sessionId, content);
}

/**
 * Clear imported content
 */
export function clearImportedContent(sessionId: string): void {
  importStore.delete(sessionId);
}

// --- URL Validation ---

/**
 * Validate if a URL is a valid YouTube or X (Twitter) URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const validHosts = [
      "youtube.com",
      "www.youtube.com",
      "youtu.be",
      "m.youtube.com",
      "twitter.com",
      "www.twitter.com",
      "x.com",
      "www.x.com",
    ];
    return validHosts.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/**
 * Extract video ID from YouTube URL for metadata
 */
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    
    // youtu.be/VIDEO_ID
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1);
    }
    
    // youtube.com/watch?v=VIDEO_ID
    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v");
    }
    
    return null;
  } catch {
    return null;
  }
}

// --- Conversion Functions ---

/**
 * Convert SubtitleItem array to TranscriptResult
 * 
 * This is the core conversion function that transforms subtitle items
 * (from transcription) into the transcript format used by the import system.
 */
export function subtitleItemsToTranscriptResult(
  items: SubtitleItem[],
  language: string = "auto"
): TranscriptResult {
  const segments: TranscriptSegment[] = items.map(item => ({
    start: item.startTime,
    end: item.endTime,
    text: item.text,
    words: item.words?.map(w => ({
      word: w.word,
      start: w.startTime,
      end: w.endTime,
    })),
  }));

  const fullText = items.map(item => item.text).join(" ");

  return {
    text: fullText,
    segments,
    language,
    confidence: 0.9, // Gemini transcription is generally high quality
  };
}

/**
 * Get server base URL for API calls
 */
export function getServerBaseUrl(): string {
  // Check for browser environment
  if (typeof window !== "undefined") {
    // In browser, use relative URL or configured server
    // @ts-ignore - Vite injects env at build time
    return (import.meta as any).env?.VITE_SERVER_URL || "http://localhost:3001";
  }
  // In Node.js, use environment variable or default
  return process.env.SERVER_URL || "http://localhost:3001";
}
