# Subagent Prompts — Improvement Proposal (2026-05-03)

**Scope:** 5 system prompts driving the production pipeline (supervisor, content, media, import, enhancement/export) plus the agent loop in `subagents/index.ts:executeSubagent`.

**Method:** read all 5 prompts in their current form, compared against published 2026 best practices for LLM agent prompts (Anthropic prompt engineering docs, Vertex/Firebase Gemini structured-output guides, recent independent benchmarks). Key sources at the end of this doc.

**Relationship to prior audit:** the [2026-04-21 audit](./subagent-prompts-audit-2026-04-21.md) caught several CRIT items (language threading, animation/feature drift, hardcoded session IDs in examples). Most of those are now fixed in the current prompts — the supervisor and content prompts have explicit `## CRITICAL: LANGUAGE PROPAGATION` / `## CRITICAL: LANGUAGE CONSISTENCY` blocks, and example session IDs use `<SESSION_ID>` placeholders. This doc focuses on the **structural** issues that remain.

---

## TL;DR

The five prompts share five chronic problems that current best practice solves with one architectural shift each:

| Problem (current) | Best practice (2026) | Estimated win |
|---|---|---|
| String-match completion (`includes("Content complete")`) | Structured completion via a `report_done` tool call | Eliminates a class of timeout bugs; saves iterations |
| Supervisor prompt is ~3,500 tokens of narrative + 5 worked examples | 200–800 tokens system + dynamic context injection per call | Faster, cheaper, fewer "lost the plot" failures |
| Same 5-line session-ID rule duplicated in 5 prompts (~50 lines, ~750 tokens repeated per turn — multiplied across iterations) | One shared "agent kernel" + small subagent overlay | -10% to -20% prompt tokens, single source of truth |
| `sessionId` (input) vs `contentPlanId` (tool arg) — taxonomy mismatch every prompt has to explain | Pick one name across the whole protocol | Removes the most common cause of placeholder hallucinations |
| Quality thresholds, format options, available styles hard-coded in prompt prose | Single source of truth = the tool schema; prompt references it | Drift-free; tool changes don't require prompt edits |

None of these are language/correctness bugs. They're token-efficiency, reliability, and maintenance issues — exactly what compounds when you add format pipelines #9 and #10.

---

## 1. Replace string-match completion with a tool-call exit signal

### What's there now

`subagents/index.ts:executeSubagent` and each subagent's invoke loop exit when the model emits an exact substring:

| Subagent | Exit condition |
|---|---|
| Supervisor | `content.includes("Production complete")` |
| Content | `content.includes("Content complete") && content.includes("Score:")` |
| Media | `content.includes("Media complete") && content.includes("Visuals:")` |
| Export (browser) | `"Export complete"` + (`"Format:"` ∨ `"available locally"`) |
| Export (node) | `"Export complete"` + `"Format:"` |
| Import | `content.includes("Import complete")` |

### Why it's brittle

Gemini paraphrases. *"Production is now complete."* / *"All done — production finished successfully."* / *"Production: ✓ complete."* none match `includes("Production complete")`. When the model paraphrases, the loop burns iterations until `MAX_ITERATIONS` throws — a noisy class of failures that looks like a model regression but is actually a prompt-protocol bug.

### What 2026 best practice says

