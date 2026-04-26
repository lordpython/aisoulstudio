/**
 * Behavioral eval: content subagent quality.
 *
 * Calls the real content subagent across English + Arabic fixtures, then
 * uses Gemini 3.1 Pro to judge narration quality on a structured rubric.
 * Skipped automatically when GEMINI_API_KEY is not set.
 *
 * Asserts:
 *   - Subagent succeeds (no exceptions)
 *   - Generates non-empty narration segments
 *   - Arabic topics produce predominantly Arabic output (RTL threading)
 *   - LLM judge avg >= 7/10 across rubric dimensions
 *
 * Cost: ~$0.05 per topic (subagent calls + judge call). 5 topics = ~$0.25.
 *
 * Run: pnpm test:eval
 */

import { describe, it, expect, afterAll } from 'vitest';
import { createContentSubagent } from '../../../packages/shared/src/services/ai/subagents/contentSubagent';
import { productionStore } from '../../../packages/shared/src/services/ai/production/store';
import type { SubagentContext } from '../../../packages/shared/src/services/ai/subagents';
import { API_KEY, HAS_API_KEY, loadFixture, logCostSummary } from '../_helpers/runner';
import { llmJudge, formatJudgeResult, type JudgeRubric } from '../_helpers/judge';

interface TopicFixture {
  id: string;
  topic: string;
  format: string;
  duration: number;
  style: string;
}

interface TopicSet {
  english: TopicFixture[];
  arabic: TopicFixture[];
}

const NARRATION_RUBRIC: JudgeRubric = {
  relevance: 'narration directly addresses the requested topic',
  clarity: 'language is clear, well-paced, and easy to follow when read aloud',
  engagement: 'opening hook is compelling and pacing maintains attention',
  factualPlausibility: 'no obvious hallucinations or factually wrong claims for a general audience',
};

function arabicRatio(text: string): number {
  const arabic = text.match(/[؀-ۿ]/g)?.length ?? 0;
  return arabic / Math.max(text.length, 1);
}

describe.skipIf(!HAS_API_KEY)('[BEHAVIORAL] Content subagent quality', () => {
  const fixtures = loadFixture<TopicSet>('topics.json');

  afterAll(() => {
    logCostSummary('content-quality');
  });

  describe.each(fixtures.english)('English: $id', (topic) => {
    it(
      'produces high-quality English narration',
      async () => {
        const subagent = createContentSubagent(API_KEY);
        const sessionId = `eval_${topic.id}_${Date.now()}`;

        const context: SubagentContext = {
          sessionId,
          instruction: `Create content plan for "${topic.topic}" (${topic.duration}s duration, ${topic.style} style). Language: en.`,
          priorStages: [],
          userPreferences: { style: topic.style, language: 'en' },
        };

        const result = await subagent.invoke(context);
        expect(result.success, result.message).toBe(true);

        const session = productionStore.get(sessionId);
        expect(session?.narrationSegments?.length ?? 0).toBeGreaterThan(0);

        const fullNarration = (session!.narrationSegments ?? [])
          .map((s) => s.transcript ?? '')
          .join(' ');

        expect(fullNarration.length).toBeGreaterThan(50);

        const judge = await llmJudge(fullNarration, NARRATION_RUBRIC);
        console.log(formatJudgeResult(topic.id, judge));
        expect(
          judge.passedThreshold,
          `Quality below threshold for ${topic.id}`,
        ).toBe(true);
      },
      300_000,
    );
  });

  describe.each(fixtures.arabic)('Arabic: $id', (topic) => {
    it(
      'produces predominantly Arabic narration',
      async () => {
        const subagent = createContentSubagent(API_KEY);
        const sessionId = `eval_${topic.id}_${Date.now()}`;

        const context: SubagentContext = {
          sessionId,
          instruction: `Create content plan for "${topic.topic}" (${topic.duration}s duration, ${topic.style} style). Language: ar.`,
          priorStages: [],
          userPreferences: { style: topic.style, language: 'ar' },
        };

        const result = await subagent.invoke(context);
        expect(result.success, result.message).toBe(true);

        const session = productionStore.get(sessionId);
        expect(session?.narrationSegments?.length ?? 0).toBeGreaterThan(0);

        const fullNarration = (session!.narrationSegments ?? [])
          .map((s) => s.transcript ?? '')
          .join(' ');

        const ratio = arabicRatio(fullNarration);
        console.log(
          `[${topic.id}] arabic ratio: ${(ratio * 100).toFixed(0)}% (sample: "${fullNarration.slice(0, 80)}...")`,
        );
        // RTL threading regression check: narration should be majority Arabic.
        expect(ratio).toBeGreaterThanOrEqual(0.5);
      },
      300_000,
    );
  });
});
