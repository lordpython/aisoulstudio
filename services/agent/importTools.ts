/**
 * Import Tools - LangChain tools for content import
 * 
 * Provides tools for importing content from external sources:
 * - YouTube video import (audio extraction + transcription)
 * - Audio file transcription
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { transcribeAudioWithWordTiming } from "../transcriptionService";
import {
  ImportedContent,
  TranscriptResult,
  TranscriptSegment,
  WordTimingInfo,
  SUPPORTED_AUDIO_FORMATS,
  getImportedContent,
  setImportedContent,
  isValidYouTubeUrl,
  extractYouTubeVideoId,
  subtitleItemsToTranscriptResult,
  getServerBaseUrl,
} from "./importUtils";

// Re-export types and utilities for external use
export type {
  ImportedContent,
  TranscriptResult,
  TranscriptSegment,
  WordTimingInfo,
} from "./importUtils";

export {
  getImportedContent,
  setImportedContent,
  clearImportedContent,
  subtitleItemsToTranscriptResult,
  isValidYouTubeUrl,
  extractYouTubeVideoId,
  SUPPORTED_AUDIO_FORMATS,
  SUPPORTED_MIME_TYPES,
} from "./importUtils";

// --- Tool Schemas ---

/**
 * Schema for YouTube import tool
 */
const ImportYouTubeSchema = z.object({
  url: z.string().describe("YouTube or X (Twitter) video URL to import audio from"),
});

/**
 * Schema for audio transcription tool
 */
const TranscribeAudioSchema = z.object({
  contentPlanId: z.string().describe("Session ID where audio is stored"),
  language: z.string().optional().describe("Language code for transcription (e.g., 'en', 'ar'). Auto-detected if omitted."),
});

// --- Tool Implementations ---

/**
 * YouTube Import Tool
 * 
 * Downloads audio from YouTube/X videos and prepares for transcription.
 * Requirements: 1.1, 1.4
 */
