# AI Agent System

**Last Updated:** 2026-03-26
**Entry Points:**
- `packages/shared/src/services/ai/production/agentCore.ts` — multi-agent entry point
- `packages/shared/src/services/ai/production/agentExecutor.ts` — single-agent entry point
- `packages/shared/src/services/agentDirectorService.ts` — storyboard/music director

---

## 1. Overview

The codebase contains two distinct agent architectures that serve different purposes. Understanding the difference is critical before modifying either.

### Architecture A: Production Agent System (chat mode)

Used when a user types a free-form video request in the Studio chat interface (`mode=story` or the director chat). A supervisor LLM orchestrates a set of specialized subagents, each responsible for one stage of video production.

```
runProductionAgentWithSubagents()       ← agentCore.ts entry point
  └── runSupervisorAgent()              ← supervisorAgent.ts
        ├── ImportSubagent              ← YouTube/audio transcription (optional)
        ├── ContentSubagent             ← content plan + TTS narration
        ├── MediaSubagent               ← image generation + SFX
        └── EnhancementExportSubagent   ← audio mixing + subtitle + video export
```

All state is held in `productionStore` (a `Map<string, ProductionState>`) keyed by a session ID (`prod_TIMESTAMP_HASH`). The session ID is the single thread connecting all four stages.

### Architecture B: Director Service (storyboard generation)

Used for the older video/music storyboard workflow. A single LangChain tool-calling loop produces `ImagePrompt[]` from SRT/lyrics. There are no subagents.

```
generatePromptsWithAgent()              ← agentDirectorService.ts entry point
  └── Single ChatGoogleGenerativeAI loop with allTools
        ├── analyze_and_generate_storyboard
        ├── generate_storyboard
        ├── critique_storyboard
        └── refine_prompt
```

### Architecture C: Format Pipelines (pipeline mode)

Deterministic, non-agent pipelines for specific video formats (YouTube Narrator, Documentary, Shorts, etc.) in `packages/shared/src/services/pipelines/`. These are not LLM agent loops — they call LLM APIs in a fixed sequence with checkpoint gates. See `docs/multi-format-pipeline-spec.md` for details.

**Key difference:** Chat mode (A) lets the LLM decide the workflow; pipeline mode (C) hard-codes it. Chat mode is flexible but slower and harder to debug. Pipeline mode is predictable and auditable.

---

## 2. AgentCore (`agentCore.ts`)

`agentCore.ts` is a thin orchestration shim. It does not contain agent logic itself; it re-exports two entry points and owns session lifecycle helpers.

### Exports

| Export | Source | Purpose |
|--------|--------|---------|
| `runProductionAgentWithSubagents` | agentCore.ts | Multi-agent entry (supervisor pattern) |
| `runProductionAgent` | agentExecutor.ts | Single-agent entry (flat tool loop) |
| `checkResultCache` | resultCache.ts | Per-tool result cache check |
| `getProductionSession` | store.ts | Read a session from memory |
| `clearProductionSession` | store.ts | Delete a session from memory + IndexedDB |

### `runProductionAgentWithSubagents(userRequest, onProgress?, options?)`

The canonical entry point for new production requests. It:

1. Validates `GEMINI_API_KEY` is present.
2. Sets the global progress callback so subagents can emit progress without passing it through every call frame.
3. Builds `SupervisorOptions` and calls `runSupervisorAgent()`.
4. Reads `ProductionState` from `productionStore` using the returned `sessionId`.
5. Emits a final `"complete"` progress event with an `assetSummary`.

```typescript
import { runProductionAgentWithSubagents } from "@studio/shared/src/services/ai/production/agentCore";

const state = await runProductionAgentWithSubagents(
  "Create a 60-second video about coffee history",
  (progress) => console.log(progress.stage, progress.message),
  { sessionId: existingSessionId ?? null } // pass null to start fresh
);
```

The returned `ProductionState | null` contains all generated assets once production is complete.

