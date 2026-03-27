# Format System

**Last Updated:** 2026-03-26
**Entry Points:**
- `packages/shared/src/services/formatRegistry.ts`
- `packages/shared/src/services/formatRouter.ts`
- `packages/shared/src/services/formatValidation.ts`
- `packages/shared/src/types.ts` — `VideoFormat`, `FormatMetadata`

---

## 1. Overview

The format system is the central dispatch layer for AI video production. It answers three questions:

1. **What formats exist?** — The `FormatRegistry` is the source of truth. It holds metadata for every supported format (duration limits, aspect ratio, checkpoint count, etc.) and exposes a singleton `formatRegistry`.
2. **Which pipeline should run?** — The `FormatRouter` maps a `VideoFormat` ID to a concrete `FormatPipeline` implementation and dispatches the request to it, applying pre-flight validation along the way.
3. **Are the assets within spec?** — `formatValidation.ts` provides pure validation functions that check duration, aspect ratio, checkpoint count, and concurrency against the registry metadata. It also enforces the rule that genre selection must never alter pipeline structure.

```
PipelineRequest
     │
     ▼
FormatRouter.dispatch()
     │
     ├─ validateFormat()          ← registry lookup, language check, genre check
     │
     ├─ getFormatPipeline()       ← resolves concrete FormatPipeline
     │
     ├─ pipeline.validate()       ← optional pipeline-level check
     │
     └─ pipeline.execute()        ← runs phases, fires callbacks
          │
          ▼
     PipelineResult
```

---

## 2. VideoFormat Union Type

Defined in `packages/shared/src/types.ts`.

```ts
export type VideoFormat =
  | 'youtube-narrator'
  | 'advertisement'
  | 'movie-animation'
  | 'educational'
  | 'shorts'
  | 'documentary'
  | 'music-video'
  | 'news-politics';
```

Use this union for all format IDs throughout the codebase — never use a plain `string` where a `VideoFormat` is expected.

---

## 3. FormatMetadata Interface

Defined in `packages/shared/src/types.ts`.

```ts
export interface FormatMetadata {
  id: VideoFormat;
  name: string;
  description: string;
  icon: string;
  durationRange: { min: number; max: number }; // seconds
  aspectRatio: '16:9' | '9:16' | '1:1';
  applicableGenres: string[];
  checkpointCount: number;
  concurrencyLimit: number;
  requiresResearch: boolean;
  supportedLanguages: ('ar' | 'en')[];
  deprecated?: boolean;
  deprecationMessage?: string;
}
```

`deprecated` and `deprecationMessage` are optional. Deprecated formats still execute via the router but produce a warning in `PipelineResult.warnings`.

---

## 4. FormatRegistry

**File:** `packages/shared/src/services/formatRegistry.ts`

The `FormatRegistry` class manages a `Map<VideoFormat, FormatMetadata>`. All 8 formats are registered in the constructor via `registerAllFormats()`. A singleton `formatRegistry` is exported.

### Key Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `getFormat` | `(id: string) => FormatMetadata \| null` | Look up a format by ID. Returns `null` for unknown IDs. |
| `getAllFormats` | `() => FormatMetadata[]` | All registered formats, including deprecated. |
| `getActiveFormats` | `() => FormatMetadata[]` | All non-deprecated formats. |
| `getDeprecatedFormats` | `() => FormatMetadata[]` | Deprecated formats only. |
| `isValidFormat` | `(id: string) => boolean` | Check existence (deprecated counts as valid). |
| `isDeprecated` | `(id: string) => boolean` | Check deprecation status. |
| `registerFormat` | `(metadata: FormatMetadata) => void` | Add or overwrite a format entry. |
| `deprecateFormat` | `(id: string, message?: string) => void` | Mark an existing format deprecated. |

### Example

```ts
import { formatRegistry } from '@studio/shared/src/services/formatRegistry';

const meta = formatRegistry.getFormat('documentary');
// meta.durationRange => { min: 900, max: 3600 }
// meta.checkpointCount => 4
// meta.requiresResearch => true

const allActive = formatRegistry.getActiveFormats();
```

---

## 5. Format Reference Table

All 8 formats registered at startup:

| ID | Name | Aspect | Duration | Checkpoints | Concurrency | Research |
|----|------|--------|----------|-------------|-------------|---------|
| `youtube-narrator` | YouTube Narrator | 16:9 | 8–25 min | 3 | 5 | Yes |
| `advertisement` | Advertisement | 16:9 | 15–60 sec | 3 | 3 | No |
| `movie-animation` | Movie/Animation | 16:9 | 5–30 min | 4 | 4 | No |
| `educational` | Educational Tutorial | 16:9 | 5–20 min | 4 | 4 | Yes |
| `shorts` | Shorts/Reels | 9:16 | 15–60 sec | 3 | 3 | No |
| `documentary` | Documentary | 16:9 | 15–60 min | 4 | 5 | Yes |
| `music-video` | Music Video | 16:9 | 2–8 min | 3 | 4 | No |
| `news-politics` | News/Politics | 16:9 | 3–15 min | 3 | 5 | Yes |

Note: `shorts` is the only format with a 9:16 (vertical) aspect ratio.

---

## 6. FormatRouter

**File:** `packages/shared/src/services/formatRouter.ts`

The `FormatRouter` class holds a `Map<VideoFormat, FormatPipeline>` of registered pipeline implementations. A singleton `formatRouter` is exported.

### Interfaces

```ts
// Input to dispatch()
export interface PipelineRequest {
  formatId: VideoFormat;
  idea: string;
  genre?: string;
  language: 'ar' | 'en';
  referenceDocuments?: IndexedDocument[];
  userId: string;
  projectId: string;
}

// Callbacks wired to UI components
export interface PipelineCallbacks {
  onCheckpointCreated?: (checkpoint: CheckpointState) => void;
  onCheckpointSystemCreated?: (system: CheckpointSystem) => void;
  onProgress?: (progress: ExecutionProgress) => void;
  onCancelRequested?: (cancelFn: () => void) => void;
}

// Returned by dispatch()
export interface PipelineResult {
  success: boolean;
  videoUrl?: string;
  error?: string;
  partialResults?: any;
  warnings?: string[];
}

// Contract every pipeline must implement
export interface FormatPipeline {
  execute(request: PipelineRequest, callbacks?: PipelineCallbacks): Promise<PipelineResult>;
  validate?(request: PipelineRequest): Promise<boolean>;
  getMetadata(): FormatMetadata;
}
```

### dispatch() Execution Steps

1. `validateFormat(request.formatId)` — throws `FormatRouterError` if format is unknown.
2. Retrieve `FormatMetadata` from registry.
3. Check `deprecated` — if true, push warning string to `result.warnings` (execution continues).
4. Validate `request.language` against `metadata.supportedLanguages`.
5. Validate `request.genre` (when provided) against `metadata.applicableGenres`.
6. `getFormatPipeline(request.formatId)` — throws if no pipeline is registered for this format.
7. Call `pipeline.validate(request)` if implemented — throws `VALIDATION_FAILED` if it returns `false`.
8. Call `pipeline.execute(request, callbacks)` and return the result.
9. Any non-`FormatRouterError` exceptions are wrapped in `EXECUTION_FAILED`.

### Error Codes

```ts
export enum FormatRouterErrorCode {
  FORMAT_NOT_FOUND   = 'FORMAT_NOT_FOUND',
  INVALID_FORMAT     = 'INVALID_FORMAT',
  PIPELINE_NOT_FOUND = 'PIPELINE_NOT_FOUND',
  VALIDATION_FAILED  = 'VALIDATION_FAILED',
  EXECUTION_FAILED   = 'EXECUTION_FAILED',
  FORMAT_DEPRECATED  = 'FORMAT_DEPRECATED'
}
```

Always `instanceof FormatRouterError` before reading `.code`.

### Example

```ts
import { formatRouter } from '@studio/shared/src/services/formatRouter';
import type { PipelineRequest } from '@studio/shared/src/services/formatRouter';

const request: PipelineRequest = {
  formatId: 'shorts',
  idea: 'A 30-second life hack about productivity',
  genre: 'Life Hack',
  language: 'en',
  userId: 'user_123',
  projectId: 'proj_456',
};

const result = await formatRouter.dispatch(request, {
  onProgress: (p) => console.log(p),
  onCancelRequested: (cancel) => { /* store cancel fn */ },
});

if (!result.success) {
  console.error(result.error);
}
```

---

## 7. FormatValidation

**File:** `packages/shared/src/services/formatValidation.ts`

All functions are pure (no side effects, React-free). They read metadata from `formatRegistry` but never mutate state.

