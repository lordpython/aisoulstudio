/**
 * Transcription Service
 * Handles audio transcription functionality using Gemini AI.
 */

import { Type } from "@google/genai";
import { SubtitleItem, WordTiming } from "../types";
import { ai, MODELS, withRetry } from "./shared/apiClient";

// --- Interfaces ---

interface TranscriptionLine {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  words: { word: string; start: number; end: number }[];
}

interface TranscriptionResponse {
  lines: TranscriptionLine[];
}

// --- Helper Functions ---

/**
 * Convert a File to base64 string for use with Gemini API.
 */
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (!base64String) {
        reject(new Error("Failed to read file"));
        return;
      }
      const parts = base64String.split(",");
      const base64Data = parts.length > 1 ? parts[1] : base64String;
      if (!base64Data) {
        reject(new Error("Empty data in file"));
        return;
      }
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// --- Main Services ---

/**
 * Transcribe audio to SRT format.
 */
export const transcribeAudio = async (
  base64Audio: string,
  mimeType: string,
): Promise<string> => {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODELS.TRANSCRIPTION,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Audio } },
          {
            text: `Transcribe ALL spoken content of this audio to SRT format.

CRITICAL: You MUST transcribe EVERY SINGLE WORD from start to finish. Do NOT skip any sections or repeated phrases.

Rules:
1. Format: ID [newline] HH:MM:SS,mmm --> HH:MM:SS,mmm [newline] Text
2. No markdown blocks. Return ONLY raw SRT text.
3. Transcribe EVERYTHING - all speech, narration, lyrics, dialogue.
4. Cover the ENTIRE audio duration.
5. Do NOT summarize or skip any sections.`,
          },
        ],
      },
    });

    const text = response.text;
    if (!text) throw new Error("No transcription generated");
    return text
      .replace(/^```srt\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/, "");
  });
};

/**
 * Transcribe audio with word-level timing.
 * Falls back to line-level SRT transcription if word-level fails.
 */
export const transcribeAudioWithWordTiming = async (
  base64Audio: string,
  mimeType: string,
): Promise<SubtitleItem[]> => {
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: MODELS.TRANSCRIPTION,
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Audio } },
            {
              text: `Transcribe ALL spoken content of this audio file with precise word-level timing.

CRITICAL: You MUST transcribe EVERY SINGLE WORD from start to finish. Do NOT skip any sections, pauses, or repeated phrases.

Return a JSON object with this structure:
{
  "lines": [
    {
      "id": 1, "startTime": 0.0, "endTime": 3.5, "text": "Example spoken text here",
      "words": [ {"word": "Example", "start": 0.0, "end": 0.8}, ... ]
    }
  ]
}

Rules:
1. Times in SECONDS (e.g. 1.5).
2. Each line is a natural phrase (typically 3-8 words).
3. word.start/end must be precise timestamps.
4. TRANSCRIBE EVERYTHING - all speech, narration, lyrics, dialogue.
5. If there are silent/instrumental sections, the next line should have the correct start time after the break.
6. Do NOT summarize or skip any sections - transcribe them ALL.
7. Cover the ENTIRE audio duration from 0 seconds to the end.`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              lines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    startTime: { type: Type.NUMBER },
                    endTime: { type: Type.NUMBER },
                    text: { type: Type.STRING },
                    words: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          word: { type: Type.STRING },
                          start: { type: Type.NUMBER },
                          end: { type: Type.NUMBER },
                        },
                        required: ["word", "start", "end"],
                      },
                    },
                  },
                  required: ["id", "startTime", "endTime", "text", "words"],
                },
              },
            },
          },
        },
      });

      const jsonStr = response.text;
      if (!jsonStr) throw new Error("No transcription generated");

      const parsed: TranscriptionResponse = JSON.parse(jsonStr);

      return parsed.lines.map(
        (line: TranscriptionLine): SubtitleItem => ({
          id: line.id || 0,
          startTime: line.startTime || 0,
          endTime: line.endTime || 0,
          text: line.text || "",
          words: (line.words || []).map(
            (w: { word: string; start: number; end: number }): WordTiming => ({
              word: w.word || "",
              startTime: w.start || 0,
              endTime: w.end || 0,
            }),
          ),
        }),
      );
    } catch (error) {
      console.error("Word-level transcription error:", error);
      console.warn("Falling back to line-level SRT transcription...");
      const srt = await transcribeAudio(base64Audio, mimeType);
      const { parseSRT } = await import("../utils/srtParser");
      return parseSRT(srt);
    }
  });
};