---

## 3. AgentExecutor (`agentExecutor.ts`)

`runProductionAgent` is the legacy single-agent loop. It still works but predates the supervisor pattern. The difference:

| | `runProductionAgent` | `runProductionAgentWithSubagents` |
|-|---------------------|----------------------------------|
| Architecture | Single LLM + all tools | Supervisor + 4 specialized subagents |
| Tool visibility | Every tool at once | Per-subagent tool subsets |
| Model temp | 0.3 | Varies per subagent (0.1–0.4) |
| Iteration limit | 20 | 20 per subagent |
| Caching | Result cache checked per tool | Result cache inside each subagent |

### Execution Loop

The loop runs up to 20 iterations. Each iteration:

1. Calls `modelWithTools.invoke(messages)` (LangChain ChatGoogleGenerativeAI bound to `productionTools`).
2. If no `tool_calls` are returned, emits a `"complete"` progress event and breaks.
3. For each tool call:
   - Builds a `stepId` from `(toolName, toolArgs)` to detect duplicate calls.
   - Calls `checkResultCache()` — if assets already exist in `productionStore`, returns the cached result without re-executing.
   - Calls `executeToolWithRecovery()` from `errorHandler.ts`.
   - Parses the result for the session ID (from `plan_video`, `create_storyboard`, or `generate_breakdown`).
   - Appends a `ToolMessage` to the conversation for the next model invocation.

### Intent Analysis

Before entering the loop, `analyzeIntent(userRequest)` extracts signals (YouTube URL, audio file path, animation keywords, style, aspect ratio) and prepends a structured `intentHint` to the user message. This nudges the LLM toward calling the right first tool.

### Error Handling

`ErrorTracker` accumulates `ToolError` objects across the run. After the loop, a `PartialSuccessReport` is attached to `ProductionState.partialSuccessReport`. Errors do not abort the run unless they are thrown uncaught from `executeToolWithRecovery`.

Safety filter blocks from Gemini (LangChain throws `"chatGeneration is undefined"`) are caught and retried with a nudge message rather than crashing.

---

## 4. SupervisorAgent (`supervisorAgent.ts`)

The supervisor is itself an LLM agent. Its only tools are four delegation functions — it never calls production tools directly. This keeps the supervisor prompt narrow and focused on orchestration.

### Supervisor Model Configuration

```typescript
model: MODELS.TEXT          // gemini-3-flash-preview
temperature: 0.1            // low — consistent orchestration decisions
maxIterations: 20
```

### Delegation Tools

| Tool name | Wraps | Required |
|-----------|-------|----------|
| `delegate_to_import_subagent` | `ImportSubagent` | No (only when YouTube URL or audio file present) |
| `delegate_to_content_subagent` | `ContentSubagent` | Yes |
| `delegate_to_media_subagent` | `MediaSubagent` | Yes |
| `delegate_to_enhancement_export_subagent` | `EnhancementExportSubagent` | Yes |

Each delegation tool calls `executeSubagent()` from `subagents/index.ts`, which wraps the subagent's `invoke()` with retry logic (exponential back-off, up to `maxRetries` attempts).

### Session ID Contract

The session ID created by `ContentSubagent` (via `plan_video`) must be passed identically to every subsequent subagent. The supervisor prompt uses extensive repetition and examples to enforce this because LLMs tend to hallucinate placeholder IDs (`"plan_123"`, `"session_123"`) when the actual ID is not reinforced.

After each `delegate_to_content_subagent` result, the code injects a `HumanMessage` (not `SystemMessage` — Google AI requires `SystemMessage` to be first) reminding the LLM of the exact session ID.

### Error Recovery

| Subagent | On failure |
|----------|-----------|
| IMPORT | Continue with topic-based workflow |
| CONTENT | Abort — no content plan means nothing downstream can run |
| MEDIA | Retry once, then use placeholder visuals |
| ENHANCEMENT_EXPORT | Retry once, then return asset bundle |

