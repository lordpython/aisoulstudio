# Subagent Prompts Audit — 2026-04-21

**Scope:** 5 live system prompts driving the production pipeline.
**Deliverable:** findings report only, no code changes.
**Priority axes:** output quality/reliability, multilingual correctness, internal consistency.

## 1. Executive Summary

1. **Animation feature is half-deprecated and silently downgraded.** The supervisor still advertises an `animation: boolean` parameter, detects the "animated" keyword, and passes `animation: true` downstream. The media subagent has animation hard-disabled — it drops the flag and produces static images. Users who ask for "an animated video" receive a slideshow with no error message. **CRIT**.
2. **Language / locale is never threaded into the prompts.** Four of five prompts make zero mention of `language` / `LanguageCode`, despite the pipeline being multilingual. The `plan_video` tool defaults to **`"ar"` (Arabic)** at [contentTools.ts:99](packages/shared/src/services/ai/production/tools/contentTools.ts:99) while `generate_subtitles` defaults to `"en"` at [contentTools.ts:177](packages/shared/src/services/ai/production/tools/contentTools.ts:177). Two different defaults, neither visible to the model. **CRIT**.
3. **Completion signals are brittle string matches.** Every subagent loop exits only when the model emits an exact literal (`"Content complete"` + `"Score:"`, `"Media complete"` + `"Visuals:"`, `"Export complete"` + `"Format:"`). Any paraphrase burns iterations until `MAX_ITERATIONS` throws. **HIGH**.
4. **Supervisor vs Media SFX policy conflict.** Supervisor treats SFX as an explicit boolean from the user; media subagent applies "SMART DEFAULT: ALWAYS include SFX for immersive styles" — so `sfx: false` from supervisor may still call `plan_sfx`. **MED**.
5. **Session-ID terminology is noisy.** Every subagent prompt spends ~5 lines reconciling `sessionId` (input) with `contentPlanId` (tool param). Prompts also hard-code example values like `prod_1768266562924_r3zdsyfgc` in ~10 places. Both increase the risk the model copy-pastes the example instead of the real ID. **MED**.

## 2. Runtime Baseline (confirmed)

- Entry: [StudioScreen.tsx](packages/frontend/screens/StudioScreen.tsx) → [useVideoProductionRefactored.ts:130](packages/frontend/hooks/useVideoProductionRefactored.ts:130) `startProduction()`
- HTTP: `POST /api/production/start`, payload in [productionApi.ts:26](packages/shared/src/services/ai/production/productionApi.ts:26) (includes `language?: string`)
- Server: [production.ts:281](packages/server/routes/production.ts:281) → `runProductionAgentWithSubagents`
- Model: Gemini `MODELS.TEXT` via `ChatGoogleGenerativeAI`. Temps: Supervisor 0.1, Content 0.3, Media 0.4, Export 0.2, Import 0.1.
- Tool names in prompts match registry [toolRegistration.ts:129-292](packages/shared/src/services/ai/production/toolRegistration.ts:129) exactly. Auto-fetch verified for `mix_audio_tracks`, `export_final_video`, `generate_subtitles`.

---

## 3. Per-Prompt Findings

### 3.1 `SUPERVISOR_AGENT_PROMPT` — [supervisorAgent.ts:50](packages/shared/src/services/ai/subagents/supervisorAgent.ts:50)

