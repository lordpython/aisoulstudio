# AI Logging Implementation Plan

## Overview

This plan details the implementation of comprehensive AI input/output logging for the Story Mode workflow. The goal is to capture and persist every AI call (prompts sent, responses received) to enable debugging, transparency, quality review, and iterative prompt improvement.

## Current State

- **No logging exists** for AI inputs/outputs — only console logs
- IndexedDB persistence layer exists (`lyriclens-production` database) with `idb` library
- Current stores: `sessions`, `story-sessions`, `blobs`
- ~10 distinct AI call types across 7 files need instrumentation

## Architecture

### Data Model

```typescript
interface AILogEntry {
    id: string;              // auto-generated: `log_${timestamp}_${random}`
    sessionId: string;       // story session ID (links to project)
    step: string;            // e.g. 'breakdown', 'screenplay', 'character_extract', 'image_gen', 'tts', 'shot_breakdown', 'animation'
    model: string;           // e.g. 'gemini-2.0-flash', 'imagen-4.0', 'gemini-2.5-flash-preview-tts'
    input: string;           // the prompt/input sent (truncated for binary)
    output: string;          // the response text (or metadata for images/audio)
    durationMs: number;      // wall-clock time of the API call
    timestamp: number;       // Date.now()
    status: 'success' | 'error';
    error?: string;          // error message if failed
    metadata?: Record<string, unknown>; // tokens, image dimensions, audio duration, etc.
}
```

### Storage Schema

New IndexedDB object store `ai-logs`:
- **Primary key**: `id` (string)
- **Indexes**:
  - `sessionId` — for querying all logs belonging to a session
  - `timestamp` — for chronological ordering
  - `step` — for filtering by step type

### Service API

```typescript
// Core logging function (fire-and-forget)
function logAICall(entry: Omit<AILogEntry, 'id' | 'timestamp'>): void;

// Ergonomic wrapper for any async AI operation
async function withAILogging<T>(
    sessionId: string | undefined,
    step: string,
    model: string,
    input: string,
    fn: () => Promise<T>,
    outputMapper?: (result: T) => string
): Promise<T>;

// Retrieval functions
function getLogsForSession(sessionId: string): Promise<AILogEntry[]>;
function getLogsByStep(sessionId: string, step: string): Promise<AILogEntry[]>;
function exportLogsAsJSON(sessionId: string): Promise<string>;
function clearLogsForSession(sessionId: string): Promise<void>;
```

### Usage Example

```typescript
// Before:
const response = await model.invoke(prompt);

// After:
const response = await withAILogging(
    sessionId,
    'screenplay',
    'gemini-2.0-flash',
    prompt,
    () => model.invoke(prompt),
    (r) => typeof r.content === 'string' ? r.content : JSON.stringify(r.content)
);
```

## Implementation Steps

### Step 1: Update persistence.ts

**File**: `services/ai/production/persistence.ts`

Changes:
1. Bump `DB_VERSION` from 1 to 2
2. Add `ai-logs` object store in the `upgrade` handler:
   ```typescript
   if (!db.objectStoreNames.contains('ai-logs')) {
       const aiLogsStore = db.createObjectStore('ai-logs', { keyPath: 'id' });
       aiLogsStore.createIndex('sessionId', 'sessionId');
       aiLogsStore.createIndex('timestamp', 'timestamp');
       aiLogsStore.createIndex('step', 'step');
   }
   ```
3. Add CRUD functions:
   - `saveAILog(entry: AILogEntry): Promise<void>`
   - `getAILogsForSession(sessionId: string): Promise<AILogEntry[]>`
   - `deleteAILogsForSession(sessionId: string): Promise<void>`
4. Update `cleanupOldSessions()` to also clean `ai-logs`
5. Update `clearAllPersistedData()` to clear `ai-logs`

### Step 2: Create aiLogService.ts

**File**: `services/aiLogService.ts` (new file)