> Define what "done" means (schema match, terminal tool call, sentinel field) — don't rely on the model to decide on its own.
> — *[Morph: LLM Workflows Patterns 2026](https://www.morphllm.com/llm-workflows)*

> When you want to make requests to an external API, when you've given the model multiple tools/functions to choose from (multi-agent systems) … use Function Calling with Structured Outputs.
> — *[Vellum on function calling vs structured outputs](https://www.vellum.ai/blog/when-should-i-use-function-calling-structured-outputs-or-json-mode)*

### Concrete fix

Add a `report_done` terminal tool to each subagent's tool list, with a Zod schema capturing what the supervisor wants to know:

```ts
// packages/shared/src/services/ai/production/tools/completionTools.ts
export const reportContentDone = tool(
  async ({ score, sceneCount, totalDuration, language }) => ({ ok: true }),
  {
    name: "report_content_done",
    description: "Call this exactly once when content stage is complete. The agent loop will exit.",
    schema: z.object({
      score: z.number().min(0).max(100),
      sceneCount: z.number().int().positive(),
      totalDuration: z.number().positive(),
      language: z.string().min(2).max(5),
    }),
  },
);
```

Loop exit condition becomes:

```ts
const doneCall = response.tool_calls?.find(t => t.name === "report_content_done");
if (doneCall) {
  return { success: true, ...doneCall.args };
}
```

Side benefit: the supervisor receives **structured** stage results instead of having to regex-parse `"Score: 87/100. Scenes: 12. Duration: 90s."` out of a string.

---

## 2. Slim the supervisor prompt; inject context per-call

### What's there now

`SUPERVISOR_AGENT_PROMPT` in `supervisorAgent.ts:50` is ~250 lines, ~3,500 tokens. It contains:

- 25 lines on session-ID handling (repeated by every subagent)
- 35 lines explaining the 4 subagents (already encoded in their tool schemas)
- 50 lines on workflow stages with embedded examples
- 60 lines of three worked examples (coffee, YouTube import, Arabic vertical)
- 20 lines on error recovery (overlaps with `getRecoveryStrategy`)
- 20 lines of constraints / success criteria (most could be enforced by tool schemas)

### Why it matters

> A customer support agent with a 3,000-token system prompt can perform noticeably worse at multi-step reasoning than the same model with a 400-token version.
> — *[BuildMVPFast: System Prompt Design Best Practices 2026](https://www.buildmvpfast.com/blog/system-prompt-design-best-practices-llm-instructions-engineering-2026)*

> Keep your base system prompt lean (200-800 tokens) while still giving the model everything it needs per task. Think of it like environment variables versus function arguments — the system prompt is the environment, the per-request context is the function call.

The supervisor prompt is roughly 4-7× the recommended size. Worse, it's the same 3,500 tokens on **every iteration of every production**, not just once.

### Concrete fix

Split into `STATIC_SUPERVISOR_PROMPT` (~600 tokens — role, hard constraints, output contract) and a runtime `buildSupervisorContext({ userRequest, language, formatHints })` (~200 tokens — only the parts that vary per request). The three worked examples (coffee, YouTube, Arabic vertical) move to a separate `examples/` collection that the model retrieves only when intent is ambiguous, or are dropped entirely once the `report_done` tool-call exit signal makes them less load-bearing.

Worked examples are valuable, but three of them in every prompt are paying for the worst case (model is a fresh employee on day 1). Keep one minimal example that covers the happy path and lean on the tool schemas for the rest.

---

## 3. Extract a shared "agent kernel" — DRY the boilerplate across 5 prompts

### What's there now

These blocks appear in 4 of 5 subagent prompts, near-identically:

- "## CRITICAL: SESSION ID HANDLING / USAGE" (5–10 lines per prompt, ~120 lines total)
- "NEVER use placeholder values like 'plan_123', 'cp_01', 'session_123', 'prod_video_plan'…" (verbatim in 4 prompts)
- "ALWAYS use the ACTUAL sessionId provided in your instructions (format: prod_TIMESTAMP_HASH)" (verbatim in 4 prompts)
- Auto-fetch warnings ("DO NOT provide narrationUrl — auto-fetched") (export prompt only, but pattern repeats per-tool)
- "Music generation is not available in video production mode" (3× in supervisor, 2× in media)

### Why it matters

Beyond tokens, it's a maintenance hazard. When you change "session ID format is now `prod_…`" to something else, you have to find and edit it in five files. It also confuses the model — repeating the same rule 3× implies the rule is fragile, which paradoxically makes the model more likely to violate it.

### Concrete fix

Define a single `AGENT_KERNEL` constant (~150 tokens) that contains the universal rules: session ID protocol, mode constraints (video-mode music ban), language propagation contract, error recovery contract. Import it into each subagent prompt with a simple template:

```ts
const CONTENT_SUBAGENT_PROMPT = `
${AGENT_KERNEL}

You are the Content Subagent. ${ROLE_SPECIFIC_CONTENT}
${CONTENT_SPECIFIC_RULES}
${CONTENT_TOOLS_OVERVIEW}
`;
```

This is just the same DRY hygiene you'd apply to TypeScript, applied to prompt strings. `subagents/index.ts` is the natural home for `AGENT_KERNEL`.

---

## 4. Pick one name: `sessionId` OR `contentPlanId`, not both

### What's there now

The protocol uses **`sessionId`** as the input to subagents and **`contentPlanId`** as the tool argument. Every subagent prompt spends 4–7 lines telling the model "use the sessionId as the contentPlanId":

> "When you call plan_video, it returns a sessionId (format: prod_TIMESTAMP_HASH). You MUST use this EXACT sessionId as the contentPlanId parameter for ALL subsequent tool calls" — content prompt
> "You will receive a sessionId in your instructions. You MUST use this EXACT sessionId as the contentPlanId parameter for ALL tool calls." — media + export prompts

This taxonomy mismatch is the **root cause** of the placeholder-ID hallucinations the prompts are trying to defend against. The model sees two names, infers that they might be different things, and fills in the gap with a placeholder.

### Why it matters

> System prompts should define the agent's role, available tools, constraints, and expected workflow patterns. Keep them focused and **avoid contradictory instructions**.
> — *[aiwithgrant: Context Engineering for Agents](https://www.aiwithgrant.com/guides/anthropic-context-engineering-agents)*

Using two names for the same value is a textbook contradictory instruction.

### Concrete fix

Rename `contentPlanId` → `sessionId` everywhere in the tool schemas (`production/tools/*.ts`). One PR, mechanical, breaks no external API (these are internal Zod tool schemas — the HTTP API uses `sessionId` already in `productionApi.ts`). Drops ~40 lines of "use the sessionId as contentPlanId" defensive prose from the prompts and removes the most common failure mode.

---

## 5. Stop hard-coding tool-owned values in prompts

### What's there now

Hardcoded in prompt prose:

- Quality threshold ("85-100 Approved / 70-84 Needs improvement / Below 70 Major issues") in content prompt — but `validate_plan` already returns a score, and the threshold for `needsImprovement` lives in the tool.
- Available restyle options ("Anime, Watercolor, Oil Painting, Sketch, Pop Art, Cyberpunk, etc.") in export prompt — but the `restyle_image` tool's Zod enum is the actual source of truth.
- Aspect ratios ("16:9 / 9:16 / 1:1") and formats ("mp4 / webm") in multiple prompts — duplicated from tool schemas.
- "Gemini TTS (24kHz, mono, WAV)" — implementation detail that will drift the moment we change the TTS model.

### Why it matters

> Use clear descriptions in your schema to provide instructions to the model — this is crucial for guiding the model's output.
> — *[Google Gemini structured-output docs](https://ai.google.dev/gemini-api/docs/structured-output)*

> If there are any descriptions, schemas, or examples in the prompt, they must present the same property ordering as is specified in the responseSchema. A mismatch in ordering can confuse the model and lead to incorrect or malformed output.
> — *[Google Developers Blog: Mastering Controlled Generation](https://developers.googleblog.com/en/mastering-controlled-generation-with-gemini-15-schema-adherence/)*

Tool schemas with rich `.describe()` text on each Zod field are the canonical Gemini-native way to communicate constraints. Duplicating those constraints in the prompt is both wasted tokens and a drift hazard.

### Concrete fix

For every constraint that's also a tool argument: delete it from the prompt; ensure the corresponding Zod field has a clear `.describe()` string. The model gets schema-enforced choices instead of paraphrased prose. Field descriptions also flow into Gemini's `controlled decoding`, which is more reliable than prompt instructions.

---

## 6. Other smaller wins worth bundling

| # | Issue | Fix |
|---|---|---|
| 6.1 | Browser-vs-Node export prompt has two near-identical 60-line workflow + examples blocks | Single template + `if (isNode) { ... cloudUploadSection }` |
| 6.2 | Music exclusion repeated 3× in supervisor, 2× in media | Once, in `AGENT_KERNEL` under "MODE CONSTRAINTS" |
| 6.3 | Scene-count framework is 45 lines of complexity prose | 5-row complexity → scene-count table + 1 example |
| 6.4 | "Smart default" SFX rule in media subagent can override supervisor's `sfx: false` | Make supervisor SSOT; smart-default fires only when supervisor passed `undefined` |
| 6.5 | Prompts do not mention "if a tool returns an error, retry with the error message included" — one of the highest-leverage 2026 practices | Add a 3-line "ON TOOL ERROR" block to `AGENT_KERNEL` |
| 6.6 | Each subagent prompt has its own ad-hoc completion phrase ("Content complete." / "Media complete.") | Subsumed by the `report_done` tool from §1 |
| 6.7 | No `<example>` / `<instructions>` XML structure (Gemini also benefits from it; Claude is trained on it specifically) | Optional — Gemini benefits more from heading hierarchy than XML, so this one is low priority for our model fleet |

> When models call tools incorrectly, returning tool results that explain the error allows the model to recover and try again rather than raising exceptions. This resilient design pattern should be embedded in system prompts.
> — *[Maxim AI: Importance of System Prompts in Shaping AI Agent Responses](https://www.getmaxim.ai/articles/the-importance-of-system-prompts-in-shaping-ai-agent-responses/)*

---

## Suggested execution plan

Each of these is independently shippable behind feature flags or A/B against a golden set. **None block V1 (YouTube Narrator).** They're best done after V1 ships, before adding format pipelines beyond the 8 already implemented.

| Phase | Items | Estimated effort | Risk |
|---|---|---|---|
| **A. Quick wins** | §4 sessionId/contentPlanId rename, §6.2 music dedupe, §6.3 scene-count table, §5 deduping tool-owned values | 1 day | Low (mechanical) |
| **B. Structured completion** | §1 `report_done` tools, §6.6 phrase removal, §6.4 SFX SSOT fix | 2 days + golden-set diff | Medium — changes loop semantics; A/B against legacy |
| **C. Refactor kernel** | §2 supervisor slim-down, §3 `AGENT_KERNEL` extraction, §6.1 export-prompt dedupe, §6.5 tool-error-recovery rule | 2–3 days | Medium — touches every subagent; needs golden-set parity |

Total: ~1 week of focused work for a measurable reduction in token burn, an end to the paraphrase-induced timeout class, and dramatically less prompt boilerplate to maintain when the LangGraph migration (RFC) eventually starts.

**Crucially:** Phase A alone delivers ~30% of the value at <20% of the cost. If only one phase ships, ship Phase A.

---

## Sources

- [Anthropic — Use XML tags to structure your prompts](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags)
- [Anthropic — Let Claude think (chain of thought prompting)](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought)
- [Anthropic — Prompting best practices (Claude API Docs)](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [Context Engineering for Agents — aiwithgrant (Anthropic)](https://www.aiwithgrant.com/guides/anthropic-context-engineering-agents)
- [System Prompt Design Best Practices — BuildMVPFast 2026](https://www.buildmvpfast.com/blog/system-prompt-design-best-practices-llm-instructions-engineering-2026)
- [Morph — LLM Workflows: Patterns, Tools & Production Architecture (2026)](https://www.morphllm.com/llm-workflows)
- [Maxim AI — The Importance of System Prompts in Shaping AI Agent Responses](https://www.getmaxim.ai/articles/the-importance-of-system-prompts-in-shaping-ai-agent-responses/)
- [Google AI for Developers — Structured outputs (Gemini API)](https://ai.google.dev/gemini-api/docs/structured-output)
- [Google Cloud — Structured output (Vertex AI)](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output)
- [Google Developers Blog — Mastering Controlled Generation with Gemini 1.5](https://developers.googleblog.com/en/mastering-controlled-generation-with-gemini-15-schema-adherence/)
- [Vellum — When should I use function calling, structured outputs or JSON mode?](https://www.vellum.ai/blog/when-should-i-use-function-calling-structured-outputs-or-json-mode)
- [Steve Kinney — Prompt Engineering Across the OpenAI, Anthropic, and Gemini APIs](https://stevekinney.com/writing/prompt-engineering-frontier-llms)
- [Dylan Castillo — The good, the bad, and the ugly of Gemini's structured outputs](https://dylancastillo.co/posts/gemini-structured-outputs.html)
- [Lakera — The Ultimate Guide to Prompt Engineering in 2026](https://www.lakera.ai/blog/prompt-engineering-guide)