| Sev | Line | Issue | Fix sketch |
|---|---|---|---|
| CRIT | 106, 232-234 | Advertises animation keyword detection + Example 2 calls `animation: true`, but media subagent has animation disabled. Produces silent feature downgrade. | Either remove animation from prompt + tool schema, or restore `animate_image` in media subagent and the downstream flow. Pick one. Also tell the user in the completion report when a requested feature was unavailable. |
| CRIT | whole | No `language` / locale guidance. Supervisor never mentions passing `language` to `delegate_to_content_subagent`. | Add a `## LANGUAGE` section: "If user specified a language or wrote in a non-English language, pass `language: <code>` to content subagent. Supported codes: see LanguageCode." Also add `language` to the `delegate_to_content_subagent` Zod schema at [supervisorAgent.ts:372](packages/shared/src/services/ai/subagents/supervisorAgent.ts:372). |
| HIGH | 506, 288 | Completion signal is substring `"Production complete"`. Gemini may paraphrase. | Either structured-output exit (tool-call `mark_complete`) or broaden to a regex `/production\s+(is\s+)?complete/i` with explicit "report EXACTLY this phrase" instruction. |
| HIGH | 180-271 | Example sessionIds `prod_xxx` / `prod_yyy` / `prod_zzz` inside the examples. The CRITICAL rule at line 61-65 specifically forbids fake values. Examples themselves use fakes. Mixed signal. | Label examples with `<SESSION_ID_FROM_STEP_1>` placeholders and explicitly annotate "these are placeholders; the real value comes back from step 1". |
| MED | 109 | "Aspect Ratio: Keywords like 'portrait', 'vertical', 'square'..." but supervisor only forwards `aspectRatio` to export subagent (not media). Portrait should also affect image prompt composition. | Decide where aspect ratio is respected; document it. |
| MED | 141 | "If no import: Content subagent creates sessionId" — but content subagent's tool `plan_video` is what creates it. The subagent layer is just a pass-through. Nit: this is confusing when debugging. | Clarify: "The `plan_video` tool (called by content subagent) creates the sessionId." |
| MED | 91-110 | Music exclusion repeated 3x ("NOT available in video production mode"). Compress to one. | Single rule in a MODES section. |
| LOW | 474-485 | Session-ID reminder is appended as `HumanMessage` mid-conversation (comment explains Gemini limitation). Works, but fragile — any future refactor that adds a SystemMessage later could reorder. | Centralize into a helper `appendSessionReminder(messages, id)` used by all subagents. |

### 3.2 `CONTENT_SUBAGENT_PROMPT` — [contentSubagent.ts:48](packages/shared/src/services/ai/subagents/contentSubagent.ts:48)

| Sev | Line | Issue | Fix sketch |
|---|---|---|---|
| CRIT | whole | No mention of `language`. The `plan_video` tool accepts `language` (defaults to **"ar"** at [contentTools.ts:99](packages/shared/src/services/ai/production/tools/contentTools.ts:99)) and `narrate_scenes` auto-detects with fallback **"en"**. Content subagent has no instruction to pass a consistent language, so the two tools may disagree within one session. | Thread `language` through `SubagentContext.userPreferences`, inject into the enhanced instruction, and add a prompt rule: "You MUST pass the same `language` value to both `plan_video` and `narrate_scenes`. If unknown, detect from user topic text; default `en`, not `ar`." Also fix the `"ar"` default — it's almost certainly a leftover. |
| HIGH | 255 | Completion check is `content.includes("Content complete") && content.includes("Score:")`. Two literal strings. | Use structured completion: add a `report_content_done` tool with `{ score, sceneCount, duration }`, or match a regex. |
| HIGH | 51-58 | "sessionId used as contentPlanId" — taxonomy mismatch. Every subagent reconciles this. | Pick one name at the protocol layer. Proposed: keep `contentPlanId` (matches the tool schemas, and the term "session" means something else in HTTP). Or rename tool schemas to `sessionId`. |
| MED | 64-108 | Scene-count framework is 45 lines of prose. Most of it repeats "complexity → pacing". | Replace with a 3-row lookup table + 2 examples. Save tokens. |
| MED | 124-128 | Quality rubric ("85-100 Approved / 70-84 Needs improvement / Below 70 Major issues") but `validate_plan` tool owns the score. The prompt rule and tool behavior should not both define the threshold — SSOT violation. | Keep the threshold in one place (the tool), prompt references it. |
| MED | 146-153 | Workflow restates quality loop already covered in "QUALITY CONTROL WORKFLOW" above. | Remove duplicate. |
| LOW | 135 | "Uses Gemini TTS (24kHz, mono, WAV)" — implementation detail that can drift. | Remove or mark as informational. |