```typescript
import { saveAILog, getAILogsForSession as getPersistedLogs } from './ai/production/persistence';

const MAX_LOG_LENGTH = 10000;
const truncate = (s: string) => s.length > MAX_LOG_LENGTH ? s.substring(0, MAX_LOG_LENGTH) + '...[truncated]' : s;

export interface AILogEntry {
    id: string;
    sessionId: string;
    step: string;
    model: string;
    input: string;
    output: string;
    durationMs: number;
    timestamp: number;
    status: 'success' | 'error';
    error?: string;
    metadata?: Record<string, unknown>;
}

function generateLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function logAICall(entry: Omit<AILogEntry, 'id' | 'timestamp'>): void {
    const fullEntry: AILogEntry = {
        ...entry,
        id: generateLogId(),
        timestamp: Date.now(),
        input: truncate(entry.input),
        output: truncate(entry.output),
    };
    
    // Fire-and-forget — never block the pipeline
    saveAILog(fullEntry).catch(err => {
        console.warn('[AILogService] Failed to save AI log (non-fatal):', err);
    });
}

export async function withAILogging<T>(
    sessionId: string | undefined,
    step: string,
    model: string,
    input: string,
    fn: () => Promise<T>,
    outputMapper?: (result: T) => string
): Promise<T> {
    // Skip logging if no sessionId provided
    if (!sessionId) {
        return fn();
    }
    
    const startTime = Date.now();
    
    try {
        const result = await fn();
        const durationMs = Date.now() - startTime;
        
        logAICall({
            sessionId,
            step,
            model,
            input,
            output: outputMapper ? outputMapper(result) : String(result),
            durationMs,
            status: 'success',
        });
        
        return result;
    } catch (error) {
        const durationMs = Date.now() - startTime;
        
        logAICall({
            sessionId,
            step,
            model,
            input,
            output: '',
            durationMs,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
        });
        
        throw error;
    }
}

export async function getLogsForSession(sessionId: string): Promise<AILogEntry[]> {
    return getPersistedLogs(sessionId);
}

export async function exportLogsAsJSON(sessionId: string): Promise<string> {
    const logs = await getLogsForSession(sessionId);
    return JSON.stringify(logs, null, 2);
}

export async function clearLogsForSession(sessionId: string): Promise<void> {
    const { deleteAILogsForSession } = await import('./ai/production/persistence');
    return deleteAILogsForSession(sessionId);
}
```

### Step 3: Instrument storyTools.ts

**File**: `services/ai/production/tools/storyTools.ts`

4 AI calls to wrap:

| Function | Line | Step | Model | Current Code |
|----------|------|------|-------|--------------|
| `generateBreakdownTool` | ~68 | `breakdown` | `MODELS.TEXT_EXP` | `await model.invoke(prompt)` |
| `createScreenplayTool` | ~149 | `screenplay` | `MODELS.TEXT_EXP` | `await model.invoke(prompt)` |
| `generateCharactersTool` | ~240 | `character_extract` | (delegated) | `await extractCharacters(scriptText)` |
| `generateShotlistTool` | ~298 | `shotlist` | `MODELS.TEXT_EXP` | `await model.invoke(prompt)` |

Changes:
1. Import `withAILogging` from `../../../aiLogService`
2. Wrap each `model.invoke()` call:

```typescript
// Example for breakdown tool
const response = await withAILogging(
    id,
    'breakdown',
    MODELS.TEXT_EXP,
    prompt,
    () => model.invoke(prompt),
    (r) => typeof r.content === 'string' ? r.content : JSON.stringify(r.content)
);
```

### Step 4: Instrument characterService.ts

**File**: `services/characterService.ts`

2 AI calls:

| Function | Line | Step | Model | Notes |
|----------|------|------|-------|-------|
| `extractCharacters` | ~48 | `character_extract` | `MODELS.TEXT_EXP` | Structured output via `.withStructuredOutput()` |
| `generateCharacterReference` | ~85 | `character_reference` | IMAGE | Calls `generateImageFromPrompt()` |

Changes:
1. Add optional `sessionId?: string` parameter to `extractCharacters()`
2. Add optional `sessionId?: string` parameter to `generateAllCharacterReferences()` (already has it)
3. Wrap the `model.invoke()` call in `extractCharacters`:

