# RFC: Unify Agent Orchestration on LangGraph

**Status:** Draft
**Author:** architectural review (2026-05-03)
**Owners:** TBD
**Target window:** post-V1 (do not block YouTube Narrator launch)
**Related:** `plans/refactoring-plan.md`, audit memo of 2026-05-03

---

## 1. Problem

The codebase runs **two parallel orchestration paradigms** for the same end goal (turn a user request into a finished video):

| | Workflow | Entry point | Style |
|---|---|---|---|
| **W1** | Format-routed pipelines | `formatRouter.dispatch(formatId)` → `BasePipeline.execute()` | Deterministic Template Method, 8 format pipelines, checkpoint-gated |
| **W2** | Supervisor + subagents | `runProductionAgentWithSubagents()` → `runSupervisorAgent()` | LLM-driven LangChain tool-calling, 4 subagents |

Both call the same Gemini/Imagen/Veo proxies, both write to overlapping state stores (`productionStore` + Zustand `useStoryGeneration`), and both are plumbed through to the UI (`useFormatPipeline` for W1, `studioAgent`/`production` route for W2).

Concrete pain points observed in the audit:

1. **Duplicate state stores.** W1 uses Zustand stores under `packages/shared/src/stores/`; W2 uses an in-memory `productionStore` in `services/ai/production/store.ts`. They do not share schemas. Cross-workflow handoff (e.g. start in chat, finish in format pipeline) is not possible.
2. **Duplicate retry/recovery.** `executeSubagent()` in `subagents/index.ts` reimplements exponential backoff with per-stage strategies. `withRetry()` in `apiClient.ts` does the same at the HTTP layer. `BasePipeline` has its own checkpoint-resume logic. Three retry codepaths, three behaviours.
3. **Duplicate tool registries.** `services/ai/production/tools/` (contentTools, mediaTools, statusTools, storyTools), `services/ai/production/toolRegistration.ts`, plus `services/agent/toolRegistry.ts` and `services/agent/agentTools.ts`. The recent commit `6d93633` already deleted *some* unused machinery here, confirming the area accumulates dead code.
4. **No first-class human-in-the-loop primitive.** W1 implements checkpoints via `checkpointSystem.ts` callbacks. W2 has no equivalent — once the supervisor LLM starts executing, the user cannot intervene mid-flight. The `CheckpointApproval` UI is W1-only.
5. **No persistent run state.** If the server restarts mid-production, both workflows lose state. W1's `cloudAutosave.ts` snapshots periodically, W2's `productionStore` is in-memory only.
6. **Hand-rolled supervisor prompt.** `supervisorAgent.ts` is 608 lines, most of it a giant `SUPERVISOR_AGENT_PROMPT` string trying to teach a Gemini model to call four tools in the right order with the right session ID. This is exactly what graph orchestration libraries solve declaratively.
7. **Story Pipeline is a third half-merged orchestrator.** `services/ai/storyPipeline/` (the legacy `storyMode` engine) is half-deprecated but still used by `BasePipeline` for prompt construction — a third partial implementation on top of the two above.

The cost of leaving this in place compounds: every new format pipeline (item 1 in the V2 roadmap) and every new agent capability (item 2) has to be implemented twice or chosen-one-or-the-other, and the docs (`docs/services/agent-system.md`) are already inconsistent about which path is canonical.

## 2. Goal

**One orchestration substrate** that supports:

- Deterministic format pipelines (today's W1) — fixed DAG with checkpoints
- LLM-driven supervisor (today's W2) — dynamic routing on user intent
- Persistent, resumable runs across server restarts
- First-class human-in-the-loop checkpoints, usable from both styles
- Single retry/error policy, observable via LangSmith
- Single source of truth for run state, queryable from the frontend

**Non-goal:** rewriting BasePipeline's *business logic* (prompts, schemas, format configs). Only the orchestration substrate changes.

## 3. Proposed Approach: LangGraph

[`@langchain/langgraph`](https://langchain-ai.github.io/langgraphjs/) is the canonical choice for this problem because:

- It provides a **typed graph runtime** (`StateGraph`) where nodes are functions over a typed state object — fits both deterministic DAGs (W1) and dynamic routing (W2 via conditional edges + an LLM router node).
- **Checkpointers** (`MemorySaver`, `SqliteSaver`, custom) persist the full graph state at every node boundary. A Firestore checkpointer adapter is straightforward (we already write Firestore in `cloudAutosave.ts`).
- **Interrupts** (`interrupt()` / `Command(resume=...)`) are the human-in-the-loop primitive. This replaces `checkpointSystem.ts` callbacks 1:1 with a runtime-supported primitive that survives server restart.
- **Streaming** out of the box (`stream("updates")`) — replaces the bespoke `ProductionEvent` SSE handler in `routes/production.ts` and `useFormatPipeline.ts`.
- **First-class LangSmith tracing** — already wired in the project (`tracing/` service).
- We are already a heavy LangChain consumer (`@langchain/core`, `@langchain/google-genai`, `@langchain/community` in deps).

### Alternatives considered

- **Inngest / Temporal / Restate** — durable workflow engines. Better resume semantics than LangGraph, but they require a separate worker runtime and are overkill for an in-process video studio. Re-evaluate if we ever go multi-worker for AI tasks.
- **Vercel AI SDK + custom DAG** — clean retry/streaming, but no graph primitive or checkpointer. We'd be rebuilding LangGraph minus the human-in-the-loop story.
- **Keep status quo, just delete `agentCore` overlap** — cheapest, but does nothing for items 1, 2, 4, 5, 6. Defers the same decision.
- **Roll our own state machine** — already tried (`agentCore` + `parallelExecutionEngine` + `checkpointSystem` are fragments of one). Adding a fourth fragment doesn't help.

LangGraph is the smallest substrate that fixes 1–6 without forcing a process-model change.

## 4. Target Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend                                                            │
│  StudioScreen → useProductionRun(runId)                             │
│      └── streams updates from /api/production/:runId/events (SSE)   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│ Express server (packages/server)                                    │
│  POST /api/production/start  → creates LangGraph run, returns runId │
│  GET  /api/production/:id/events → graph.stream(...) → SSE          │
│  POST /api/production/:id/resume → graph.invoke(Command(resume=…))  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│ LangGraph runtime (packages/shared/src/services/orchestrator)       │
│                                                                     │
│   StateGraph<ProductionState>                                       │
│     ├── node: classifyIntent  (LLM router — replaces supervisor)    │
│     ├── node: formatPipeline  (deterministic; calls existing        │
│     │                          BasePipeline.execute internals as    │
│     │                          sub-nodes)                           │
│     ├── node: import          (was importSubagent)                  │
│     ├── node: content         (was contentSubagent)                 │
│     ├── node: media           (was mediaSubagent)                   │
│     ├── node: enhancementExport (was enhancementExportSubagent)     │
│     └── node: checkpoint(name) (interrupt() — pauses run)           │
│                                                                     │
│   Checkpointer: FirestoreSaver (custom adapter over storySync)      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│ Tool layer (unchanged)                                              │
│  apiClient (Gemini/Imagen/Veo proxies)                              │
│  imageService / narratorService / videoGenService                   │
│  parallelExecutionEngine (kept — it's a fan-out helper, not an      │
│                          orchestrator)                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Single state shape

```typescript
// packages/shared/src/services/orchestrator/state.ts
export interface ProductionGraphState {
  runId: string;
  projectId: string;
  userRequest: string;
  language: LanguageCode;
  formatId?: FormatId;        // set by classifyIntent if W1-style
  mode: 'format' | 'supervisor'; // routing decision

  // Stage outputs (replace productionStore + storyMode store)
  importedContent?: ImportedContent;
  contentPlan?: ContentPlan;
  screenplay?: Screenplay;
  visuals: GeneratedImage[];
  narrationSegments: NarrationSegment[];
  exportResult?: ExportResult;

  // Cross-cutting
  checkpoints: CheckpointRecord[];   // every interrupt() lands here
  errors: ToolError[];
  costAccrued: number;
}
```

Both W1 and W2 reduce into the *same* state object — no more dual stores.

### Checkpoints become first-class

```typescript
// Before (W1 only):
await checkpointSystem.requestApproval('breakdown', { breakdown });

// After (works for both deterministic and supervisor flows):
const approved = await interrupt({
  type: 'breakdown_approval',
  data: state.contentPlan,
});
return { contentPlan: approved };
```

The frontend `CheckpointApproval` component re-points at the `/resume` endpoint; UX is unchanged.

## 5. Migration Plan (Phased)

Each phase is independently shippable and reversible.

### Phase 0 — Spike & guardrails (1 week)

- Add `@langchain/langgraph` dep; build a throwaway "hello graph" in `services/orchestrator/spike.ts` to validate Vertex AI credential flow + LangSmith trace export.
- Implement `FirestoreSaver` checkpointer adapter against existing `storySync` — unit-test resume after kill.
- Define `ProductionGraphState` Zod schema; do not wire it yet.
- **Exit criteria:** spike runs end-to-end with one fake "node", checkpointer survives a server restart in test, LangSmith trace appears.

### Phase 1 — Wrap W2 (supervisor) in LangGraph (1–2 weeks)

- Build the four subagent-equivalent nodes (`import`, `content`, `media`, `enhancementExport`) by *calling the existing functions inside `subagents/*Subagent.ts`* — no logic change.
- Replace `runSupervisorAgent` with a `StateGraph` whose conditional edges emulate the current sequential routing (the supervisor's "delegate to X" tool calls become graph edges).
- New endpoint: `POST /api/production/v2/start` → graph runtime. Old `/api/production/start` keeps calling `runProductionAgentWithSubagents` unchanged.
- Feature flag `PRODUCTION_USE_LANGGRAPH=true` toggles which path the studio chat hits.
- **Exit criteria:** chat-style production produces equivalent output on a 5-prompt golden set; A/B in dev, soak for 1 week.

### Phase 2 — Migrate W1 (BasePipeline) (2–3 weeks)

- Re-express `BasePipeline.execute()` as a graph: `setupSession → buildBreakdown → checkpoint → buildScreenplay → checkpoint → fanOutVisuals → narrate → assemble`. The 8 format pipelines become *config inputs* to the graph, not subclasses.
- `parallelExecutionEngine.ts` is wrapped as a node helper — kept as-is, it's a useful fan-out primitive orthogonal to orchestration.
- `checkpointSystem.ts` is replaced by `interrupt()` calls. The `useFormatPipeline` hook is rewritten to subscribe to the graph stream and call `/resume` on approval.
- Cutover one format at a time behind `FORMAT_PIPELINE_USE_LANGGRAPH={youtube-narrator|...}`. Start with the lowest-traffic format (advertisement or shorts). YouTube Narrator goes last because V1.
- **Exit criteria:** all 8 formats produce identical exports vs. legacy on a 16-case test matrix (2 languages × 8 formats); checkpoint resume works after server kill.

### Phase 3 — Delete duplicate substrate (1 week)

Once both Phase 1 and Phase 2 are flag-defaulted on for ≥2 weeks:

- Delete `services/ai/production/agentCore.ts`, `errorHandler.ts`, `productionApi.ts` server-side runner, `toolRegistration.ts`, `storyService.ts`.
- Delete `services/ai/subagents/index.ts` `executeSubagent` retry, `supervisorAgent.ts` (entire file), all four `*Subagent.ts` files.
- Delete `services/agent/toolRegistry.ts`, `agent/agentTools.ts`, `agent/intentDetection.ts` (if only the supervisor used it — verify).
- Keep: `services/ai/production/{store.ts, persistence.ts, types.ts, parallelExecutionEngine.ts, resultCache.ts, utils.ts}` — these become orchestrator-graph utilities.
- `services/ai/storyPipeline/` is reduced to the prompt strings only (`prompts.ts`, `schemas.ts`); `pipeline.ts` and `stages.ts` are deleted (their logic is now graph nodes).
- Update `docs/services/agent-system.md` to describe one path.

**Net code delta (estimate):** −3,500 LOC subagents + agentCore + storyPipeline runner; +1,500 LOC graph + nodes + checkpointer adapter. Net **~−2,000 LOC**.

## 6. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LangGraph JS API breaks (it's pre-1.0) | M | M | Pin minor; vendor types if needed; budget 2 days/quarter for upgrades |
| Vertex AI credential flow incompatible with LangGraph's tool-call abstraction | L | H | Validated in Phase 0 spike before any migration code lands |
| Checkpointer write amplification on Firestore | M | M | Phase 0 measures write count per run; if >50 writes, switch to SqliteSaver locally + Firestore snapshot at run end |
| Behavioural drift between legacy & graph path during dual-run | H | M | Golden-set diff harness in Phase 1; block flag-flip on regression |
| Mid-migration bug strands a real user run | M | H | Both paths stay live behind flags through all of Phase 1 + 2; no DB schema changes until Phase 3 |
| Scope creep: rewriting prompts/schemas under the migration banner | H | H | RFC explicitly bans logic changes — every PR must show input/output equivalence |

## 7. Success Metrics

- **Code:** `agent/`, `subagents/`, `storyPipeline/` runner directories deleted. Single graph definition in `services/orchestrator/`.
- **Reliability:** 0 cross-stage state-loss bugs (today: 1–2/month per Linear).
- **Observability:** every production run has a single LangSmith trace covering all stages (today: traces only span individual LangChain tool calls).
- **Resume:** killing the server mid-production resumes successfully on restart in 100% of integration tests (today: 0%).
- **Time-to-add-format:** new format pipeline lands as `<200 LOC` of config + graph node mapping (today: ~500 LOC subclass + 2 prompt files).

## 8. Open Questions

1. **Do we need workflow versioning?** A run started under graph v1 will fail to resume after we ship graph v2. LangGraph supports versioned schemas; decide before Phase 1 whether to bake in a `graphVersion` field on day one.
2. **Frontend SSE vs. WebSocket.** Current SSE works but `interrupt()` resume is bidirectional. WebSocket would be cleaner; SSE + POST-resume is simpler. Default: keep SSE + POST.
3. **Fate of `studioAgent.ts`.** Is it a third orchestrator layer, a thin wrapper, or dead? Audit during Phase 0.
4. **Tool registry consolidation.** `agent/toolRegistry.ts` vs `production/toolRegistration.ts` — can both be replaced by the single tool list each graph node owns inline?
5. **W2 (chat-style) future.** With LangGraph in place, do we keep a free-form chat entry point at all, or fold it into format pipelines as `formatId: 'auto'` that runs `classifyIntent → ...`? Recommend the latter to prevent the bifurcation from re-emerging.

## 9. Decision Requested

- Approve the phased approach (Phase 0 spike first, no big-bang rewrite).
- Sign off on LangGraph as the substrate (vs. Inngest / build-our-own).
- Confirm V2 timing: this work starts **after** the YouTube Narrator V1 ships, not before.
- Owner assignment for Phase 0.

---

*Companion cleanup items (independent of this RFC): items 1, 3, 4, 5, 7 from the 2026-05-03 audit memo. Item 6 (lock down `@studio/shared` exports) should land **after** this RFC's Phase 3, since the export surface will change significantly.*
