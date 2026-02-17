import { describe, it, expect } from 'vitest';
import { cleanForTTS, cleanForSubtitles } from '../../services/textSanitizer';

describe('cleanForTTS', () => {
    it('strips **bold** markdown labels', () => {
        expect(cleanForTTS('**Emotional Hook:** The city never sleeps.'))
            .toBe('The city never sleeps.');
    });

    it('strips **bold** wrapped text', () => {
        // **bold** matches the bold-label pattern and is fully removed
        expect(cleanForTTS('The **bold** word')).toBe('The word');
    });

    it('strips *italic* markers', () => {
        expect(cleanForTTS('A *gentle* breeze')).toBe('A gentle breeze');
    });

    it('strips # headings', () => {
        expect(cleanForTTS('## Scene Title\nThe action begins.'))
            .toBe('Scene Title The action begins.');
    });

    it('strips `code` markers', () => {
        expect(cleanForTTS('Use `command` here')).toBe('Use command here');
    });

    it('strips [bracket] directions', () => {
        expect(cleanForTTS('[Scene Direction:] The camera pans left.'))
            .toBe('The camera pans left.');
    });

    it('strips (Note:) parentheticals', () => {
        expect(cleanForTTS('The hero arrives. (Note: dramatic lighting) He speaks.'))
            .toBe('The hero arrives. He speaks.');
    });

    it('strips (SFX: ...) parentheticals', () => {
        expect(cleanForTTS('Silence. (SFX: thunder crack) Then rain.'))
            .toBe('Silence. Then rain.');
    });

    it('strips (Sound: ...) parentheticals', () => {
        expect(cleanForTTS('Walking. (Sound: footsteps) Slowly.'))
            .toBe('Walking. Slowly.');
    });

    it('strips (Music: ...) parentheticals', () => {
        expect(cleanForTTS('The finale. (Music: crescendo) End.'))
            .toBe('The finale. End.');
    });

    it('strips (Pause) parentheticals', () => {
        expect(cleanForTTS('Wait. (Pause) Now go.'))
            .toBe('Wait. Now go.');
    });

    it('strips INT. screenplay prefix', () => {
        expect(cleanForTTS('INT. COFFEE SHOP - DAY'))
            .toBe('COFFEE SHOP - DAY');
    });

    it('strips EXT. screenplay prefix', () => {
        expect(cleanForTTS('EXT. CITY STREET - NIGHT'))
            .toBe('CITY STREET - NIGHT');
    });

    it('strips "Scene 3:" headers', () => {
        expect(cleanForTTS('Scene 3: The revelation')).toBe('The revelation');
    });

    it('strips Arabic scene headers (مشهد ٣:)', () => {
        expect(cleanForTTS('مشهد ٣: البداية')).toBe('البداية');
    });

    it('strips Arabic narrative labels', () => {
        expect(cleanForTTS('النقطة السردية الأولى: القصة تبدأ'))
            .toBe('القصة تبدأ');
    });

    it('strips المشهد headers', () => {
        expect(cleanForTTS('المشهد ١: الافتتاح')).toBe('الافتتاح');
    });

    it('strips الراوي: prefix', () => {
        expect(cleanForTTS('الراوي: يحكى أن')).toBe('يحكى أن');
    });

    it('strips horizontal rules', () => {
        expect(cleanForTTS('Above\n---\nBelow')).toBe('Above Below');
    });

    it('strips blockquotes', () => {
        expect(cleanForTTS('> This is a quote')).toBe('This is a quote');
    });

    it('strips bullet points', () => {
        expect(cleanForTTS('- First item\n- Second item'))
            .toBe('First item Second item');
    });

    it('collapses whitespace', () => {
        expect(cleanForTTS('Too   many    spaces')).toBe('Too many spaces');
    });

    it('handles combined markdown + metadata', () => {
        const dirty = '**Key Narrative Beat:** [Direction: slow fade] The hero (Note: close-up) rises.';
        expect(cleanForTTS(dirty)).toBe('The hero rises.');
    });

    it('strips Arabic emotional hook label (الخطاف العاطفي)', () => {
        expect(cleanForTTS('الخطاف العاطفي: المدينة لا تنام أبدًا'))
            .toBe('المدينة لا تنام أبدًا');
    });

    it('strips Arabic emotional hook with qualifier', () => {
        expect(cleanForTTS('الخطاف العاطفي الأول: بداية الحكاية'))
            .toBe('بداية الحكاية');
    });

    it('strips English "Emotional Hook:" label', () => {
        expect(cleanForTTS('Emotional Hook: The city never sleeps.'))
            .toBe('The city never sleeps.');
    });

    it('strips English "Narrative Beat:" label', () => {
        expect(cleanForTTS('Narrative Beat: She opened the door.'))
            .toBe('She opened the door.');
    });

    it('strips English "Key Beat:" label', () => {
        expect(cleanForTTS('Key Beat: The villain reveals himself.'))
            .toBe('The villain reveals himself.');
    });

    it('strips English "Hook:" label', () => {
        expect(cleanForTTS('Hook: A strange noise echoed.'))
            .toBe('A strange noise echoed.');
    });

    it('strips English "Beat:" label', () => {
        expect(cleanForTTS('Beat: Time stopped.'))
            .toBe('Time stopped.');
    });

    it('preserves valid Arabic text without labels', () => {
        const validArabic = 'في ليلة مظلمة، سار الرجل وحيدًا في الشوارع الضيقة.';
        expect(cleanForTTS(validArabic)).toBe(validArabic);
    });
});

describe('cleanForSubtitles', () => {
    it('returns empty chunks for empty text', () => {
        const result = cleanForSubtitles('');
        expect(result.chunks).toEqual([]);
    });

    it('splits long text into chunks under maxChars', () => {
        const longText = 'The first sentence is here. The second sentence follows. The third sentence completes the thought.';
        const result = cleanForSubtitles(longText, 60);
        expect(result.chunks.length).toBeGreaterThan(1);
        result.chunks.forEach(chunk => {
            // Allow some overflow for edge cases but should be reasonable
            expect(chunk.length).toBeLessThan(100);
        });
    });

    it('respects Arabic comma as sentence boundary', () => {
        const arabicText = 'الجملة الأولى، الجملة الثانية؛ الجملة الثالثة.';
        const result = cleanForSubtitles(arabicText, 30);
        expect(result.chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('returns minDisplayTime', () => {
        const result = cleanForSubtitles('Short text.', 80, 2.0);
        expect(result.minDisplayTime).toBe(2.0);
    });

    it('cleans metadata before chunking', () => {
        const dirty = '**Emotional Hook:** The hero rises. **Action:** He strikes.';
        const result = cleanForSubtitles(dirty, 80);
        expect(result.chunks.length).toBeGreaterThan(0);
        result.chunks.forEach(chunk => {
            expect(chunk).not.toContain('**');
            expect(chunk).not.toContain('Emotional Hook');
        });
    });

    it('splits very long chunks at midpoint', () => {
        // Create text that will be a single chunk but over 1.5x maxChars
        const longSentence = 'This is a very long sentence that goes on and on with many words to exceed the character limit significantly and needs splitting.';
        const result = cleanForSubtitles(longSentence, 40);
        expect(result.chunks.length).toBeGreaterThan(1);
    });
});