```typescript
export async function extractCharacters(
    scriptText: string,
    sessionId?: string
): Promise<CharacterProfile[]> {
    const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT_EXP,
        apiKey: GEMINI_API_KEY,
        temperature: 0.2,
    }).withStructuredOutput(CharacterExtractionSchema);

    const prompt = `Extract the main characters...`;

    try {
        const result = await withAILogging(
            sessionId,
            'character_extract',
            MODELS.TEXT_EXP,
            prompt,
            () => model.invoke(prompt),
            (r) => JSON.stringify(r)
        );
        // ... rest of function
    }
}
```

4. Update call site in `storyTools.ts`:
```typescript
const characters = await extractCharacters(scriptText, sessionId);
```

### Step 5: Instrument shotBreakdownAgent.ts

**File**: `services/ai/shotBreakdownAgent.ts`

1 AI call:

| Function | Line | Step | Model |
|----------|------|------|-------|
| `breakSceneIntoShots` | ~218 | `shot_breakdown` | `MODELS.TEXT` |

Changes:
1. Add optional `sessionId?: string` parameter to `breakSceneIntoShots()`
2. Import `withAILogging`
3. Wrap the `model.invoke()` call:

```typescript
export async function breakSceneIntoShots(
    scene: ScreenplayScene,
    genre: string,
    geminiModel?: ChatGoogleGenerativeAI,
    sessionId?: string
): Promise<Shot[]> {
    // ... existing setup ...
    
    const response = await withAILogging(
        sessionId,
        'shot_breakdown',
        MODELS.TEXT,
        prompt,
        () => model.invoke([{ role: 'user', content: prompt }]),
        (r) => typeof r.content === 'string' ? r.content : JSON.stringify(r.content)
    );
    // ... rest of function
}
```

4. Update `breakAllScenesIntoShots()` to accept and pass `sessionId`

### Step 6: Instrument narratorService.ts

**File**: `services/narratorService.ts`

1 AI call:

| Function | Line | Step | Model |
|----------|------|------|-------|
| `synthesizeSpeech` | ~639 | `tts` | `MODELS.TTS` |

Changes:
1. Add optional `sessionId?: string` parameter to `synthesizeSpeech()`
2. Add optional `sessionId?: string` parameter to `narrateScene()`
3. Wrap the `ai.models.generateContent()` call:

```typescript
const response = await withAILogging(
    sessionId,
    'tts',
    mergedConfig.model,
    styledText,
    () => ai.models.generateContent({
        model: mergedConfig.model,
        contents: [{ role: "user", parts: [{ text: styledText }] }],
        config: { ... }
    }),
    (r) => {
        const audioData = r.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        return `Audio: ${audioData?.mimeType}, ${audioData?.data?.length} bytes`;
    }
);
```

### Step 7: Instrument imageService.ts

**File**: `services/imageService.ts`

1 main AI call (with 2 backend paths):

| Function | Line | Step | Model |
|----------|------|------|-------|
| `generateImageFromPrompt` | ~380-384 | `image_gen` | `MODELS.IMAGE` |

Changes:
1. Already has `sessionId` parameter — use it for logging
2. Wrap the image generation calls:

```typescript
let imageUrl: string;
if (isImagenModel(MODELS.IMAGE)) {
    imageUrl = await withAILogging(
        sessionId,
        'image_gen',
        MODELS.IMAGE,
        finalPrompt,
        () => generateWithImagenAPI(finalPrompt, aspectRatio, effectiveSeed),
        (url) => `Image URL: ${url}`
    );
} else {
    imageUrl = await withAILogging(
        sessionId,
        'image_gen',
        MODELS.IMAGE,
        finalPrompt,
        () => generateWithGeminiAPI(finalPrompt, aspectRatio),
        (url) => `Image URL: ${url}`
    );
}
```

3. Also wrap `refineImagePrompt()` call as `prompt_refine` step if not skipped

### Step 8: Instrument videoService.ts

**File**: `services/videoService.ts`

1 AI call:

| Function | Line | Step | Model |
|----------|------|------|-------|
| `generateVideoFromPrompt` | ~284 | `video_gen` | Veo 3.1 |

Changes:
1. Add optional `sessionId?: string` parameter to `generateVideoFromPrompt()`
2. Wrap the `ai.models.generateVideos()` call:

```typescript
operation = await withAILogging(
    sessionId,
    'video_gen',
    modelToUse,
    finalPrompt,
    async () => {
        // @ts-ignore
        return await ai.models.generateVideos({
            model: modelToUse,
            prompt: finalPrompt,
            config: config,
        });
    },
    (op) => `Video operation: ${op.name || 'started'}`
);
```

### Step 9: Instrument useStoryGeneration.ts

**File**: `hooks/useStoryGeneration.ts`

~6 AI call types (called in loops):

| Line | Step | Model | What |
|------|------|-------|------|
| ~1042 | `image_gen` | IMAGE | `generateImageFromPrompt()` for storyboard visuals |
| ~1130-1154 | `image_regen` | IMAGE | Regenerate single shot visual |
| ~1334 | `tts` | TTS | `narrateScene()` for each scene |
| ~1439-1467 | `animation` | Veo | `animateImageWithDeApi()` or `generateVideoFromPrompt()` |

Changes:
1. The hook has `state.sessionId` available throughout
2. Pass `sessionId` to all service calls that now accept it
3. For direct AI calls (if any), wrap with `withAILogging`

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Fire-and-forget writes** | Logging never blocks the pipeline. All IndexedDB writes are async with catch handlers. |
| **Text only** | Binary data (images, audio, video) logged as metadata (URL, dimensions, duration) — never raw bytes. |
| **Truncation at 10,000 chars** | Prevents IndexedDB bloat from large prompts/responses. |
| **Session-scoped** | All logs keyed by `sessionId` for straightforward retrieval and cleanup. |
| **Optional sessionId** | Service functions use `sessionId?` parameter for backward compatibility. When not provided, logging is skipped. |
| **withAILogging wrapper** | Ergonomic API that handles timing, error capture, and logging in one place. |

## Verification Plan

1. **Manual browser console test**:
   ```javascript
   // After running a story workflow
   const { getLogsForSession } = await import('/services/aiLogService.ts');
   const logs = await getLogsForSession('your-session-id');
   console.table(logs.map(l => ({ step: l.step, model: l.model, durationMs: l.durationMs, status: l.status })));
   ```

2. **Verify each step**:
   - [ ] `breakdown` log appears after story breakdown generation
   - [ ] `screenplay` log appears after screenplay creation
   - [ ] `character_extract` log appears after character extraction
   - [ ] `character_reference` logs appear for each character
   - [ ] `shotlist` log appears after shotlist generation
   - [ ] `shot_breakdown` logs appear when breaking scenes into shots
   - [ ] `image_gen` logs appear for each generated image
   - [ ] `tts` logs appear for each narrated scene
   - [ ] `animation` logs appear for each animated shot

3. **Error logging test**:
   - Simulate an API failure and verify error is captured with `status: 'error'` and `error` message

## File Changes Summary

| File | Change Type | Lines Changed (est.) |
|------|-------------|---------------------|
| `services/ai/production/persistence.ts` | Modify | +50 |
| `services/aiLogService.ts` | New | +100 |
| `services/ai/production/tools/storyTools.ts` | Modify | +30 |
| `services/characterService.ts` | Modify | +20 |
| `services/ai/shotBreakdownAgent.ts` | Modify | +15 |
| `services/narratorService.ts` | Modify | +20 |
| `services/imageService.ts` | Modify | +25 |
| `services/videoService.ts` | Modify | +15 |
| `hooks/useStoryGeneration.ts` | Modify | +30 |

**Total estimated changes**: ~300 lines across 9 files

## Future Enhancements (Out of Scope)

- UI panel for viewing logs within the app
- Log export to file (download as JSON)
- Token usage tracking and cost estimation
- Log-based evaluation metrics (response quality scoring)
- Integration with external observability (OpenTelemetry, etc.)