---

## 5. ContentSubagent (`contentSubagent.ts`)

Handles the critical content creation stage. Failure here aborts the entire production.

### Tools available

| Tool | Purpose |
|------|---------|
| `plan_video` | Create `ContentPlan` with `scenes[]`, returns `sessionId` |
| `narrate_scenes` | Generate TTS narration (Gemini 2.5 Flash TTS, 24 kHz WAV) per scene |
| `validate_plan` | Score content quality 0–100, return improvement suggestions |
| `adjust_timing` | Sync scene durations to actual narration lengths |

### Quality Control Loop

After narration, the subagent runs `validate_plan`. If the score is below 80 and fewer than 2 iterations have been attempted, it calls `adjust_timing` then re-validates. The final score and iteration count are stored in `ProductionState.qualityScore` and `ProductionState.qualityIterations`.

### Scene Count Heuristic

The subagent's system prompt instructs the LLM to choose scene count based on topic complexity, not to accept the user's count blindly:

- High complexity (history, tutorials): 8–10 s per scene
- Medium complexity (explanations): 10–12 s per scene
- Low complexity (quotes, abstract): 15–20 s per scene

### RAG Integration

If `AI_CONFIG.rag.enabled` is true, the subagent calls `knowledgeBase.getRelevantKnowledge(instruction)` before building messages and prepends the result to the user message. Failure is non-fatal — the subagent continues without knowledge.

### Max Iterations

15 (higher than other subagents to accommodate the quality loop).

---

## 6. MediaSubagent (`mediaSubagent.ts`)

Generates all visual and audio assets. Requires a valid `sessionId` — throws immediately if `context.sessionId` is null.

### Tools available

| Tool | Purpose | Required |
|------|---------|----------|
| `generate_visuals` | Generate `GeneratedImage[]` for all scenes via Gemini Imagen | Yes |
| `plan_sfx` | Create ambient sound effects plan (`VideoSFXPlan`) | Smart default |

**Tools intentionally excluded from the subagent's tool list:**
- `animate_image` — suspended by user request; the prompt documents this explicitly
- `generate_music` — music generation is only available in the dedicated "Generate Music" mode, not during video production

### Smart Defaults for SFX

The subagent prompt instructs the LLM to include SFX for immersive styles (Cinematic, Documentary, Horror, Nature) by default, even when the user does not explicitly request them.

### Session ID Injection

The `invoke()` method prepends the session ID directly into the user message string:

```
IMPORTANT: Your sessionId is "prod_xxx". Use this EXACT value as contentPlanId for ALL tool calls.
```

This is done in code, not just in the system prompt, because the LLM must see the concrete value to use it correctly.

### Max Iterations

20 (originally higher to accommodate per-scene animation, retained for potential future use).

---

## 7. EnhancementExportSubagent (`enhancementExportSubagent.ts`)

The final stage. Mixes audio, generates subtitles, renders the video, and optionally uploads to cloud storage.

### Tools available

| Tool | Purpose | Required | Environment |
|------|---------|----------|-------------|
| `remove_background` | Remove image backgrounds | No | Both |
| `restyle_image` | Apply artistic style transfer | No | Both |
| `mix_audio_tracks` | Combine narration + music + SFX | Yes | Both |
| `generate_subtitles` | Create SRT/VTT subtitles | No | Both |
| `export_final_video` | Render final MP4/WebM | Yes | Both |
| `upload_production_to_cloud` | Upload all assets to GCS | No | Node.js only |

### Auto-Fetch Parameters

Several tool parameters are **automatically fetched from session state** and must not be passed explicitly:

| Tool | Auto-fetched fields |
|------|---------------------|
| `mix_audio_tracks` | `narrationUrl` (concatenated from segments) |
| `export_final_video` | `visuals`, `narrationUrl`, `totalDuration` |
| `generate_subtitles` | `narrationSegments` |
| `upload_production_to_cloud` | All assets |

