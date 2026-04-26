/**
 * Eval runner helpers — shared across structural and behavioral evals.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { costTracker, type CostEntry } from './cost';

export const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
export const HAS_API_KEY = Boolean(API_KEY);
export const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === 'true';

/** Resolve a fixture path relative to __tests__/evals/. */
export function fixturePath(name: string): string {
  return resolve(__dirname, '..', 'fixtures', name);
}

/** Resolve a snapshot path relative to __tests__/evals/snapshots. */
export function snapshotPath(name: string): string {
  return resolve(__dirname, '..', 'snapshots', name);
}

/**
 * Load a JSON fixture. Throws with a clear message if missing so authors
 * see fixture-path bugs immediately rather than getting a generic ENOENT.
 */
export function loadFixture<T>(name: string): T {
  const path = fixturePath(name);
  if (!existsSync(path)) {
    throw new Error(
      `Fixture not found: ${name} (looked in ${path}). ` +
        `Add the file under __tests__/evals/fixtures/ or fix the name.`,
    );
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

/**
 * Snapshot helper. On first run (or when UPDATE_SNAPSHOTS=true), writes
 * the value to disk. On subsequent runs, asserts equality against the
 * recorded value. Use only for outputs that should be byte-stable; for
 * AI text outputs prefer llmJudge() since text varies run to run.
 */
export function expectSnapshot(name: string, value: unknown): void {
  const path = snapshotPath(name);
  const serialized = JSON.stringify(value, null, 2);

  if (!existsSync(path) || UPDATE_SNAPSHOTS) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serialized);
    if (UPDATE_SNAPSHOTS) {
      console.log(`[snapshot] updated ${name}`);
    } else {
      console.log(`[snapshot] recorded ${name} (first run)`);
    }
    return;
  }

  const recorded = readFileSync(path, 'utf-8');
  if (recorded !== serialized) {
    throw new Error(
      `Snapshot mismatch for ${name}.\n` +
        `Run with UPDATE_SNAPSHOTS=true to re-record.\n` +
        `--- recorded ---\n${recorded.slice(0, 500)}\n` +
        `--- received ---\n${serialized.slice(0, 500)}`,
    );
  }
}

/**
 * Wrap an async API call to track cost + duration.
 * The caller supplies token counts (or imageCount/videoSeconds) since the
 * underlying SDK responses vary in shape.
 */
export async function trackCall<T>(
  model: string,
  call: () => Promise<T>,
  meta: Partial<Pick<CostEntry, 'inputTokens' | 'outputTokens' | 'imageCount' | 'videoSeconds'>> = {},
): Promise<T> {
  const start = Date.now();
  const result = await call();
  const durationMs = Date.now() - start;
  costTracker.record({ model, durationMs, ...meta });
  return result;
}

/** Print the cost summary at the end of an eval run. */
export function logCostSummary(label: string): void {
  console.log(`\n=== Cost summary: ${label} ===`);
  console.log(costTracker.summary());
}