### 3.3 `MEDIA_SUBAGENT_PROMPT` — [mediaSubagent.ts:46](packages/shared/src/services/ai/subagents/mediaSubagent.ts:46)

| Sev | Line | Issue | Fix sketch |
|---|---|---|---|
| CRIT | 81-83, 98-100, 128 | Animation is disabled here but the supervisor still advertises it. See Supervisor CRIT. | Align with supervisor decision. If staying disabled, add a line: "If you receive `animation: true`, acknowledge it in the completion report so the supervisor knows the feature was skipped." |
| HIGH | 86-91 | "SMART DEFAULT: ALWAYS include SFX for immersive styles" directly overrides supervisor's `sfx: false`. User who said "no sound effects" may still get them if supervisor forwards `sfx: false` but media sees style="Cinematic". | Invert policy: supervisor is SSOT for user intent. Media applies smart defaults ONLY if supervisor passed `sfx` as undefined. Currently supervisor always passes a concrete boolean (default false) so "smart default" can never win without overriding user intent. |
| HIGH | 236 | Completion check is `"Media complete"` + `"Visuals:"`. Includes the literal phrase `"Animation: Suspended (static images only)"` on line 128 — bakes a temporary state into the contract. When animation is re-enabled, all completion reports must change or the exit condition may mismatch. | Use structured completion tool; stop baking transient state into the required report string. |
| MED | 106-116 | Two "Examples" both hardcode `prod_1768266562924_r3zdsyfgc` — the exact string appears ~6 times across the file. Risk: model copies it. | Use `<SESSION_ID>` placeholder notation. |
| MED | whole | No multilingual visual guidance. E.g., if language is Arabic/Hebrew, should scene descriptions include culturally relevant imagery? No instruction. | Add a 2-line rule: "Visuals should respect language/region context. Avoid imagery that contradicts the narration locale." Optional. |
| LOW | 58-59, 91 | Music-not-available repeated. | Single line, moved to top. |
| LOW | 203-207 | The injected `enhancedInstruction` re-states sessionId 3 times. Diminishing returns. | Trim to once with a bold marker. |

### 3.4 `BASE_ENHANCEMENT_EXPORT_PROMPT` (assembled) — [enhancementExportSubagent.ts:45](packages/shared/src/services/ai/subagents/enhancementExportSubagent.ts:45)

| Sev | Line | Issue | Fix sketch |
|---|---|---|---|
| HIGH | 389-392 | Completion check is `"Export complete"` + (`"Format:"` OR `"available locally"`). Branch per environment. Still brittle. | Structured completion. |
| HIGH | 220 | Quality check: "If using music: Music URL is valid" — music is disabled in video mode (see media prompt line 58). Stale assertion confuses the model. | Remove the music line from quality checks. |
| MED | 78-83 | Prompt prescribes `duckingEnabled: true` in prose, but the tool schema at [audioMixingTools.ts:85](packages/shared/src/services/agent/audioMixingTools.ts:85) defaults it to `true` already. Prompt is redundant with tool default. | Drop prompt rule; trust the default. |
| MED | 87-89 | `generate_subtitles`: prompt mentions "Supports RTL languages (Arabic, Hebrew)" — but nowhere receives or passes `language`. The subtitle tool auto-detects at [contentTools.ts:167-172](packages/shared/src/services/ai/production/tools/contentTools.ts:167); if detection fails the default is `"en"`, silently breaking RTL output. | Pass explicit `language` through from supervisor. |
| MED | 158-210 | Two nearly-identical Workflow + Examples blocks (browser vs node), with hardcoded sessionId repeated ~8 times. | Template once, substitute environment-specific lines. |
| MED | 47-51 | Same session-ID vs contentPlanId aliasing issue as other subagents. | SSOT decision. |
| LOW | 61-70 | Enhancement tools list "Available styles: Anime, Watercolor, Oil Painting, Sketch, Pop Art, Cyberpunk, etc." — hardcoded enum in the prompt. Drift risk vs actual `restyle_image` tool. | Either reference the tool description or keep a single source. |
| LOW | 118-130 | AUTO_FETCH_RULES table duplicates per-tool "DO NOT provide narrationUrl" lines. | Keep the table; remove per-tool repetition. |