The system prompt repeats this in a table so the LLM does not hallucinate these values.

### Browser vs Node.js

The system prompt is generated at instantiation time via `getSystemPrompt()`. In the browser (`typeof window !== 'undefined'`), the cloud upload tool is not included in `enhancementExportTools` and the prompt adds a note forbidding the LLM from attempting it.

### Duplicate Tool Prevention

An in-subagent `completedTools: Set<string>` blocks re-execution of expensive singleton tools (`mix_audio_tracks`, `export_final_video`). Unlike the global result cache in `agentExecutor.ts`, this set is local to one subagent invocation.

---

## 8. ImportSubagent (`importSubagent.ts`)

Optional first stage. Used only when the user provides a YouTube/X URL or an audio file path.

### Tools available

| Tool | Purpose |
|------|---------|
| `import_youtube_content` | Download audio from YouTube/X, returns transcript + metadata |
| `transcribe_audio_file` | Transcribe a local audio file (.mp3, .wav, .m4a, .ogg) |

### Recovery Behavior

Import failure does not abort production. The supervisor's recovery strategy (`continueOnFailure: true`) catches the error and proceeds with a topic-based workflow, using the user's original request as the content topic.

---

## 9. AgentDirectorService (`agentDirectorService.ts`)

A separate, older agent used by the video/music storyboard generation flow (not the production pipeline). It does not use subagents.

### Entry Point

```typescript
generatePromptsWithAgent(
  srtContent: string,
  style: string,
  contentType: "lyrics" | "story",
  videoPurpose: VideoPurpose,
  globalSubject?: string,
  config?: AgentDirectorConfig
): Promise<ImagePrompt[]>
```

### Configuration defaults

```typescript
model: MODELS.TEXT          // gemini-3-flash-preview
temperature: 0.7
maxIterations: 2            // Short loop — storyboard is single-shot
qualityThreshold: 70
targetAssetCount: 10
```

### Loop behavior

Unlike the production agent, this loop exits early as soon as a valid storyboard is extracted from a tool response. Storyboard extraction uses `jsonExtractor.extractJSON()` with a fallback to `fallbackProcessor.processWithFallback()` for malformed JSON.

### Output Conversion

`convertToImagePrompts()` maps the raw `StoryboardOutput.prompts[]` into `ImagePrompt[]` with `id`, `text`, `mood`, `timestamp`, and `timestampSeconds` fields consumed by the frontend.

---

## 10. ProductionState and the Store

### `ProductionState` shape

```typescript
interface ProductionState {
  contentPlan: ContentPlan | null;       // scenes[], totalDuration, style
  validation: ValidationResult | null;   // latest validate_plan result
  narrationSegments: NarrationSegment[]; // TTS blobs + durations per scene
  visuals: GeneratedImage[];             // imageUrl per scene
  sfxPlan: VideoSFXPlan | null;          // ambient sounds per scene
  musicTaskId: string | null;            // Suno task ID (music mode only)
  musicUrl: string | null;
  errors: ToolError[];                   // accumulated ToolErrors
  importedContent: ImportedContent | null;
  qualityScore: number;                  // 0–100
  qualityIterations: number;
  bestQualityScore: number;
  mixedAudio: MixedAudioResult | null;
  subtitles: SubtitleResult | null;
  exportResult: ExportResult | null;
  exportedVideo: Blob | null;
  partialSuccessReport?: PartialSuccessReport;
}
```

### `StoryModeState` shape

Used by the step-by-step Story Mode workflow (not the production agent):

```typescript
interface StoryModeState {
  id: string;
  topic: string;
  breakdown: string;
  screenplay: ScreenplayScene[];
  characters: CharacterProfile[];
  shotlist: ShotlistEntry[];
  currentStep: 'breakdown' | 'screenplay' | 'characters' | 'shotlist' | 'production';
  updatedAt: number;
  formatId?: string;        // isolates state per video format
  language?: 'ar' | 'en';
  checkpoints?: CheckpointState[];
}
```