### validateFormatCompliance()

Checks whether pipeline asset parameters are within the bounds declared by the format's metadata.

```ts
import { validateFormatCompliance } from '@studio/shared/src/services/formatValidation';

const result = validateFormatCompliance('documentary', {
  durationSeconds: 1800,
  aspectRatio: '16:9',
  checkpointCount: 4,
  concurrentTasks: 3,
});
// result.valid === true
// result.violations === []
```

Fields checked:

| Asset field | Metadata bound | Violation condition |
|-------------|---------------|---------------------|
| `durationSeconds` | `durationRange.min` / `durationRange.max` | Outside range |
| `aspectRatio` | `aspectRatio` | Mismatch |
| `checkpointCount` | `checkpointCount` | Exceeds max |
| `concurrentTasks` | `concurrencyLimit` | Exceeds limit |

A `FormatViolation` carries `field`, `expected`, `actual`, and a human-readable `message`.

### validateGenrePipelineInvariance()

Asserts that a genre selection does not alter the pipeline phase sequence (Property 46). Genre may only influence `styleParams`, never the pipeline structure itself.

```ts
import { validateGenrePipelineInvariance } from '@studio/shared/src/services/formatValidation';

const { invariant, message } = validateGenrePipelineInvariance('advertisement', 'Product Launch');
// invariant === true
```

Returns `{ invariant: false, message }` if:
- The format is not registered.
- The genre is not in `applicableGenres`.
- The phase structure for the format is empty.
- Phase `order` values are not strictly increasing.

### getFormatPipelineStructure()

Returns the fixed sequence of `PipelinePhaseDescriptor[]` for a format. Genre does not affect this output.

```ts
import { getFormatPipelineStructure } from '@studio/shared/src/services/formatValidation';

getFormatPipelineStructure('documentary');
// [
//   { id: 'research', name: 'Deep Research',   order: 1, parallel: true  },
//   { id: 'script',   name: 'Chapter Script',  order: 2, parallel: false },
//   { id: 'visual',   name: 'Visual Generation', order: 3, parallel: true  },
//   { id: 'audio',    name: 'Audio Generation', order: 4, parallel: false },
//   { id: 'assembly', name: 'Assembly',         order: 5, parallel: false },
// ]
```

### getGenreStyleParams()

Returns the approved set of style parameters that genre is permitted to influence.

```ts
getGenreStyleParams('movie-animation', 'Thriller');
// { tone: 'suspenseful', visualMood: 'dark, high-contrast', colorPalette: 'default', pacing: 'fast' }
```

These params should be forwarded to prompt builders and image services — never used to add or remove pipeline phases.

---

## 8. Pipeline Files

Each format has a corresponding implementation in `packages/shared/src/services/pipelines/`:

| Format ID | Pipeline File | Class |
|-----------|--------------|-------|
| `youtube-narrator` | `youtubeNarrator.ts` | `YoutubeNarratorPipeline` |
| `advertisement` | `advertisement.ts` | `AdvertisementPipeline` |
| `movie-animation` | `movieAnimation.ts` | `MovieAnimationPipeline` |
| `educational` | `educational.ts` | `EducationalPipeline` |
| `shorts` | `shorts.ts` | `ShortsPipeline` |
| `documentary` | `documentary.ts` | `DocumentaryPipeline` |
| `music-video` | `musicVideo.ts` | `MusicVideoPipeline` |
| `news-politics` | `newsPolitics.ts` | `NewsPoliticsPipeline` |

Every pipeline class implements `FormatPipeline`:

```ts
export class AdvertisementPipeline implements FormatPipeline {
  getMetadata(): FormatMetadata {
    return formatRegistry.getFormat('advertisement')!;
  }

  async validate(request: PipelineRequest): Promise<boolean> {
    return !!request.idea && request.idea.trim().length > 0;
  }

  async execute(request: PipelineRequest, callbacks?: PipelineCallbacks): Promise<PipelineResult> {
    // Phase 1: Script  (sequential)
    // Phase 2: Visuals (parallel via ParallelExecutionEngine)
    // Phase 3: Audio   (sequential)
    // Phase 4: Assembly
  }
}
```

