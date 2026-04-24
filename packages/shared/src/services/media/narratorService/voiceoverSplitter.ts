/**
 * Voiceover → Shot Splitter
 *
 * Distributes a scene-level voiceover script across the shots in that scene,
 * weighted by each shot's estimated duration.
 *
 * Used by `narrateAllShots` to produce unique per-shot narration from a single
 * scene voiceover when the shot-breakdown agent did not populate
 * `shot.scriptSegment`. Without this, all shots in a scene narrate identical
 * text (fallback to `scene.action`), producing repetitive audio.
 *
 * Design constraints:
 * - Split on SENTENCE boundaries only, so inline delivery markers like
 *   `[emphasis]...[/emphasis]`, `[pause: beat]`, `[breath]`, `[slow]...[/slow]`
 *   remain intact within a shot.
 * - Support Arabic punctuation: `؟`, `۔`, `،` as well as `.`, `!`, `?`.
 * - If there are fewer sentences than shots, assign one sentence to each of
 *   the first N shots and leave the rest empty (caller falls back).
 * - Every shot gets at least one sentence when sentences >= shots.
 */
import type { ShotlistEntry } from '../../../types';

/**
 * Sentence-tokenize a mixed-language string.
 *
 * Keeps the terminating punctuation attached to the sentence so delivery
 * cadence is preserved when the chunk is re-joined in TTS.
 */
export function splitIntoSentences(text: string): string[] {
    const trimmed = text.trim();
    if (!trimmed) return [];

    // Match: run of non-terminator chars + one or more terminators, or a trailing
    // tail with no terminator.
    // Terminators include: . ! ? ؟ (Arabic question mark) ۔ (Urdu full stop)
    const regex = /[^.!?؟۔]+[.!?؟۔]+|[^.!?؟۔]+$/g;
    const matches = trimmed.match(regex);
    if (!matches) return [trimmed];

    return matches.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Distribute a voiceover across shots proportionally by estimated duration.
 *
 * Returns a map from shotId → narration chunk. Shots not present in the map
 * should fall back to upstream behavior (scene.action) in the caller.
 *
 * @param voiceover - Scene-level voiceover script (may contain delivery markers).
 * @param shots - Shots belonging to the same scene. Order is preserved.
 */
export function distributeVoiceoverAcrossShots(
    voiceover: string,
    shots: ReadonlyArray<ShotlistEntry>,
): Map<string, string> {
    const result = new Map<string, string>();
    const trimmed = voiceover.trim();

    if (shots.length === 0 || !trimmed) {
        return result;
    }

    if (shots.length === 1) {
        const only = shots[0];
        if (only) result.set(only.id, trimmed);
        return result;
    }

    const sentences = splitIntoSentences(trimmed);
    if (sentences.length === 0) return result;

    // Fewer sentences than shots → assign 1 sentence each to the first N.
    // Remaining shots get no entry so the caller falls back.
    if (sentences.length <= shots.length) {
        for (let i = 0; i < sentences.length; i++) {
            const shot = shots[i];
            if (shot) result.set(shot.id, sentences[i]!);
        }
        return result;
    }

    // Proportional split: compute sentence budget per shot from durationEst.
    const weights = shots.map(s => {
        const d = s.durationEst;
        return typeof d === 'number' && d > 0 ? d : 5;
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const targets = weights.map(w =>
        Math.max(1, Math.round((w / totalWeight) * sentences.length)),
    );

    // Normalize: ensure sum(targets) === sentences.length.
    let sum = targets.reduce((a, b) => a + b, 0);
    // Trim from the tail down while preserving the floor of 1.
    let i = targets.length - 1;
    while (sum > sentences.length && i >= 0) {
        if ((targets[i] ?? 0) > 1) {
            targets[i] = (targets[i] ?? 1) - 1;
            sum -= 1;
        } else {
            i -= 1;
        }
    }
    // Add evenly across shots.
    let j = 0;
    while (sum < sentences.length) {
        targets[j % targets.length] = (targets[j % targets.length] ?? 0) + 1;
        sum += 1;
        j += 1;
    }

    // Walk sentences into chunks per shot.
    let cursor = 0;
    for (let k = 0; k < shots.length; k++) {
        const shot = shots[k];
        const take = targets[k] ?? 0;
        if (!shot) {
            cursor += take;
            continue;
        }
        const chunk = sentences.slice(cursor, cursor + take).join(' ').trim();
        cursor += take;
        if (chunk) result.set(shot.id, chunk);
    }

    return result;
}

/**
 * Build a shotId → narration chunk map from a multi-scene voiceover dictionary.
 *
 * Convenience wrapper that groups shots by sceneId and applies
 * `distributeVoiceoverAcrossShots` per scene.
 */
export function buildShotNarrationFromVoiceovers(
    voiceoversByScene: ReadonlyMap<string, string>,
    shots: ReadonlyArray<ShotlistEntry>,
): Map<string, string> {
    const byScene = new Map<string, ShotlistEntry[]>();
    for (const shot of shots) {
        const bucket = byScene.get(shot.sceneId);
        if (bucket) bucket.push(shot);
        else byScene.set(shot.sceneId, [shot]);
    }

    const out = new Map<string, string>();
    for (const [sceneId, sceneShots] of byScene) {
        const vo = voiceoversByScene.get(sceneId);
        if (!vo) continue;
        const distributed = distributeVoiceoverAcrossShots(vo, sceneShots);
        for (const [shotId, text] of distributed) {
            out.set(shotId, text);
        }
    }
    return out;
}