### Storage layers

`productionStore` and `storyModeStore` are plain `Map<string, T>` instances. They are the primary read/write surface for all agent tools.

Writes also flow to:
1. **IndexedDB** via `saveProductionSession()` — debounced 1 s to avoid write amplification.
2. **Cloud autosave** via `cloudAutosave.initSession()` on session creation — fire-and-forget.

Session cleanup: `initializePersistence()` removes sessions older than 7 days from IndexedDB on app startup.

### Reading state from outside agents

```typescript
import { getProductionSession } from "@studio/shared/src/services/ai/production/agentCore";
import { restoreProductionSession } from "@studio/shared/src/services/ai/production/store";

// Memory-only read (synchronous)
const state = getProductionSession(sessionId);

// Memory-first, then IndexedDB (async)
const state = await restoreProductionSession(sessionId);
```

---

## 11. Result Cache (`resultCache.ts`)

Before executing any tool, `agentExecutor.ts` calls `checkResultCache(toolName, toolArgs, currentState)`. If the asset already exists and is complete, the tool is skipped and a synthetic success result is returned to the LLM.

Cached tools and their cache conditions:

| Tool | Cached when |
|------|-------------|
| `generate_visuals` | `visuals.length >= scenes.length` and every visual has `imageUrl` |
| `narrate_scenes` | `narrationSegments.length >= scenes.length` and every segment has `audioBlob` |
| `plan_sfx` | `sfxPlan.scenes.length > 0` |
| `mix_audio_tracks` | `mixedAudio.audioBlob` is set |
| `generate_subtitles` | `subtitles.content` is set |
| `export_final_video` | `exportResult.videoBlob` is set |
| `animate_image` | `visuals[sceneIndex].videoUrl` is set |

This prevents the LLM from re-generating expensive assets (Imagen, TTS) when it mistakenly calls the same tool twice.

---

## 12. Chat Mode vs Pipeline Mode

| Dimension | Chat Mode (Production Agent) | Pipeline Mode (Format Pipelines) |
|-----------|------------------------------|----------------------------------|
| Entry point | `runProductionAgentWithSubagents()` | e.g. `runYoutubeNarratorPipeline()` |
| Control flow | LLM decides what to call next | Hard-coded function sequence |
| Checkpoint gates | None | Yes — user approves script, images, etc. |
| Formats | Generic (any topic) | Format-specific prompts and structure |
| Iteration limit | 20 per subagent | N/A |
| Predictability | Lower | High |
| Debugging | Harder (LLM-driven) | Easier (deterministic) |
| Music generation | Not supported | Supported in some formats |

Use pipeline mode for any new format-specific features. Use chat mode only when the request is truly open-ended.

---

## 13. Key Gotchas and Known Limitations

**Session ID hallucination.** The LLM regularly generates fake session IDs (`"plan_123"`, `"cp_01"`, `"session_123"`) if not aggressively reminded. The supervisor, ContentSubagent, MediaSubagent, and EnhancementExportSubagent all inject the real session ID into the conversation multiple times. If you see tool calls failing with "session not found", check that the correct session ID is being threaded through.

**Animation is suspended.** `animate_image` is listed in `productionTools` but is excluded from `MediaSubagent`'s tool list. Do not re-enable it without testing the DeAPI integration; `animateImageWithDeApi` expects full data URLs (`data:image/png;base64,...`), not raw base64.

**Music generation is not available in video production.** `generate_music` calls the Suno API and is only wired into the standalone "Generate Music" mode. The MediaSubagent's tool list and system prompt both explicitly exclude it. If you add it back, note that it creates a task ID that must be polled for completion.

**`SystemMessage` must be first.** Google Generative AI rejects message arrays where `SystemMessage` is not the first item. When the code needs to inject reminders mid-conversation it uses `HumanMessage` instead.

