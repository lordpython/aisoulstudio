/**
 * Character Registry — unified source of truth for character identity.
 *
 * Today, three separate systems track aspects of "this character":
 *   1. imageService.ts — getCharacterSeed(description) -> numeric seed for
 *      image generation. Keyed by normalized description text. In-memory
 *      Map; lost on restart.
 *   2. characterService.ts — extractCharacters(scriptText) -> CharacterProfile[]
 *      with id/name/role/visualDescription. One-shot extraction; the caller
 *      decides what to do with the result. Profiles never feed back into
 *      the seed registry.
 *   3. visualConsistencyService.ts — extractVisualStyle(referenceImage) ->
 *      VisualStyle (colors, lighting, mood). Cached by sessionId; lost on
 *      restart and doesn't carry across projects.
 *
 * They share NO common identity for "this character". A profile, its seed,
 * its reference image, and its visual style live in three places that
 * never link up. This file defines the unified interface they should
 * eventually consume.
 *
 * MIGRATION PATH (deferred, not done in this commit):
 *   - imageService.getCharacterSeed: replace with registry.getOrCreate({...}).seed
 *   - characterService.extractCharacters: write each result to registry.upsert
 *   - visualConsistencyService.extractVisualStyle: cache by characterId, not sessionId
 *   - Persist registry to Firestore so character identity survives restart
 *   - When LoRA fine-tuning lands, store loraId on the same record
 *
 * For now this module ships the interface + an in-memory implementation
 * with tests. Existing services keep working unchanged. Migration happens
 * incrementally in follow-up commits.
 */

/**
 * One character's full identity across the rendering pipeline.
 *
 * Every field except id+key+seed is optional today; future migration work
 * will populate the others.
 */
export interface CharacterRecord {
    /** Stable identifier — survives restart once persistence lands. */
    readonly id: string;
    /** Normalized lookup key (e.g. lowercase visual description fragment). */
    readonly key: string;
    /** Display name from extraction (e.g. "Aria", "The Detective"). */
    name?: string;
    /** Story role (protagonist, antagonist, supporting, ...). */
    role?: string;
    /**
     * Detailed physical description used as both the lookup key source and
     * the prompt seed for image generation.
     */
    visualDescription: string;
    /** Numeric seed for deterministic image generation. */
    seed: number;
    /** URL of the canonical reference image (for IP-Adapter / LoRA). */
    referenceImageUrl?: string;
    /** Visual style extracted from the reference (colors, lighting, mood). */
    style?: CharacterVisualStyle;
    /** LoRA weight identifier — populated when fine-tuning support lands. */
    loraId?: string;
    /** Number of times this record has been read since creation. */
    usageCount: number;
    /** Wall-clock timestamp the record was created. */
    readonly createdAt: number;
    /** Wall-clock timestamp of the last write. */
    updatedAt: number;
}

/**
 * Subset of {@link CharacterRecord} consumers can pass when creating or
 * upserting. id/key/seed/usageCount/createdAt/updatedAt are managed
 * internally.
 */
export interface CharacterUpsertInput {
    visualDescription: string;
    name?: string;
    role?: string;
    referenceImageUrl?: string;
    style?: CharacterVisualStyle;
    loraId?: string;
}

/**
 * Visual style shape — mirrors VisualStyle from visualConsistencyService.
 * Re-declared here to avoid a circular import; shapes are intentionally
 * compatible so the migration is a structural type cast.
 */
export interface CharacterVisualStyle {
    colorPalette: string[];
    lighting: string;
    texture: string;
    moodKeywords: string[];
    stylePrompt: string;
}

/**
 * Storage backend for the registry. The default is in-memory; a future
 * implementation will read/write Firestore for cross-session persistence.
 */
export interface CharacterStore {
    get(key: string): CharacterRecord | undefined;
    set(key: string, record: CharacterRecord): void;
    values(): IterableIterator<CharacterRecord>;
    delete(key: string): boolean;
    clear(): void;
    size(): number;
}

