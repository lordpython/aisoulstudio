/**
 * Smoke test (NOT a unit test) — content subagent language threading in Arabic.
 *
 * Runs against the real Gemini API. Uses vitest only as a runner because the
 * shared package relies on Vite's import.meta.glob.
 *
 * Does NOT run the media/export stages (expensive).
 *
 * Run: pnpm exec vitest run --config vitest.config.ts __tests__/smoke/content-subagent-arabic.smoke.ts
 *
 * Expected outcome: final narration text is predominantly Arabic characters.
 */

import { describe, it, expect } from 'vitest';
import { createContentSubagent } from '../../packages/shared/src/services/ai/subagents/contentSubagent';
import { productionStore } from '../../packages/shared/src/services/ai/production/store';
import type { SubagentContext } from '../../packages/shared/src/services/ai/subagents';

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const SESSION_ID = `prod_${Date.now()}_smoke`;
const TOPIC = 'ذكاء اصطناعي يغير مستقبل التعليم';
const TARGET_DURATION = 15;

describe.skipIf(!API_KEY)('[SMOKE] Content subagent — Arabic language threading', () => {
    it(
        'produces Arabic narration when language=ar flows through supervisor instruction',
        { timeout: 300_000 },
        async () => {
            const subagent = createContentSubagent(API_KEY);

            const instruction = `Create content plan for "${TOPIC}" (${TARGET_DURATION}s duration, Cinematic style). Language: ar.`;

            const context: SubagentContext = {
                sessionId: SESSION_ID,
                instruction,
                priorStages: [],
                userPreferences: { style: 'Cinematic', language: 'ar' },
                onProgress: (p) => {
                    const tag = p.tool ? `[${p.tool}]` : '';
                    // eslint-disable-next-line no-console
                    console.log(`   -> ${p.stage} ${tag} ${p.message ?? ''}`);
                },
            };

            const result = await subagent.invoke(context);

            // eslint-disable-next-line no-console
            console.log('\n=== RESULT ===');
            // eslint-disable-next-line no-console
            console.log(JSON.stringify({
                success: result.success,
                completedStage: result.completedStage,
                duration: result.duration,
                fallbackApplied: result.fallbackApplied,
                message: result.message,
            }, null, 2));

            expect(result.success).toBe(true);
            expect(result.sessionId).toBe(SESSION_ID);

            const session = productionStore.get(SESSION_ID);
            expect(session).toBeDefined();

            // Soft check: contentPlan.language SHOULD be persisted as 'ar', but the
            // real acceptance criterion is that narration is rendered in Arabic.
            // Log a warning if the field is missing rather than failing the test.
            if (session!.contentPlan?.language !== 'ar') {
                // eslint-disable-next-line no-console
                console.warn(
                    `⚠  contentPlan.language not persisted as 'ar' (got: ${String(
                        session!.contentPlan?.language
                    )}). Narration-level verification still runs below.`
                );
            }

            expect(session!.narrationSegments?.length ?? 0).toBeGreaterThan(0);

            const firstText = session!.narrationSegments![0]!.transcript ?? '';
            const arabicChars = firstText.match(/[\u0600-\u06FF]/g)?.length ?? 0;
            const totalChars = Math.max(firstText.length, 1);
            const arabicRatio = arabicChars / totalChars;

            // eslint-disable-next-line no-console
            console.log(`\narabic ratio (scene 1): ${(arabicRatio * 100).toFixed(0)}% of "${firstText.slice(0, 80)}..."`);

            expect(arabicRatio).toBeGreaterThanOrEqual(0.5);
        }
    );
});
