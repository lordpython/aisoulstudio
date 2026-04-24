/**
 * Unit tests for the voiceover → shot splitter.
 *
 * These tests pin down the fix for the "all shots in a scene narrate the same
 * text" bug. Every test either asserts unique per-shot output or documents a
 * known edge-case fallback.
 */
import { describe, it, expect } from 'vitest';
import type { ShotlistEntry } from '../../packages/shared/src/types';
import {
    splitIntoSentences,
    distributeVoiceoverAcrossShots,
    buildShotNarrationFromVoiceovers,
} from '../../packages/shared/src/services/media/narratorService/voiceoverSplitter';

function makeShot(
    id: string,
    sceneId: string,
    durationEst: number,
    shotNumber = 1,
): ShotlistEntry {
    return {
        id,
        sceneId,
        shotNumber,
        description: `Shot ${id}`,
        cameraAngle: 'Eye-level',
        movement: 'Static',
        lighting: 'Natural',
        dialogue: '',
        durationEst,
        shotType: 'Medium',
    };
}

describe('splitIntoSentences', () => {
    it('returns empty array for empty input', () => {
        expect(splitIntoSentences('')).toEqual([]);
        expect(splitIntoSentences('   ')).toEqual([]);
    });

    it('splits English sentences on . ! ?', () => {
        const out = splitIntoSentences('First one. Second! Third? Fourth.');
        expect(out).toEqual(['First one.', 'Second!', 'Third?', 'Fourth.']);
    });

    it('splits Arabic on ؟ ۔ and .', () => {
        const out = splitIntoSentences('هل هذا سؤال؟ هذه جملة. انتهى۔');
        expect(out).toHaveLength(3);
        expect(out[0]).toContain('؟');
        expect(out[1]).toContain('.');
        expect(out[2]).toContain('۔');
    });

    it('preserves inline delivery markers within a sentence', () => {
        const input = '[breath] With every fiber of his being, [emphasis]Sami[/emphasis] hurls the ball forward [pause: beat] but it sails wide.';
        const out = splitIntoSentences(input);
        expect(out).toHaveLength(1);
        expect(out[0]).toContain('[emphasis]Sami[/emphasis]');
        expect(out[0]).toContain('[pause: beat]');
    });

    it('keeps a trailing fragment without a terminator', () => {
        expect(splitIntoSentences('no period at end')).toEqual(['no period at end']);
    });
});