**Safety filter blocks.** When Gemini's safety filters activate, LangChain throws `"chatGeneration is undefined"`. `agentExecutor.ts` catches this pattern and retries with a nudge message. If you see this in logs, check the content being generated — horror/thriller prompts are most likely to trigger it.

**Iteration limit.** Both the supervisor (20) and each subagent (10–20) have hard iteration limits. If a subagent exceeds its limit it throws, which the supervisor catches. If the supervisor itself exceeds its limit it also throws, propagating to `runProductionAgentWithSubagents` which re-throws. The UI should display partial results from `productionStore` in this case.

**Browser vs Node.js tools.** `upload_production_to_cloud` is only registered in Node.js. The `EnhancementExportSubagent` checks `typeof window === 'undefined'` at instantiation to build the correct tool list and system prompt. Do not call this subagent in a browser context with `uploadToCloud: true` — it will fail gracefully but confusingly.

**Firestore and `undefined`.** If `ProductionState` fields are written to Firestore (e.g. via `storySync.ts`), always run a JSON round-trip sanitizer first. Firestore rejects `undefined` values silently in some SDK versions, causing partial writes.

**RAG is opt-in.** `AI_CONFIG.rag.enabled` controls whether `ContentSubagent` and `MediaSubagent` query the knowledge base. It defaults to off. Errors from knowledge retrieval are caught and logged but do not block production.

---

## 14. File Map

```
packages/shared/src/services/
├── ai/
│   ├── production/
│   │   ├── agentCore.ts          Multi-agent entry point + session helpers
│   │   ├── agentExecutor.ts      Single-agent tool loop
│   │   ├── errorHandler.ts       executeToolWithRecovery()
│   │   ├── resultCache.ts        Per-tool cache check
│   │   ├── store.ts              productionStore, storyModeStore, persistence
│   │   ├── toolRegistration.ts   productionTools[], toolMap, tool registry
│   │   ├── types.ts              ProductionState, StoryModeState, ProductionProgress
│   │   ├── prompts.ts            PRODUCTION_AGENT_PROMPT
│   │   └── tools/
│   │       ├── contentTools.ts   plan_video, narrate_scenes, validate_plan, adjust_timing
│   │       ├── mediaTools.ts     generate_visuals, animate_image, generate_music, plan_sfx
│   │       ├── statusTools.ts    get_production_status, mark_complete
│   │       └── storyTools.ts     generate_breakdown, create_screenplay, generate_characters, generate_shotlist
│   └── subagents/
│       ├── index.ts              Subagent interface, executeSubagent(), getRecoveryStrategy()
│       ├── supervisorAgent.ts    runSupervisorAgent()
│       ├── importSubagent.ts     createImportSubagent()
│       ├── contentSubagent.ts    createContentSubagent()
│       ├── mediaSubagent.ts      createMediaSubagent()
│       └── enhancementExportSubagent.ts  createEnhancementExportSubagent()
├── agentDirectorService.ts       generatePromptsWithAgent() — storyboard/music director
└── agent/
    ├── agentTools.ts             allTools for director service
    ├── agentLogger.ts            agentDirectorLogger
    ├── agentMetrics.ts           request timing metrics
    ├── errorRecovery.ts          ErrorTracker, classifyError, ToolError
    ├── intentDetection.ts        analyzeIntent(), generateIntentHint()
    ├── importTools.ts            import_youtube_content, transcribe_audio_file
    ├── exportTools.ts            export_final_video
    ├── subtitleTools.ts          generate_subtitles
    ├── audioMixingTools.ts       mix_audio_tracks
    ├── enhancementTools.ts       remove_background, restyle_image
    ├── cloudStorageTools.ts      upload_production_to_cloud
    └── toolRegistry.ts           ToolRegistry, ToolGroup, createToolDefinition()
```