### 3.5 `IMPORT_SUBAGENT_PROMPT` — [importSubagent.ts:39](packages/shared/src/services/ai/subagents/importSubagent.ts:39)

| Sev | Line | Issue | Fix sketch |
|---|---|---|---|
| HIGH | [importSubagent.ts:144](packages/shared/src/services/ai/subagents/importSubagent.ts:144) | Subagent returns `sessionId: context.sessionId \|\| "unknown"`. When import is the first stage (no prior session), this returns the literal string `"unknown"` — which the supervisor then tries to pass downstream. Not a prompt issue, but it makes the prompt's "Return sessionId" contract a lie. | Fix in code: import handlers should create and return a sessionId; prompt should explicitly say "If no sessionId was provided, the import tool will create one — include it in your completion report." |
| HIGH | 132 | Completion check accepts EITHER `"Import complete"` OR `"Transcript:"`. "Transcript:" is part of the required report template line 72. Very loose — "Transcript: [empty]" would terminate. | Require both signals; or structured tool. |
| MED | whole | No language output in completion. Downstream content subagent may narrate in wrong language if user's YouTube video is in one language and they expect another. | Report detected transcript language in completion message, supervisor uses it to set content subagent's `language`. |
| MED | whole | No URL validation or injection-safety guidance. URLs come from user input — a crafted YouTube URL could redirect to unexpected content. Low risk today since tool validates, but prompt could reinforce. | Optional: add "Reject non-YouTube/X URLs. Reject file paths outside allowed audio extensions." |
| LOW | 67-70 | "Word-level timing required for lip sync" — but there's no lip-sync consumer in this pipeline. | Remove, or clarify what downstream actually uses word timing (subtitles). |

---

## 4. Cross-Cutting Themes

1. **Completion-by-string-match is the weakest link.** All 5 subagents can hang for `MAX_ITERATIONS` if the model paraphrases. Fixing this once (structured completion tool, or loose regex helper) would stabilize all five.
2. **Language/locale is a blind spot across the whole prompt layer.** The data type exists, the HTTP payload carries it, but no prompt reads or writes it. Two tools have conflicting defaults (`"ar"` vs `"en"`). Highest-leverage fix on the correctness axis.
3. **Feature-flag drift between supervisor and subagents.** Animation is the loudest example; SFX smart-default is a quieter one. Prompts and code are out of sync because the "disable" was done in code but not scrubbed from the prompt contracts.
4. **Session-ID naming is a repeated tax.** Every subagent spends ~5 lines + 1 example reconciling `sessionId` (prompt/UX term) vs `contentPlanId` (tool-schema term). A one-time rename wins back ~150 tokens per call.
5. **Hardcoded example IDs.** `prod_1768266562924_r3zdsyfgc` and `prod_xxx`/`prod_yyy`/`prod_zzz` appear ~15 times across prompts. Use a placeholder convention (`<SESSION_ID>`) to prevent memorization.
6. **Environment-variant prompts are manually concatenated** (enhancement subagent). The split is smart, but the template-assembly pattern is hard to diff. A small template helper would help.

---

## 5. Prioritized Patch Plan

