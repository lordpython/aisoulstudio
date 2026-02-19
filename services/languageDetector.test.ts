/**
 * Language Detection Property Tests
 *
 * Property 9: Language Detection and Propagation (Requirements 3.7, 11.6, 12.4, 19.1-19.4)
 * Property 10: Language Override Consistency (Requirement 19.5)
 */

import { describe, it, expect } from 'vitest';
import { LanguageDetector, languageDetector, detectLanguage } from './languageDetector';

describe('LanguageDetector', () => {
  describe('Property 9: Language Detection and Propagation', () => {
    it('should detect Arabic text correctly', () => {
      const result = languageDetector.detect('مرحبا بالعالم');
      expect(result.language).toBe('ar');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.scores.ar).toBeGreaterThan(0);
    });

    it('should detect English text correctly', () => {
      const result = languageDetector.detect('Hello world, this is a test');
      expect(result.language).toBe('en');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.scores.en).toBeGreaterThan(0);
    });

    it('should detect Arabic in mixed text when Arabic dominates', () => {
      // Arabic with a few English words
      const result = languageDetector.detect('هذا الفيديو عن YouTube narration بالعربي');
      expect(result.language).toBe('ar');
    });

    it('should detect English in mixed text when English dominates', () => {
      // English with a few Arabic words
      const result = languageDetector.detect('This video is about قصة but mostly in English language');
      expect(result.language).toBe('en');
    });

    it('should default to English for empty input', () => {
      expect(languageDetector.detect('').language).toBe('en');
      expect(languageDetector.detect('  ').language).toBe('en');
    });

    it('should default to English for numeric-only input', () => {
      const result = languageDetector.detect('12345 67890');
      expect(result.language).toBe('en');
      expect(result.confidence).toBe(0.5); // low confidence since no alpha chars
    });

    it('should handle Arabic supplemental characters (U+0750-U+077F)', () => {
      // Characters in the Arabic Supplement block
      const result = languageDetector.detect('\u0750\u0751\u0752\u0753');
      expect(result.language).toBe('ar');
    });

    it('should return confidence scores that sum meaningfully', () => {
      const result = languageDetector.detect('Hello مرحبا World عالم');
      expect(result.scores.ar).toBeGreaterThan(0);
      expect(result.scores.en).toBeGreaterThan(0);
      // Confidence should be between 0 and 1
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should detect real-world Arabic story prompts', () => {
      const topics = [
        'الشرطة اليابانية استخدموا 130 الف ضابط عشان يحلوا قضية وحدة',
        'قصة مسلسل الحفرة التركي',
        'كيف بدأت الحرب العالمية الثانية',
      ];
      for (const topic of topics) {
        expect(detectLanguage(topic)).toBe('ar');
      }
    });

    it('should detect real-world English story prompts', () => {
      const topics = [
        'The mystery of the Bermuda Triangle explained',
        'How artificial intelligence is changing healthcare',
        'Top 10 unsolved crimes in history',
      ];
      for (const topic of topics) {
        expect(detectLanguage(topic)).toBe('en');
      }
    });
  });

  describe('Property 10: Language Override Consistency', () => {
    it('detectLanguage should always return ar or en', () => {
      // Various inputs should only return 'ar' or 'en'
      const inputs = [
        'Hello',
        'مرحبا',
        '',
        '12345',
        'Hello مرحبا',
        '   ',
        '!!!???...',
        'Héllo wörld', // Latin extended
      ];
      for (const input of inputs) {
        const result = detectLanguage(input);
        expect(['ar', 'en']).toContain(result);
      }
    });

    it('isArabic and isEnglish should be mutually exclusive', () => {
      const detector = new LanguageDetector();
      const inputs = ['Hello world', 'مرحبا بالعالم', 'Mixed مرحبا content'];
      for (const input of inputs) {
        const isAr = detector.isArabic(input);
        const isEn = detector.isEnglish(input);
        expect(isAr).not.toBe(isEn);
      }
    });

    it('should allow explicit language override (demonstrates override pattern)', () => {
      // This tests the pattern: language ?? detectLanguage(text)
      // When language is explicitly provided, detection is bypassed
      const text = 'مرحبا بالعالم'; // Arabic text
      const explicitOverride: 'ar' | 'en' = 'en';
      const detected = detectLanguage(text);

      // Without override: should detect Arabic
      expect(detected).toBe('ar');

      // With override: should use the override
      const effectiveLanguage = explicitOverride ?? detected;
      expect(effectiveLanguage).toBe('en');
    });

    it('should use detected language when no override provided', () => {
      const text = 'This is an English sentence';
      const noOverride: ('ar' | 'en') | undefined = undefined;
      const detected = detectLanguage(text);

      const effectiveLanguage = noOverride ?? detected;
      expect(effectiveLanguage).toBe('en');
    });

    it('should produce consistent results across multiple calls', () => {
      const text = 'الشرطة اليابانية استخدموا 130 الف ضابط';
      const results = Array.from({ length: 10 }, () => detectLanguage(text));
      const allSame = results.every(r => r === results[0]);
      expect(allSame).toBe(true);
    });

    it('new instances should produce same results as singleton', () => {
      const detector1 = new LanguageDetector();
      const detector2 = new LanguageDetector();
      const inputs = ['Hello', 'مرحبا', 'Mixed مرحبا content'];

      for (const input of inputs) {
        expect(detector1.detect(input).language).toBe(detector2.detect(input).language);
        expect(detector1.detect(input).language).toBe(languageDetector.detect(input).language);
      }
    });
  });
});
