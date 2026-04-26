# Eval Harness

Quality regression suite for AI Soul Studio. Distinct from unit tests — these
exercise real AI behavior end-to-end and judge quality, not correctness.

## Why this exists

Unit tests verify code; evals verify AI quality. When you swap a model, tweak
a prompt, or refactor a pipeline, the unit tests will pass but the actual
output quality may regress invisibly. Evals catch that.

## Structure

```
__tests__/evals/
├── _helpers/           # cost tracking, snapshot, LLM-as-judge
├── fixtures/           # input topics (JSON)
├── snapshots/          # gitignored — recorded outputs for replay
├── structural/         # *.eval.ts — no API calls (free, fast)
└── behavioral/         # *.eval.ts — real API calls (skipped without GEMINI_API_KEY)
```

## Running

```bash
# All evals (structural always run; behavioral skip without API key)
pnpm test:eval

# Re-record snapshots (use after intentional changes)
# bash:  UPDATE_SNAPSHOTS=true pnpm test:eval
# cmd:   set UPDATE_SNAPSHOTS=true && pnpm test:eval

# Single file
pnpm exec vitest run --config vitest.eval.config.ts __tests__/evals/structural/format-coverage.eval.ts
```

## Cost expectations

Behavioral evals call real Gemini APIs. Approximate costs (Jan 2026 pricing):

| Eval | Calls | Approx cost per run |
|---|---|---|
| `structural/format-coverage` | 0 | $0.00 |
| `behavioral/content-quality` | ~15 (5 topics × subagent + judge) | ~$0.25 |

A `costTracker` records every API call. End-of-run summary prints total spend.

**Run manually before merging risky AI changes. Not wired into CI** — that
would burn money on every PR. Add to CI nightly only after you've watched
actual costs over a few weeks.

## Adding fixtures

Edit `fixtures/topics.json`. Each topic is one eval case:

```json
{
  "id": "en-news-something",
  "topic": "Plain-English topic the model will research",
  "format": "news-politics",
  "duration": 60,
  "style": "Cinematic"
}
```

Use stable, neutral topics. Avoid current events that move under the model's
feet — pick scenarios where "good output" looks the same in 6 months.

## Writing a new eval

Two patterns to choose from.

### Structural (no API)

```ts
import { describe, it, expect } from 'vitest';

describe('[STRUCTURAL] What this checks', () => {
  it('asserts a thing', () => {
    // Pure code — registry contents, type validity, etc.
  });
});
```

### Behavioral (real API + LLM judge)

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { HAS_API_KEY, logCostSummary } from '../_helpers/runner';
import { llmJudge, formatJudgeResult } from '../_helpers/judge';

describe.skipIf(!HAS_API_KEY)('[BEHAVIORAL] What this checks', () => {
  afterAll(() => logCostSummary('my-eval'));

  it('produces high-quality output', async () => {
    const output = await callRealAI(/* ... */);
    const judge = await llmJudge(output, {
      relevance: 'directly addresses the request',
      clarity: 'reads naturally',
    });
    console.log(formatJudgeResult('case-1', judge));
    expect(judge.passedThreshold).toBe(true);
  }, 300_000);
});
```

## When NOT to add an eval

- **Determinism** — if the output should be byte-identical, write a unit test, not an eval.
- **Schema correctness** — Zod / TypeScript should catch this; eval is for behavior.
- **Single-call timing** — performance regressions go in benchmarks, not evals.

## Snapshot policy

Snapshots in `snapshots/*.snap.json` are **gitignored by default** while the
eval suite is young, so in-flight recordings don't pollute commits. Once a
snapshot is stable and reviewed, remove the gitignore line for that path
to track it.

## Future work

- [ ] CI integration (cost-gated, nightly)
- [ ] Per-pipeline behavioral evals (each of the 8 formats)
- [ ] Cost dashboard accumulating runs over time
- [ ] Snapshot recording mode for deterministic prompts
- [ ] Diff-based regression detection (judge before/after, not pass/fail)
