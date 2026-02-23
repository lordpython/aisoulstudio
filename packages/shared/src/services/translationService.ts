/**
 * Translation Service
 * Handles subtitle translation functionality using Gemini AI.
 */

import { Type } from "@google/genai";
import { SubtitleItem } from "../types";
import { ai, MODELS, withRetry } from "./shared/apiClient";

// --- Interfaces ---

interface TranslationItem {
  id: number;
  translation: string;
}

// --- Main Services ---

/**
 * Translate subtitles to a target language.
 * Processes subtitles in batches for efficiency.
 * @param subtitles - Array of subtitle items to translate
 * @param targetLanguage - Target language for translation
 */
export const translateSubtitles = async (
  subtitles: SubtitleItem[],
  targetLanguage: string,
): Promise<{ id: number; translation: string }[]> => {
  const BATCH_SIZE = 50;
  const simplifiedSubs = subtitles.map((s) => ({ id: s.id, text: s.text }));
  const chunks = [];

  for (let i = 0; i < simplifiedSubs.length; i += BATCH_SIZE) {
    chunks.push(simplifiedSubs.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `Translating ${subtitles.length} lines in ${chunks.length} batches...`,
  );

  const processBatch = async (batch: typeof simplifiedSubs) => {
    return withRetry(async () => {
      const response = await ai.models.generateContent({
        model: MODELS.TRANSLATION,
        contents: `Translate these lyrics into ${targetLanguage}.
        Return JSON object with "translations" array [{ id, translation }].
        Keep poetic flow.

        Input:
        ${JSON.stringify(batch)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    translation: { type: Type.STRING },
                  },
                  required: ["id", "translation"],
                },
              },
            },
          },
        },
      });

      const jsonStr = response.text;
      if (!jsonStr) throw new Error("No translation generated for batch");

      const parsed = JSON.parse(jsonStr) as { translations: TranslationItem[] };
      return parsed.translations;
    });
  };

  try {
    const results = await Promise.all(
      chunks.map((chunk) => processBatch(chunk)),
    );
    return results.flat().sort((a, b) => a.id - b.id);
  } catch (error) {
    console.error("Translation error:", error);
    throw error;
  }
};
