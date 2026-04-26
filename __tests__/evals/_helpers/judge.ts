/**
 * LLM-as-judge for soft quality scoring.
 *
 * The judge model (Gemini 3.1 Pro by default) reads an output + a rubric
 * and returns a structured score. Use this for outputs that vary run to
 * run (narration text, scene descriptions) where exact-match snapshotting
 * would fail constantly.
 *
 * Rubric format: a JSON object whose keys describe quality dimensions
 * and values describe the 1-10 scale. The judge returns one score per key
 * plus a single-sentence reasoning per key.
 *
 * Cost: one Pro call per judgement (~$0.05 for short outputs).
 */

import { ai } from '../../../packages/shared/src/services/ai/apiClient';
import { API_KEY, trackCall } from './runner';

export interface JudgeRubric {
  /** dimension name -> short description of what 10/10 looks like */
  [dimension: string]: string;
}

export interface JudgeScore {
  dimension: string;
  score: number; // 1-10
  reasoning: string;
}

export interface JudgeResult {
  scores: JudgeScore[];
  averageScore: number;
  passedThreshold: boolean;
}

const JUDGE_MODEL = 'gemini-3.1-pro-preview';

interface JudgeOptions {
  /** Minimum average score to consider the output acceptable (default 7). */
  threshold?: number;
  /** Override the judge model (e.g., use Flash for cheaper judging). */
  model?: string;
}

export async function llmJudge(
  output: string,
  rubric: JudgeRubric,
  options: JudgeOptions = {},
): Promise<JudgeResult> {
  if (!API_KEY) {
    throw new Error('llmJudge requires GEMINI_API_KEY. Run with the env var set.');
  }

  const threshold = options.threshold ?? 7;
  const model = options.model ?? JUDGE_MODEL;

  const dimensions = Object.entries(rubric)
    .map(([key, desc]) => `- ${key}: ${desc}`)
    .join('\n');

  const prompt = `You are an impartial quality judge. Read the OUTPUT below and rate it on each dimension (1-10 where 10 is exceptional and 1 is unusable).

DIMENSIONS:
${dimensions}

OUTPUT:
"""
${output}
"""

Respond with ONLY valid JSON in this exact shape, no markdown fences:
{
  "scores": [
    { "dimension": "<dimension-name>", "score": <1-10>, "reasoning": "<one sentence>" }
  ]
}
Include every dimension exactly once.`;

  const response = await trackCall(model, () =>
    ai.models.generateContent({
      model,
      contents: prompt,
      config: { temperature: 0, maxOutputTokens: 1024 },
    }),
  );

  const text = (response as { text?: string }).text ?? '';
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');

  let parsed: { scores: JudgeScore[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Judge returned non-JSON response: ${text.slice(0, 200)}... ` +
        `(parse error: ${(err as Error).message})`,
    );
  }

  if (!Array.isArray(parsed.scores) || parsed.scores.length === 0) {
    throw new Error(`Judge response missing scores array: ${text.slice(0, 200)}`);
  }

  const averageScore =
    parsed.scores.reduce((sum, s) => sum + s.score, 0) / parsed.scores.length;

  return {
    scores: parsed.scores,
    averageScore,
    passedThreshold: averageScore >= threshold,
  };
}

/** Pretty-print a JudgeResult for test output. */
export function formatJudgeResult(label: string, result: JudgeResult): string {
  const lines = [
    `[judge] ${label}: avg ${result.averageScore.toFixed(1)}/10 ${result.passedThreshold ? '✓' : '✗'}`,
    ...result.scores.map(
      (s) => `  ${s.dimension}: ${s.score}/10 — ${s.reasoning}`,
    ),
  ];
  return lines.join('\n');
}