Pipelines consume:
- `CheckpointSystem` — gates for user approval, capped at `metadata.checkpointCount`.
- `ParallelExecutionEngine` — runs visual generation tasks in parallel, capped at `metadata.concurrencyLimit`.
- `callbacks.onProgress` — streams progress back to the UI.
- `callbacks.onCancelRequested` — exposes a cancel function to the caller.

---

## 9. How to Add a New Format

Follow these steps in order. A missing step will cause `PIPELINE_NOT_FOUND` at runtime.

### Step 1 — Add the ID to the union type

In `packages/shared/src/types.ts`:

```ts
export type VideoFormat =
  | 'youtube-narrator'
  // ... existing values ...
  | 'my-new-format';   // add here
```

### Step 2 — Register metadata in FormatRegistry

In `packages/shared/src/services/formatRegistry.ts`, add a `registerFormat()` call inside `registerAllFormats()`:

```ts
this.registerFormat({
  id: 'my-new-format',
  name: 'My New Format',
  description: 'Short description of what this format produces',
  icon: '🎯',
  durationRange: { min: 60, max: 300 },  // seconds
  aspectRatio: '16:9',
  applicableGenres: ['Genre A', 'Genre B'],
  checkpointCount: 3,     // max user-approval gates
  concurrencyLimit: 4,    // max parallel tasks
  requiresResearch: false,
  supportedLanguages: ['ar', 'en'],
});
```

### Step 3 — Define the pipeline phase structure

In `packages/shared/src/services/formatValidation.ts`, add a `case` to `getFormatPipelineStructure()`:

```ts
case 'my-new-format':
  return [
    { id: 'script',   name: 'Script Generation', order: 1, parallel: false },
    { id: 'visual',   name: 'Visual Generation', order: 2, parallel: true  },
    { id: 'audio',    name: 'Audio Generation',  order: 3, parallel: false },
    { id: 'assembly', name: 'Assembly',           order: 4, parallel: false },
  ];
```

Phases must have strictly increasing `order` values.

### Step 4 — Implement the pipeline class

Create `packages/shared/src/services/pipelines/myNewFormat.ts`:

```ts
import type { FormatMetadata, VideoFormat } from '../../types';
import type { FormatPipeline, PipelineRequest, PipelineResult, PipelineCallbacks } from '../formatRouter';
import { formatRegistry } from '../formatRegistry';

const FORMAT_ID: VideoFormat = 'my-new-format';

export class MyNewFormatPipeline implements FormatPipeline {
  getMetadata(): FormatMetadata {
    return formatRegistry.getFormat(FORMAT_ID)!;
  }

  async validate(request: PipelineRequest): Promise<boolean> {
    return !!request.idea && request.idea.trim().length > 0;
  }

  async execute(request: PipelineRequest, callbacks?: PipelineCallbacks): Promise<PipelineResult> {
    // Implement phases here
    return { success: true };
  }
}
```

### Step 5 — Register the pipeline with the router

In whichever initialization file bootstraps the router (search for other `registerPipeline` calls), add:

```ts
import { MyNewFormatPipeline } from './pipelines/myNewFormat';

formatRouter.registerPipeline('my-new-format', new MyNewFormatPipeline());
```

### Step 6 — Write tests

Create `packages/shared/src/services/pipelines/myNewFormat.test.ts` covering:
- `validate()` with valid and invalid requests.
- `execute()` with mocked AI services.
- `validateFormatCompliance()` for duration and aspect ratio bounds.
- `validateGenrePipelineInvariance()` for at least two genres.

---

## 10. Related Files

| File | Role |
|------|------|
| `packages/shared/src/types.ts` | `VideoFormat`, `FormatMetadata`, `PipelinePhase`, `FormatPipelineConfig` |
| `packages/shared/src/services/formatRegistry.ts` | Singleton `formatRegistry` |
| `packages/shared/src/services/formatRouter.ts` | Singleton `formatRouter`, all router interfaces |
| `packages/shared/src/services/formatValidation.ts` | Pure validation functions |
| `packages/shared/src/services/pipelines/*.ts` | One file per format |
| `packages/shared/src/services/checkpointSystem.ts` | User approval gates used inside pipelines |
| `packages/shared/src/services/parallelExecutionEngine.ts` | Parallel task runner used inside pipelines |
| `packages/frontend/components/FormatSelector.tsx` | UI component that reads `formatRegistry.getActiveFormats()` |
| `packages/frontend/hooks/useFormatPipeline.ts` | React hook wrapping `formatRouter.dispatch()` |
