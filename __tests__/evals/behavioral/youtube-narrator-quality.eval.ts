/**
 * V1 GOLDEN EVAL — YouTube Narrator quality
 *
 * Exercises the research phase (the V1 differentiator) of the YouTube
 * Narrator pipeline against 10 realistic prompts (5 EN + 5 AR). Asserts:
 *
 *   - Research succeeds (>= 1 source returned)
 *   - Confidence is non-trivial (>= 0.4)
 *   - Summary is in the requested language (Arabic char ratio for ar)
 *   - LLM judge avg >= 7/10 on the V1 rubric
 *
 * Research is the most quality-critical, cheapest-to-test step. If
 * research is bad, no amount of downstream prompt magic recovers the
 * video quality; if research is good, the rest is mechanical assembly.
 *
 * What we deliberately DON'T test here:
 *   - Image generation (cost, flakiness)
 *   - TTS audio (cost, hard to judge programmatically)
 *   - Video assembly (infra, not quality)
 * Those belong in separate evals if/when they become V1 risks.
 *
 * Cost per run (10 topics × shallow research × judge):
 *   ~30 API calls, ~$0.80 — manual run only, NOT in CI.
 *
 * Skipped automatically when GEMINI_API_KEY is not set.
 *
 * Run: pnpm test:eval -- youtube-narrator-quality
 */

import { describe, it, expect, afterAll } from 'vitest';
import { ResearchService } from '../../../packages/shared/src/services/content/researchService';
import { API_KEY, HAS_API_KEY, loadFixture, logCostSummary } from '../_helpers/runner';
import { llmJudge, formatJudgeResult, type JudgeRubric } from '../_helpers/judge';

interface YtTopic {
  id: string;
  topic: string;
  format: 'youtube-narrator';
  duration: number;
  style: string;
  expectedTraits: string[];
}

interface FixtureSet {
  youtubeNarrator: {
    english: YtTopic[];
    arabic: YtTopic[];
  };
}

// Rubric judges the RESEARCH SUMMARY as research material, not as a finished
// narrator script. Narrative arc / hooks are the script phase's job, not
// research's — including them here tests the wrong thing.
const ENGLISH_RUBRIC: JudgeRubric = {
  relevance: 'summary directly addresses the requested topic without drift',
  factualPlausibility: 'no obvious hallucinations; claims are plausible for a general audience',
  specificity: 'concrete names, dates, places, numbers — not vague generalities',
  coverage: 'spans the main angles of the topic, not just one narrow facet',
  languageQuality: 'natural English; no repetition, no hedging boilerplate, no translation artifacts',
};

const ARABIC_RUBRIC: JudgeRubric = {
  relevance: 'summary directly addresses the requested topic without drift',
  factualPlausibility: 'no obvious hallucinations; claims are plausible for a general audience',
  specificity: 'concrete names, dates, places, numbers — not vague generalities',
  arabicFluency: 'natural fluent Modern Standard Arabic, free of awkward direct translations from English',
  arabicScript: 'predominantly Arabic script (>80%) with no random English words mid-sentence',
};

/** Approximate Arabic-script density. */
function arabicRatio(text: string): number {
  const arabic = text.match(/[؀-ۿ]/g)?.length ?? 0;
  const letters = text.match(/[\p{L}]/gu)?.length ?? 0;
  return arabic / Math.max(letters, 1);
}

describe.skipIf(!HAS_API_KEY)('[BEHAVIORAL] V1 YouTube Narrator quality', () => {
  const fixtures = loadFixture<FixtureSet>('topics.json');
  const research = new ResearchService();

  afterAll(() => {
    logCostSummary('youtube-narrator-quality');
  });

  describe.each(fixtures.youtubeNarrator.english)('English: $id', (topic) => {
    it(
      'produces high-quality English research summary',
      async () => {
        const result = await research.research({
          topic: topic.topic,
          language: 'en',
          depth: 'shallow',
          sources: ['web', 'knowledge-base'],
          maxResults: 5,
        });

        // Hard contract assertions
        expect(result.sources.length, 'must return at least 1 source').toBeGreaterThanOrEqual(1);
        expect(result.confidence, 'confidence must be non-trivial').toBeGreaterThanOrEqual(0.4);
        expect(result.summary.length, 'summary must be substantive').toBeGreaterThan(120);

        // Language guard — English summary must be predominantly Latin script
        const arRatio = arabicRatio(result.summary);
        expect(arRatio, 'English summary should not contain Arabic script').toBeLessThan(0.05);

        // Soft quality gate via LLM judge
        const judgeResult = await llmJudge(result.summary, ENGLISH_RUBRIC, { threshold: 7 });
        // eslint-disable-next-line no-console
        console.log(formatJudgeResult(topic.id, judgeResult));
        expect(judgeResult.passedThreshold, judgeResult.scores.map(s => `${s.dimension}=${s.score}`).join(' ')).toBe(true);
      },
      120_000,
    );
  });

  describe.each(fixtures.youtubeNarrator.arabic)('Arabic: $id', (topic) => {
    it(
      'produces high-quality Arabic research summary',
      async () => {
        const result = await research.research({
          topic: topic.topic,
          language: 'ar',
          depth: 'shallow',
          sources: ['web', 'knowledge-base'],
          maxResults: 5,
        });

        // Hard contract assertions
        expect(result.sources.length, 'must return at least 1 source').toBeGreaterThanOrEqual(1);
        expect(result.confidence, 'confidence must be non-trivial').toBeGreaterThanOrEqual(0.4);
        expect(result.summary.length, 'summary must be substantive').toBeGreaterThan(120);

        // Language guard — Arabic summary must be predominantly Arabic script
        const arRatio = arabicRatio(result.summary);
        expect(arRatio, 'Arabic summary should be predominantly Arabic script').toBeGreaterThan(0.7);

        // Soft quality gate via LLM judge
        const judgeResult = await llmJudge(result.summary, ARABIC_RUBRIC, { threshold: 7 });
        // eslint-disable-next-line no-console
        console.log(formatJudgeResult(topic.id, judgeResult));
        expect(judgeResult.passedThreshold, judgeResult.scores.map(s => `${s.dimension}=${s.score}`).join(' ')).toBe(true);
      },
      120_000,
    );
  });
});
