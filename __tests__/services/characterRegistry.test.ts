/**
 * Unit tests for the unified CharacterRegistry interface.
 *
 * These tests pin down the contract that imageService, characterService,
 * and visualConsistencyService should eventually consume.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    CharacterRegistry,
    normalizeCharacterKey,
    type CharacterStore,
    type CharacterRecord,
} from '../../packages/shared/src/services/media/characterRegistry';

describe('normalizeCharacterKey', () => {
    it('lowercases, strips punctuation, drops short words, takes first 10 tokens', () => {
        const key = normalizeCharacterKey('Tall, Young Woman with Brown Hair');
        expect(key).toBe('tall_young_woman_with_brown_hair');
    });

    it('preserves word order (matters for visual identity)', () => {
        // Documented invariant from imageService: word order is intentional.
        const a = normalizeCharacterKey('young tall woman brown hair');
        const b = normalizeCharacterKey('tall young woman brown hair');
        expect(a).not.toBe(b);
    });

    it('treats different punctuation around the same words as identical', () => {
        const a = normalizeCharacterKey('young woman, brown hair!');
        const b = normalizeCharacterKey('young woman brown hair');
        expect(a).toBe(b);
    });
});

describe('CharacterRegistry', () => {
    let registry: CharacterRegistry;

    beforeEach(() => {
        registry = new CharacterRegistry();
    });

    describe('getOrCreate', () => {
        it('creates a new record on first call with a stable seed', () => {
            const r = registry.getOrCreate({ visualDescription: 'young woman brown hair' });
            expect(r.id).toMatch(/^char_/);
            expect(r.seed).toBeGreaterThanOrEqual(0);
            expect(r.seed).toBeLessThanOrEqual(2147483647);
            expect(r.usageCount).toBe(1);
            expect(r.visualDescription).toBe('young woman brown hair');
        });

        it('returns the same record (same seed) on repeated calls with equivalent description', () => {
            const a = registry.getOrCreate({ visualDescription: 'young woman brown hair' });
            const b = registry.getOrCreate({ visualDescription: 'Young woman, brown hair' });
            expect(b.id).toBe(a.id);
            expect(b.seed).toBe(a.seed);
        });

        it('increments usageCount on repeated lookups', () => {
            registry.getOrCreate({ visualDescription: 'old man grey beard' });
            const second = registry.getOrCreate({ visualDescription: 'old man grey beard' });
            const third = registry.getOrCreate({ visualDescription: 'old man grey beard' });
            expect(second.usageCount).toBe(2);
            expect(third.usageCount).toBe(3);
        });

        it('different descriptions yield different records and seeds', () => {
            const a = registry.getOrCreate({ visualDescription: 'young woman brown hair' });
            const b = registry.getOrCreate({ visualDescription: 'old man grey beard' });
            expect(a.id).not.toBe(b.id);
        });

        it('captures optional fields when supplied', () => {
            const r = registry.getOrCreate({
                visualDescription: 'detective wearing trench coat',
                name: 'Aria',
                role: 'protagonist',
                referenceImageUrl: 'https://example.com/aria.png',
            });
            expect(r.name).toBe('Aria');
            expect(r.role).toBe('protagonist');
            expect(r.referenceImageUrl).toBe('https://example.com/aria.png');
        });
    });

    describe('upsert', () => {
        it('creates a record when none exists (delegates to getOrCreate)', () => {
            const r = registry.upsert({
                visualDescription: 'young scientist white coat',
                name: 'Eli',
            });
            expect(r.name).toBe('Eli');
            expect(registry.size()).toBe(1);
        });

        it('updates fields on an existing record without touching seed or id', () => {
            const created = registry.getOrCreate({ visualDescription: 'young scientist white coat' });
            const updated = registry.upsert({
                visualDescription: 'young scientist white coat',
                name: 'Eli',
                referenceImageUrl: 'https://example.com/eli.png',
            });
            expect(updated.id).toBe(created.id);
            expect(updated.seed).toBe(created.seed);
            expect(updated.name).toBe('Eli');
            expect(updated.referenceImageUrl).toBe('https://example.com/eli.png');
        });

        it('preserves existing fields when upsert input omits them', () => {
            registry.upsert({
                visualDescription: 'young scientist white coat',
                name: 'Eli',
                role: 'mentor',
            });
            const updated = registry.upsert({
                visualDescription: 'young scientist white coat',
                referenceImageUrl: 'https://example.com/eli.png',
            });
            expect(updated.name).toBe('Eli');
            expect(updated.role).toBe('mentor');
        });
    });

    describe('lookups', () => {
        it('find returns undefined for unknown descriptions', () => {
            expect(registry.find('nonexistent character')).toBeUndefined();
        });

        it('findById walks the store and matches by stable id', () => {
            const created = registry.getOrCreate({ visualDescription: 'tall warrior shield' });
            const found = registry.findById(created.id);
            expect(found?.id).toBe(created.id);
        });

        it('list returns every record', () => {
            registry.getOrCreate({ visualDescription: 'young woman brown hair' });
            registry.getOrCreate({ visualDescription: 'old man grey beard' });
            expect(registry.list()).toHaveLength(2);
        });
    });

    describe('removal', () => {
        it('remove drops a single record', () => {
            registry.getOrCreate({ visualDescription: 'young woman brown hair' });
            registry.getOrCreate({ visualDescription: 'old man grey beard' });
            expect(registry.remove('young woman brown hair')).toBe(true);
            expect(registry.size()).toBe(1);
        });

        it('clear empties the registry (use when starting a new project)', () => {
            registry.getOrCreate({ visualDescription: 'young woman brown hair' });
            registry.getOrCreate({ visualDescription: 'old man grey beard' });
            registry.clear();
            expect(registry.size()).toBe(0);
        });
    });

    describe('pluggable backend', () => {
        it('accepts a custom store implementation (for future Firestore backend)', () => {
            const calls: string[] = [];
            const spyStore: CharacterStore = {
                get: (k) => { calls.push(`get:${k}`); return undefined; },
                set: (k) => { calls.push(`set:${k}`); },
                values: () => [][Symbol.iterator]() as IterableIterator<CharacterRecord>,
                delete: (k) => { calls.push(`delete:${k}`); return false; },
                clear: () => { calls.push('clear'); },
                size: () => 0,
            };
            const r = new CharacterRegistry(spyStore);
            r.getOrCreate({ visualDescription: 'young woman brown hair' });
            expect(calls).toEqual([
                'get:young_woman_brown_hair',
                'set:young_woman_brown_hair',
            ]);
        });
    });
});