describe('distributeVoiceoverAcrossShots', () => {
    it('returns empty map for empty voiceover', () => {
        const shots = [makeShot('s1', 'scene_1', 5)];
        expect(distributeVoiceoverAcrossShots('', shots).size).toBe(0);
    });

    it('returns empty map for zero shots', () => {
        expect(distributeVoiceoverAcrossShots('Hello world.', []).size).toBe(0);
    });

    it('assigns entire voiceover to single shot', () => {
        const shots = [makeShot('s1', 'scene_1', 5)];
        const out = distributeVoiceoverAcrossShots('The whole story goes here.', shots);
        expect(out.get('s1')).toBe('The whole story goes here.');
    });

    it('distributes sentences proportionally by duration', () => {
        // 4 sentences, 2 shots with equal duration → 2 each.
        const shots = [
            makeShot('s1', 'scene_1', 5),
            makeShot('s2', 'scene_1', 5, 2),
        ];
        const vo = 'One. Two. Three. Four.';
        const out = distributeVoiceoverAcrossShots(vo, shots);
        expect(out.get('s1')).toBe('One. Two.');
        expect(out.get('s2')).toBe('Three. Four.');
    });

    it('weights sentences to longer shots', () => {
        // 6 sentences, shot2 is 2x the duration of shot1.
        // Targets should roughly favor shot2: ~2 for shot1, ~4 for shot2.
        const shots = [
            makeShot('s1', 'scene_1', 3),
            makeShot('s2', 'scene_1', 6, 2),
        ];
        const vo = 'A. B. C. D. E. F.';
        const out = distributeVoiceoverAcrossShots(vo, shots);

        const s1 = out.get('s1') ?? '';
        const s2 = out.get('s2') ?? '';
        const s1Count = splitIntoSentences(s1).length;
        const s2Count = splitIntoSentences(s2).length;
        expect(s1Count + s2Count).toBe(6);
        expect(s2Count).toBeGreaterThan(s1Count);
    });

    it('ensures every shot gets at least one sentence when sentences >= shots', () => {
        const shots = [
            makeShot('s1', 'scene_1', 3),
            makeShot('s2', 'scene_1', 3, 2),
            makeShot('s3', 'scene_1', 3, 3),
        ];
        const vo = 'A. B. C. D. E.';
        const out = distributeVoiceoverAcrossShots(vo, shots);
        expect(out.get('s1')).toBeTruthy();
        expect(out.get('s2')).toBeTruthy();
        expect(out.get('s3')).toBeTruthy();
    });

    it('assigns first N shots when sentences < shots and leaves rest unmapped', () => {
        // 2 sentences, 4 shots → first 2 get a sentence, shot 3 and 4 are unmapped
        // (caller falls back to upstream behavior).
        const shots = [
            makeShot('s1', 'scene_1', 5),
            makeShot('s2', 'scene_1', 5, 2),
            makeShot('s3', 'scene_1', 5, 3),
            makeShot('s4', 'scene_1', 5, 4),
        ];
        const out = distributeVoiceoverAcrossShots('Only one. And two.', shots);
        expect(out.size).toBe(2);
        expect(out.get('s1')).toBe('Only one.');
        expect(out.get('s2')).toBe('And two.');
        expect(out.has('s3')).toBe(false);
    });

    it('produces unique per-shot output (no duplicate text across shots)', () => {
        // Regression test for the original bug: all 12 shots in a scene
        // getting identical text from scene.action fallback.
        const shots = Array.from({ length: 6 }, (_, i) =>
            makeShot(`shot_${i + 1}`, 'scene_0', 4, i + 1),
        );
        const vo = 'Dawn breaks over the city. Sirens wail in the distance. ' +
            'A lone figure walks the empty street. Rain begins to fall gently. ' +
            'Windows light up one by one. The day has begun.';
        const out = distributeVoiceoverAcrossShots(vo, shots);

        const texts = Array.from(out.values());
        const unique = new Set(texts);
        expect(unique.size).toBe(texts.length);
        expect(texts.length).toBe(6);
    });

    it('handles Arabic voiceover without breaking on Arabic punctuation', () => {
        const shots = [
            makeShot('s1', 'scene_1', 5),
            makeShot('s2', 'scene_1', 5, 2),
        ];
        const vo = 'المحقق يدخل الغرفة. الأدلة منتشرة في كل مكان. هل فعل هذا بنفسه؟ الحقيقة صادمة.';
        const out = distributeVoiceoverAcrossShots(vo, shots);

        expect(out.get('s1')).toBeTruthy();
        expect(out.get('s2')).toBeTruthy();
        expect(out.get('s1')).not.toBe(out.get('s2'));
    });
});

describe('buildShotNarrationFromVoiceovers', () => {
    it('routes each scene voiceover only to its own shots', () => {
        const shots = [
            makeShot('a1', 'scene_A', 4, 1),
            makeShot('a2', 'scene_A', 4, 2),
            makeShot('b1', 'scene_B', 4, 1),
            makeShot('b2', 'scene_B', 4, 2),
        ];
        const voiceovers = new Map<string, string>([
            ['scene_A', 'Alpha one. Alpha two.'],
            ['scene_B', 'Beta one. Beta two.'],
        ]);
        const out = buildShotNarrationFromVoiceovers(voiceovers, shots);

        expect(out.get('a1')).toBe('Alpha one.');
        expect(out.get('a2')).toBe('Alpha two.');
        expect(out.get('b1')).toBe('Beta one.');
        expect(out.get('b2')).toBe('Beta two.');
    });

    it('skips scenes with no voiceover (caller falls back)', () => {
        const shots = [
            makeShot('a1', 'scene_A', 4),
            makeShot('b1', 'scene_B', 4),
        ];
        const voiceovers = new Map<string, string>([
            ['scene_A', 'Only A.'],
        ]);
        const out = buildShotNarrationFromVoiceovers(voiceovers, shots);
        expect(out.get('a1')).toBe('Only A.');
        expect(out.has('b1')).toBe(false);
    });
});