export const importYouTubeTool = tool(
  async ({ url }) => {
    console.log(`[ImportTools] Importing from YouTube: ${url}`);

    // Validate URL
    if (!isValidYouTubeUrl(url)) {
      return JSON.stringify({
        success: false,
        error: "Invalid YouTube/X URL. Please provide a valid YouTube (youtube.com, youtu.be) or X (twitter.com, x.com) video URL.",
        suggestion: "Example valid URLs: https://youtube.com/watch?v=VIDEO_ID, https://youtu.be/VIDEO_ID",
      });
    }

    try {
      const serverUrl = getServerBaseUrl();
      const response = await fetch(`${serverUrl}/api/import/youtube`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        return JSON.stringify({
          success: false,
          error: errorData.error || `Failed to import from YouTube (HTTP ${response.status})`,
          suggestion: "Check if the video is available and not private/age-restricted.",
        });
      }

      // Get the audio blob
      const audioBlob = await response.blob();
      
      if (audioBlob.size === 0) {
        return JSON.stringify({
          success: false,
          error: "Downloaded audio is empty",
          suggestion: "The video may not have audio or the download failed.",
        });
      }

      // Convert to base64 for storage
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      // Generate session ID
      const sessionId = `import_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const videoId = extractYouTubeVideoId(url);

      // Now transcribe the audio
      console.log(`[ImportTools] Transcribing imported audio...`);
      const subtitleItems = await transcribeAudioWithWordTiming(base64Audio, "audio/mpeg");

      // Convert to transcript result
      const transcript = subtitleItemsToTranscriptResult(subtitleItems, "auto");

      // Calculate duration from transcript
      const duration = subtitleItems.length > 0 
        ? subtitleItems[subtitleItems.length - 1].endTime 
        : 0;

      // Store the imported content
      const importedContent: ImportedContent = {
        source: "youtube",
        sourceUrl: url,
        audioBase64: base64Audio,
        audioMimeType: "audio/mpeg",
        transcript,
        duration,
        metadata: {
          title: videoId ? `YouTube Video ${videoId}` : undefined,
        },
      };

      setImportedContent(sessionId, importedContent);

      return JSON.stringify({
        success: true,
        sessionId,
        source: "youtube",
        sourceUrl: url,
        duration,
        transcriptSegments: transcript.segments.length,
        transcriptPreview: transcript.text.substring(0, 200) + (transcript.text.length > 200 ? "..." : ""),
        message: `Successfully imported audio from YouTube (${Math.round(duration)}s, ${transcript.segments.length} segments)`,
      });

    } catch (error) {
      console.error("[ImportTools] YouTube import error:", error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        suggestion: "Check your network connection and try again. If the problem persists, the video may be unavailable.",
      });
    }
  },
  {
    name: "import_youtube_content",
    description: "Import audio from a YouTube or X (Twitter) video URL. Extracts audio and transcribes it with word-level timing. Returns a sessionId for use with other tools.",
    schema: ImportYouTubeSchema,
  }
);

/**
 * Audio Transcription Tool
 * 
 * Transcribes audio with word-level timing.
 * Requirements: 1.2, 1.3, 1.5
 */
export const transcribeAudioTool = tool(
  async ({ contentPlanId, language }) => {
    console.log(`[ImportTools] Transcribing audio for session: ${contentPlanId}`);

    // Check if we have imported content
    const importedContent = getImportedContent(contentPlanId);
    
    if (!importedContent) {
      return JSON.stringify({
        success: false,
        error: "No imported content found for this session. Import content first using import_youtube_content.",
      });
    }

    if (!importedContent.audioBase64 || !importedContent.audioMimeType) {
      return JSON.stringify({
        success: false,
        error: "No audio data available in the imported content.",
      });
    }

    // Check if already transcribed
    if (importedContent.transcript && importedContent.transcript.segments.length > 0) {
      return JSON.stringify({
        success: true,
        sessionId: contentPlanId,
        segmentCount: importedContent.transcript.segments.length,
        language: importedContent.transcript.language,
        duration: importedContent.duration,
        transcriptPreview: importedContent.transcript.text.substring(0, 200) + 
          (importedContent.transcript.text.length > 200 ? "..." : ""),
        message: `Transcript already exists (${importedContent.transcript.segments.length} segments)`,
      });
    }

    try {
      // Transcribe the audio
      const subtitleItems = await transcribeAudioWithWordTiming(
        importedContent.audioBase64,
        importedContent.audioMimeType
      );

      // Convert to transcript result
      const transcript = subtitleItemsToTranscriptResult(subtitleItems, language || "auto");

      // Update the imported content with transcript
      importedContent.transcript = transcript;
      importedContent.duration = subtitleItems.length > 0 
        ? subtitleItems[subtitleItems.length - 1].endTime 
        : importedContent.duration;

      setImportedContent(contentPlanId, importedContent);

      return JSON.stringify({
        success: true,
        sessionId: contentPlanId,
        segmentCount: transcript.segments.length,
        language: transcript.language,
        duration: importedContent.duration,
        transcriptPreview: transcript.text.substring(0, 200) + (transcript.text.length > 200 ? "..." : ""),
        message: `Transcribed audio with ${transcript.segments.length} segments (~${Math.round(importedContent.duration)}s)`,
      });

    } catch (error) {
      console.error("[ImportTools] Transcription error:", error);
      
      // Check for unsupported format error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes("format") || errorMessage.toLowerCase().includes("mime")) {
        return JSON.stringify({
          success: false,
          error: "Unsupported audio format",
          supportedFormats: SUPPORTED_AUDIO_FORMATS,
          suggestion: `Please use one of the supported formats: ${SUPPORTED_AUDIO_FORMATS.join(", ")}`,
        });
      }

      return JSON.stringify({
        success: false,
        error: errorMessage,
        suggestion: "Check if the audio file is valid and not corrupted.",
      });
    }
  },
  {
    name: "transcribe_audio_file",
    description: "Transcribe audio with word-level timing. Use after importing content. Supports language specification for better accuracy.",
    schema: TranscribeAudioSchema,
  }
);

// --- Export all import tools ---

export const importTools = [
  importYouTubeTool,
  transcribeAudioTool,
];