class InMemoryStore implements CharacterStore {
    private readonly map = new Map<string, CharacterRecord>();
    get(key: string): CharacterRecord | undefined {
        return this.map.get(key);
    }
    set(key: string, record: CharacterRecord): void {
        this.map.set(key, record);
    }
    values(): IterableIterator<CharacterRecord> {
        return this.map.values();
    }
    delete(key: string): boolean {
        return this.map.delete(key);
    }
    clear(): void {
        this.map.clear();
    }
    size(): number {
        return this.map.size;
    }
}

// ---------------------------------------------------------------------------
// Key normalization — kept intentionally identical to imageService.ts so that
// migration is a clean swap: same description text yields the same key.
// ---------------------------------------------------------------------------

export function normalizeCharacterKey(description: string): string {
    return description
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2)
        .slice(0, 10)
        .join('_');
}

function generateSeed(): number {
    return Math.floor(Math.random() * 2147483647);
}

function generateId(): string {
    return `char_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// CharacterRegistry — public API
// ---------------------------------------------------------------------------

export class CharacterRegistry {
    private readonly store: CharacterStore;

    constructor(store: CharacterStore = new InMemoryStore()) {
        this.store = store;
    }

    /**
     * Get an existing record by visual description, or create a fresh one.
     * Increments usageCount on existing records. The returned record is a
     * snapshot — mutations require a follow-up upsert call.
     */
    getOrCreate(input: CharacterUpsertInput): CharacterRecord {
        const key = normalizeCharacterKey(input.visualDescription);
        const existing = this.store.get(key);
        if (existing) {
            const updated: CharacterRecord = {
                ...existing,
                usageCount: existing.usageCount + 1,
                updatedAt: Date.now(),
            };
            this.store.set(key, updated);
            return updated;
        }
        const now = Date.now();
        const created: CharacterRecord = {
            id: generateId(),
            key,
            name: input.name,
            role: input.role,
            visualDescription: input.visualDescription,
            seed: generateSeed(),
            referenceImageUrl: input.referenceImageUrl,
            style: input.style,
            loraId: input.loraId,
            usageCount: 1,
            createdAt: now,
            updatedAt: now,
        };
        this.store.set(key, created);
        return created;
    }

    /**
     * Update fields on an existing record (matched by visual description).
     * Returns the updated record, or undefined if no match exists.
     * Use {@link getOrCreate} when you want create-on-miss semantics.
     */
    upsert(input: CharacterUpsertInput): CharacterRecord {
        const key = normalizeCharacterKey(input.visualDescription);
        const existing = this.store.get(key);
        if (!existing) {
            return this.getOrCreate(input);
        }
        const merged: CharacterRecord = {
            ...existing,
            name: input.name ?? existing.name,
            role: input.role ?? existing.role,
            referenceImageUrl: input.referenceImageUrl ?? existing.referenceImageUrl,
            style: input.style ?? existing.style,
            loraId: input.loraId ?? existing.loraId,
            updatedAt: Date.now(),
        };
        this.store.set(key, merged);
        return merged;
    }

    /** Look up a record by description without creating one. */
    find(visualDescription: string): CharacterRecord | undefined {
        return this.store.get(normalizeCharacterKey(visualDescription));
    }

    /** Look up a record by stable id (linear scan; persistent backends will index). */
    findById(id: string): CharacterRecord | undefined {
        for (const record of this.store.values()) {
            if (record.id === id) return record;
        }
        return undefined;
    }

    /** All known records, in insertion order. */
    list(): CharacterRecord[] {
        return Array.from(this.store.values());
    }

    /** Drop a single record. */
    remove(visualDescription: string): boolean {
        return this.store.delete(normalizeCharacterKey(visualDescription));
    }

    /** Drop everything — use when starting a new project. */
    clear(): void {
        this.store.clear();
    }

    /** Number of distinct characters tracked. */
    size(): number {
        return this.store.size();
    }
}

// ---------------------------------------------------------------------------
// Module-level default — convenience for migration. Existing services that
// each have their own state can move to this singleton incrementally.
// ---------------------------------------------------------------------------

export const characterRegistry = new CharacterRegistry();
