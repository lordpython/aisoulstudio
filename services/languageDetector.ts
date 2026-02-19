/**
 * Language Detection Service
 *
 * Centralized language detection extracted from scattered inline checks.
 * Supports Arabic and English with confidence scoring.
 *
 * Replaces ad-hoc `/[\u0600-\u06FF]/.test()` checks throughout the codebase
 * with a consistent, testable interface.
 *
 * Requirement: 19.1
 */

/**
 * Language detection result with confidence scores
 */
export interface LanguageDetectionResult {
  /** Primary detected language code */
  language: 'ar' | 'en';
  /** Confidence score 0-1 for the primary language */
  confidence: number;
  /** Per-language character counts */
  scores: {
    ar: number;
    en: number;
  };
}

/**
 * Language Detector class
 *
 * Analyzes text using Unicode character ranges to determine the primary language.
 * Focused on Arabic vs English detection since those are the supported languages.
 */
export class LanguageDetector {
  /**
   * Detect the primary language of the given text.
   *
   * @param text Text to analyze
   * @returns Detection result with language, confidence, and per-language scores
   */
  detect(text: string): LanguageDetectionResult {
    if (!text || text.trim().length === 0) {
      return { language: 'en', confidence: 1, scores: { ar: 0, en: 0 } };
    }

    let arabicCount = 0;
    let latinCount = 0;

    for (const char of text) {
      const code = char.charCodeAt(0);
      // Arabic: U+0600–U+06FF, U+0750–U+077F (Arabic Supplement)
      if ((code >= 0x0600 && code <= 0x06FF) || (code >= 0x0750 && code <= 0x077F)) {
        arabicCount++;
      }
      // Latin (A-Z, a-z, extended Latin)
      else if ((code >= 0x0041 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x024F)) {
        latinCount++;
      }
    }

    const totalAlpha = arabicCount + latinCount;
    if (totalAlpha === 0) {
      return { language: 'en', confidence: 0.5, scores: { ar: 0, en: 0 } };
    }

    const arabicRatio = arabicCount / totalAlpha;
    const isArabic = arabicRatio > 0.3;

    return {
      language: isArabic ? 'ar' : 'en',
      confidence: isArabic ? arabicRatio : 1 - arabicRatio,
      scores: { ar: arabicCount, en: latinCount },
    };
  }

  /**
   * Quick boolean check: is this text primarily Arabic?
   */
  isArabic(text: string): boolean {
    return this.detect(text).language === 'ar';
  }

  /**
   * Quick boolean check: is this text primarily English?
   */
  isEnglish(text: string): boolean {
    return this.detect(text).language === 'en';
  }
}

/** Singleton instance for convenience */
export const languageDetector = new LanguageDetector();

/**
 * Standalone function matching the existing `detectLanguageFromText` signature
 * for drop-in replacement across the codebase.
 *
 * Returns 'ar' | 'en' (narrower than the original which could return other codes).
 * The original `detectLanguageFromText` in production/utils.ts supports more languages —
 * this function focuses on the two supported pipeline languages.
 */
export function detectLanguage(text: string): 'ar' | 'en' {
  return languageDetector.detect(text).language;
}