| # | Patch | Impact | Risk |
|---|---|---|---|
| 1 | **Unify language threading**: add `language` to `SubagentContext.userPreferences`, inject into supervisor → content → enhancement prompts, fix `"ar"` default in [contentTools.ts:99](packages/shared/src/services/ai/production/tools/contentTools.ts:99). | Correctness (multilingual output actually works); fixes silent wrong-language bugs. | Low — additive, backward-compatible if default is chosen carefully (recommend `"en"`). |
| 2 | **Decide animation's fate**: delete animation from supervisor prompt + tool schema, OR restore it in media subagent. | Correctness (no silent feature loss); reliability (clear user expectations). | Low — both directions are mechanical. |
| 3 | **Structured completion signals**: replace substring matching with tool-call-based "done" signals (e.g., `report_content_done`, `report_export_done`), or switch to robust regex. | Reliability (fewer runaway iterations + wasted tokens). | Medium — touches every subagent's loop code. |
| 4 | **Fix supervisor vs media SFX policy**: supervisor is SSOT for user intent; media's "smart default" only kicks in for undefined. | Reliability + user-intent respect. | Low. |
| 5 | **Kill session-ID aliasing**: rename `contentPlanId` → `sessionId` at tool-schema level (or vice-versa), remove ~5 lines of reconciliation text from each subagent. | Token savings (~150 tokens/call), clarity. | Medium — rename affects tool signatures + stored state keys. |
| 6 | **Placeholder examples**: replace hardcoded `prod_1768266562924_r3zdsyfgc` with `<SESSION_ID>` across all prompts. | Reliability (fewer accidental copies). | Trivial. |
| 7 | **Dedupe / compress**: kill music-unavailable repetition, quality-rubric duplication, music-URL stale check in enhancement. | Token savings (~200-400 tokens across all prompts). | Trivial. |
| 8 | **Import subagent `"unknown"` sessionId bug**: fix return value when import was first stage. | Reliability (import-first flows are actually broken for sessionId propagation). | Low — small code fix. |
| 9 | **Template-based environment assembly for enhancement prompt**: extract a helper that takes `{ env: 'node'|'browser' }` and returns the composed prompt from shared sections. | Maintainability. | Low. |
| 10 | **Decide on internal consistency cleanups** (numbering, stale hints, style-enum drift). | Clarity. | Trivial. |

---

## 6. Legacy Prompt Recommendation

**`PRODUCTION_AGENT_PROMPT`** at [prompts.ts:7](packages/shared/src/services/ai/production/prompts.ts:7) (269 lines, ~2.5k tokens):

→ **DELETE.**

Reasons:
- Zero runtime imports (confirmed by grep).
- Contains stale branding ("LyricLens") that would mislead anyone reading it.
- The good content (tool-group dependencies, scene count guidelines, quality loop) is already replicated — and in most places improved — across the 5 subagent prompts.
- Keeping it as "reference" causes bit-rot: future edits to live prompts won't sync here.

If you want a fallback single-agent mode later, rebuild it from the current tool registry rather than reviving this frozen snapshot.

Also delete the re-export at [production/index.ts:59](packages/shared/src/services/ai/production/index.ts:59) and the documentation reference in `codebase-export.md`.

---

## 7. Open Questions (need your input before a rewrite)

1. **Animation — which way?** Re-enable image-to-video via DeAPI / Veo image-to-video, or fully remove from the product surface? I need this decision before I can collapse the animation code path cleanly.
2. **Language default — `"en"` or detect-from-topic?** The current `"ar"` default is almost certainly a mistake. What should the fallback be?
3. **Session-ID naming** — rename toward `sessionId` everywhere (breaks tool schemas, but matches UX), or keep `contentPlanId` (matches schema, but prompts stay noisy)?
4. **Completion-signal refactor scope** — are you OK with introducing a `report_X_done` tool per subagent, or do you want to keep the current free-text pattern and just harden the string match?
5. **Dead `PRODUCTION_AGENT_PROMPT`** — delete in this cleanup, or leave for a separate git-blame-friendly commit?
6. **Audit scope expansion** — do you want me to also cover `productionBrief.ts`, `briefEnrichment.ts`, and story pipeline prompts in a follow-up, or only the subagent layer for now?

---

## 8. Verification Checklist (for you)

- [ ] Spot-check 3 random findings by opening the cited `file:line`.
- [ ] Pick one CRIT (animation downgrade or language threading) and ask me to draft the fix in a fresh session.
- [ ] Flag anything missing — I haven't audited the `.invoke()` loops (code-level) beyond what was needed to cross-reference prompt claims.

## 9. Out of Scope (confirmed)

- Story-pipeline prompts, `productionBrief`, `briefEnrichment`, TTS delivery prompts → not touched this pass.
- No code edits. No token-measurement beyond line counts.
- No rewrite of any prompt. Rewrite will be a separate task after you pick directions in §7.
