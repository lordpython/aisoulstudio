# Utility and Support Services

**Last Updated:** 2026-03-26
**Source Package:** `packages/shared/src/services/`

This document covers the research, quality monitoring, visual consistency, error handling, logging, text processing, language detection, document parsing, and project persistence services used throughout the AI Soul Studio pipeline.

---

## Table of Contents

1. [ResearchService](#1-researchservice)
2. [QualityMonitorService](#2-qualitymonitorservice)
3. [VisualConsistencyService](#3-visualconsistencyservice)
4. [ErrorAggregator, CriticalFailureHandler, RateLimitQueue](#4-erroraggregator-criticalfailurehandler-and-ratelimitqueue)
5. [Logger (agentLogger)](#5-logger-agentlogger)
6. [TextSanitizer](#6-textsanitizer)
7. [LanguageDetector](#7-languagedetector)
8. [DocumentParser](#8-documentparser)
9. [ProjectService](#9-projectservice)

---

## 1. ResearchService

**File:** `packages/shared/src/services/researchService.ts`
**Singleton:** `researchService` (exported instance)

Performs multi-query research by running sub-queries in parallel via `ParallelExecutionEngine`, then deduplicating and ranking the resulting sources. Used by content-heavy pipeline formats (news, documentary, educational) before script generation.

### Key Types

```ts
interface ResearchQuery {
  topic: string;
  language: 'ar' | 'en';
  depth: 'shallow' | 'medium' | 'deep';
  sources: ('web' | 'knowledge-base' | 'references')[];
  maxResults: number;
  referenceDocuments?: IndexedDocument[];
}

interface ResearchResult {
  sources: Source[];
  summary: string;
  citations: Citation[];
  confidence: number;      // 0–1, product of success rate and avg relevance
  partial?: boolean;       // true when some sub-queries failed
  failedQueries?: number;
}

interface Source {
  id: string;
  title: string;
  content: string;
  url?: string;
  type: 'web' | 'knowledge-base' | 'reference';
  relevance: number;       // capped at 0.85 for web; 1.0 for references
  language: 'ar' | 'en';
}

interface Citation {
  sourceId: string;
  text: string;    // source title
  position: number;
}

interface IndexedDocument {
  id: string;
  filename: string;
  content: string;
  chunks: string[];
  metadata: Record<string, any>;
}
```

### `research(query: ResearchQuery): Promise<ResearchResult>`

Builds a task list from the query, executes all tasks concurrently (max 5 concurrent, 2 retries with exponential backoff, 30 s timeout per task), then:

1. Collects sources from successful tasks; increments `failedQueries` for failures.
2. Deduplicates using 3-gram Jaccard similarity — sources with similarity above 0.9 are dropped.
3. Sorts: `reference` sources always come first, then by `relevance` descending.
4. Truncates to `maxResults`.
5. Builds a plain-text `summary` from the top 3 source snippets.
6. Builds a `citations` array (one entry per source).
7. Calculates `confidence` as `successRate * avgRelevance`.

If any tasks fail, the result still returns with whatever succeeded and sets `partial: true`.

### Depth Levels

| depth    | parallel sub-queries |
|----------|----------------------|
| shallow  | 3                    |
| medium   | 5                    |
| deep     | 8                    |

Each sub-query targets a different aspect of the topic (overview, historical background, current state, key facts, expert analysis, related topics, challenges, future implications). Arabic queries use Arabic-language aspect prompts.

### Source Types

- `web` / `knowledge-base` — both invoke Gemini with `googleSearch` grounding. Real URLs are extracted from `groundingMetadata.groundingChunks` when available. Relevance is capped at 0.85.
- `references` — sourced directly from uploaded `IndexedDocument` objects. Task priority is 2 (vs 1 for web), so they are scheduled first. Relevance is always 1.0.

### `prioritizeReferences(documents: File[]): Promise<IndexedDocument[]>`

Converts browser `File` objects into `IndexedDocument` records. Files that fail to parse are silently skipped (warning logged). Content is chunked at 1000-character boundaries.

### Gotchas

- `knowledge-base` is treated identically to `web` at the Gemini call level — the distinction is cosmetic for the source type label.
- The `summary` field is a local string concatenation of top-3 snippets (max 200 chars each), not an LLM-generated summary.
- Confidence drops to 0 if no sources are returned, regardless of failure count.

---

## 2. QualityMonitorService

**File:** `packages/shared/src/services/qualityMonitorService.ts`

A collection of pure functions (no class) that produce a `ProductionQualityReport` from a completed production's data. Typically called after the full pipeline finishes, before presenting results to the user.

### Key Types

```ts
interface ProductionQualityReport {
  overallScore: number;     // weighted: content 35%, timing 25%, visual 25%, audio 15%
  contentScore: number;
  timingScore: number;
  visualScore: number;
  audioScore: number;
  title: string;
  videoPurpose: VideoPurpose;
  totalDuration: number;
  sceneCount: number;
  timestamp: Date;
  sceneMetrics: SceneQualityMetrics[];
  strengths: string[];
  weaknesses: string[];
  actionableImprovements: string[];
  avgWordsPerSecond: number;
  avgSceneDuration: number;
  visualCoverage: number;   // always 100 (assumed)
  audioCoverage: number;    // % of scenes with narration audio
  sfxCoverage: number;      // % of scenes with SFX
  aiSfxAccuracy: number;    // % of AI-suggested SFX IDs matched in final plan
  contentPlannerCreativity: 'low' | 'medium' | 'high';
}

interface SceneQualityMetrics {
  sceneId: string;
  sceneName: string;
  duration: number;
  narrationDuration: number | null;
  timingSync: number;              // 0–100; deducted 10 pts per second off-sync
  wordsPerSecond: number;
  visualDescriptionLength: number;
  visualDescriptionQuality: 'poor' | 'fair' | 'good' | 'excellent';
  narrationWordCount: number;
  narrationQuality: 'poor' | 'fair' | 'good' | 'excellent';
  hasSfx: boolean;
  sfxRelevance: number;            // 0–100
  hasAudioUrl: boolean;
  issues: string[];
  suggestions: string[];
}
```

### `generateQualityReport(contentPlan, narrationSegments, sfxPlan, validation, videoPurpose): ProductionQualityReport`

The main entry point. Iterates every scene and runs three sub-analyses:

- **Visual description quality** — scored on length (80–180 chars is optimal), presence of concrete visual keywords (color, lighting, camera angle), absence of vague adjectives, and presence of motion words.
- **Narration quality** — scored on words-per-second (optimal 2.0–2.8), average sentence length (5–25 words ideal), and engagement markers (questions, power words like "discover", "imagine").
- **SFX relevance** — keyword matching between scene text and a built-in map of SFX IDs to expected scene keywords (e.g., `ocean-waves` expects "ocean", "sea", "beach").

Timing sync deducts 10 points per second of difference between `narration.audioDuration` and `scene.duration`.

### History Storage

```ts
saveReportToHistory(report)   // persists to localStorage key "lyriclens_quality_history" (last 20)
getQualityHistory()           // reads history array
getHistoricalAverages()       // returns averages + trend ('improving' | 'stable' | 'declining')
exportReportAsJson(report)    // JSON.stringify(report, null, 2)
getQualitySummary(report)     // single-line string for quick display
```

### Gotchas

- `visualCoverage` is hardcoded to 100. It does not actually check whether images were generated.
- The localStorage key is `"lyriclens_quality_history"` (old project name), not `"ai_soul_studio_..."`. This is a known inconsistency.
- `contentPlannerCreativity` is `"high"` only when average description length exceeds 120 chars AND the content plan uses at least 2 distinct tones.

---

## 3. VisualConsistencyService

**File:** `packages/shared/src/services/visualConsistencyService.ts`

Two independent concerns in one file:

1. **Style extraction and injection** — extracts a `VisualStyle` from a reference image and appends it to subsequent scene prompts.
2. **Character consistency verification** — compares generated scene images against a `CharacterProfile` using Gemini Vision.

### Style Extraction

```ts
interface VisualStyle {
  colorPalette: string[];    // 3–5 descriptive color names
  lighting: string;
  texture: string;
  moodKeywords: string[];
  stylePrompt: string;       // ready-to-append prompt string
}
```

`extractVisualStyle(imageUrl, sessionId?)` calls Gemini Vision to analyze the reference image and returns a `VisualStyle`. Results are cached in a module-level `Map<string, VisualStyle>` keyed by `sessionId`. On API failure or missing key, it returns a hardcoded cinematic default (teal/orange palette, film grain).

`injectStyleIntoPrompt(prompt, style)` appends `. Style: {colorDesc}, {lighting}, {texture}, {mood1}, {mood2}` to a scene prompt, truncating the total to 500 characters.

Accepted `imageUrl` formats:
- `data:image/...;base64,...` — used as-is
- `http(s)://...` — fetched and converted to base64 data URL
- Anything else — treated as raw base64 and prefixed with `data:image/png;base64,`

Cache helpers: `clearStyleCache(sessionId)`, `hasStyleCache(sessionId)`.

### Character Consistency Verification

```ts
interface ConsistencyReport {
  score: number;           // 0–100
  isConsistent: boolean;   // score > 75
  issues: string[];        // e.g., "Hair color changed from blonde to brown"
  suggestions: string[];   // prompt fixes for subsequent shots
  details: string;         // full AI analysis text
}
```

`verifyCharacterConsistency(imageUrls, profile, language?)` sends up to 5 images alongside a `CharacterProfile` to Gemini and asks it to evaluate facial features, hair, eye color, apparent age, body type, and clothing.

Returns `{ score: 100, isConsistent: true }` when no API key is configured or no images are provided. Returns `{ score: 50, isConsistent: false }` if the Gemini call throws.

### Gotchas

- Style cache is module-level and is not cleared between unrelated projects unless `clearStyleCache` is called explicitly.
- The DOCX PDF approach in `extractVisualStyle` for base64 conversion uses `btoa` with `String.fromCharCode`, which can corrupt binary data for large images. For images above ~1 MB, the quality may degrade.
- `verifyCharacterConsistency` processes at most the first 5 images; additional images are silently ignored.

---

## 4. ErrorAggregator, CriticalFailureHandler, and RateLimitQueue

**File:** `packages/shared/src/services/errorAggregator.ts`

Three cooperating classes for pipeline error handling. All are React-free and work in Node.js.

### ErrorAggregator

Collects `PipelineError` objects and formats them for display.

```ts
interface PipelineError {
  code: ErrorCode;       // 'FORMAT_NOT_FOUND' | 'TASK_FAILED' | 'RATE_LIMIT_EXCEEDED' | ...
  message: string;
  phase: string;
  taskId?: string;
  recoverable: boolean;
  retryable: boolean;
  details?: any;
}
```

```ts
const aggregator = new ErrorAggregator();
aggregator.addError(error);           // appends to internal list; logs at warn level
aggregator.getErrors()                // returns a copy of the array
aggregator.getAggregatedMessage()     // grouped by phase, multi-line string
aggregator.hasErrors()
aggregator.hasCriticalErrors()        // true if any error has recoverable: false
aggregator.clear()
```

`getAggregatedMessage()` groups errors by `phase` when there is more than one error, producing output of the form:

```
3 errors occurred during pipeline execution:
  Phase "assembly":
    - [TASK_FAILED] FFmpeg failed (task: task-3)
  Phase "script":
    - [TASK_TIMEOUT] LLM timed out
```

### CriticalFailureHandler

Wraps an `ErrorAggregator` and an `OnCriticalFailure` callback. Call `handleFailure(error)` in pipeline catch blocks.

```ts
type OnCriticalFailure = (
  error: PipelineError,
  options: RecoveryOption[],
) => Promise<CriticalFailureResult>;

// RecoveryOption actions: 'retry' | 'edit' | 'skip' | 'cancel'
```

Phases considered critical (will invoke the callback): `script`, `screenplay`, `assembly`, `final-assembly`. All other phases auto-return `{ action: 'skip' }`.

### RateLimitQueue

Retries a task on rate-limit errors, waiting for the delay specified in the error's `retry-after` header (or defaulting to 60 s).

```ts
const queue = new RateLimitQueue({ defaultResetMs: 60_000 });
const result = await queue.enqueue(() => callExternalApi());
```

Detection logic checks HTTP status 429, and error message strings `"rate limit"`, `"too many requests"`, `"quota exceeded"`, `"429"`. The delay is read from `error.details['retry-after']`, `error.headers['retry-after']`, or `error.retryAfter` (in that priority order), converted from seconds to milliseconds.

### Gotchas

- `CriticalFailureHandler` adds every error to the aggregator via `addError`, even non-critical ones.
- `RateLimitQueue.enqueue` loops indefinitely until the task succeeds or throws a non-rate-limit error. There is no maximum retry count.

---

## 5. Logger (agentLogger)

**File:** `packages/shared/src/services/logger.ts`

A lightweight structured logger with contextual prefixes.

### Log Levels

```ts
enum LogLevel {
  DEBUG = 0,
  INFO  = 1,
  WARN  = 2,
  ERROR = 3,
  SILENT = 4,
}
```

Default level is `DEBUG` in development and `WARN` in production (detected via `import.meta.env.PROD` in the browser, `process.env.NODE_ENV` on the server).

### Pre-configured Instances

```ts
import { agentLogger, serverLogger, exportLogger, ffmpegLogger, sunoLogger, geminiLogger } from './logger';
```

| Export         | Context   | Used by                            |
|----------------|-----------|------------------------------------|
| `logger`       | `App`     | General application use            |
| `agentLogger`  | `Agent`   | Pipeline stages, `errorAggregator` |
| `serverLogger` | `Server`  | Express server routes              |
| `exportLogger` | `Export`  | Export pipeline                    |
| `ffmpegLogger` | `FFmpeg`  | FFmpeg services                    |
| `sunoLogger`   | `Suno`    | Suno music API                     |
| `geminiLogger` | `Gemini`  | Gemini API calls                   |

### Child Loggers

`logger.child(subContext)` creates a new `Logger` whose context is `Parent:Sub`, inheriting the parent's log level.

```ts
// In errorAggregator.ts:
const log = agentLogger.child('ErrorAggregator');
log.warn('...');   // outputs: [Agent:ErrorAggregator] ...

// In pipeline files:
const log = agentLogger.child('NewsPoliticsPipeline');
log.info('Starting research phase');
```

### Callbacks

```ts
logger.addCallback((entry: LogEntry) => {
  // entry: { level, timestamp, context, message, data? }
  sendToExternalService(entry);
});
logger.removeCallback(myCallback);
```

Callbacks are called for every log entry that passes the level threshold, before the console output.

### Creating Ad-hoc Loggers

```ts
import { createLogger } from './logger';
const log = createLogger('MyFeature');
```

---

## 6. TextSanitizer

**File:** `packages/shared/src/services/textSanitizer.ts`

Cleans AI-generated narration text of markdown artifacts and screenplay metadata before passing content to TTS or rendering subtitles. Extracted from `useStoryGeneration` for testability.

### Functions

```ts
cleanForTTS(text: string): string
```

Applies all regex cleaning patterns and returns a single clean string. Used immediately before passing narration to `narratorService`.

```ts
cleanForSubtitles(
  text: string,
  maxCharsPerChunk?: number,  // default 80
  minDisplayTimeSec?: number, // default 1.5
): { chunks: string[]; minDisplayTime: number }
```

Same cleaning as `cleanForTTS`, then splits the result into display chunks that fit within `maxCharsPerChunk` characters. Splits at sentence boundaries (English `.!?` and Arabic `،؛`). If a chunk still exceeds 1.5x the limit after sentence splitting, it is split at the nearest word boundary to the midpoint.

### What Gets Stripped

| Pattern type          | Examples removed                                   |
|-----------------------|----------------------------------------------------|
| Bold labels           | `**Emotional Hook:**`, `**Key Beat:**`             |
| Italic markers        | `*text*` — markers removed, content kept          |
| Markdown headings     | `## Scene Title`                                   |
| Inline code           | `` `code` `` — markers removed, content kept      |
| Scene direction brackets | `[Scene Direction:]`, `[Visual:]`             |
| Screenplay directions | `(Note: ...)`, `(SFX: ...)`, `(Music: ...)`        |
| Screenplay prefixes   | `INT.`, `EXT.`                                     |
| Scene headers         | `Scene 3:`, `Scene 3.`                             |
| Arabic scene markers  | `المشهد ١:`, `مشهد ٣:`                             |
| Arabic narrative labels | `الخطاف العاطفي:`, `الراوي:`, `وصف المشهد:`    |
| English metadata labels | `Emotional Hook:`, `Narrative Beat:`, `Beat:`  |
| Horizontal rules      | `---`                                              |
| Blockquotes           | `> text`                                           |
| Bullet points         | `- item`, `* item`, `+ item`                       |
| Trailing numbering    | `٢. **` at end of string                           |

### Gotchas

- Arabic punctuation `،` (Arabic comma) and `؛` (Arabic semicolon) are treated as sentence terminators for chunking.
- The order of regex patterns matters. Arabic compound patterns (`المشهد`) are applied before simpler patterns (`مشهد`) to prevent partial matches leaving residue.
- `cleanForSubtitles` does not split on arbitrary character positions mid-word; if no space is found near the midpoint, the oversized chunk is kept as-is.

---

## 7. LanguageDetector

**File:** `packages/shared/src/services/languageDetector.ts`
**Singleton:** `languageDetector`

Detects whether text is primarily Arabic or English using Unicode character-range counting. Replaces ad-hoc `/ [\u0600-\u06FF]/.test(text)` inline checks.

### Interface

```ts
interface LanguageDetectionResult {
  language: 'ar' | 'en';
  confidence: number;          // 0–1; ratio of winning script to total alpha chars
  scores: { ar: number; en: number };  // raw character counts
}
```

### Detection Logic

Counts Arabic characters (U+0600–U+06FF and Arabic Supplement U+0750–U+077F) and Latin characters (A–Z, a–z, and extended Latin U+00C0–U+024F). If the Arabic share of total alpha characters exceeds 30%, the text is classified as Arabic.

| Input                          | Result              |
|-------------------------------|---------------------|
| Empty or whitespace-only text  | `en`, confidence 1  |
| No alpha characters (numbers/symbols) | `en`, confidence 0.5 |
| >30% Arabic characters         | `ar`                |
| ≤30% Arabic characters         | `en`                |

### API

```ts
languageDetector.detect(text)    // returns LanguageDetectionResult
languageDetector.isArabic(text)  // boolean
languageDetector.isEnglish(text) // boolean

// Standalone function for drop-in replacement:
detectLanguage(text)             // returns 'ar' | 'en'
```

### Gotchas

- Only Arabic and English are supported. Scripts such as French, Spanish, or Chinese are treated as English (all non-Arabic Latin or non-Latin).
- Mixed Arabic/English text (e.g., a paragraph with embedded Arabic phrases) will be classified Arabic if Arabic characters exceed 30% of the total alpha count.
- The `detectLanguageFromText` function in `production/utils.ts` supports more language codes; this service is intentionally narrower to match pipeline requirements.

---

## 8. DocumentParser

**File:** `packages/shared/src/services/documentParser.ts`

Parses reference documents from `File` objects into `IndexedDocument` structs suitable for `ResearchService`. React-free; works in both browser and Node.js.

### Supported Formats

| Format | Extension | MIME type                                                              |
|--------|-----------|------------------------------------------------------------------------|
| Plain text | `.txt` | `text/plain`                                                       |
| PDF    | `.pdf`    | `application/pdf`                                                      |
| Word   | `.docx`   | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |

### Types

```ts
interface IndexedDocument {
  id: string;            // "doc_{timestamp}_{random}"
  filename: string;
  content: string;       // full extracted text
  chunks: string[];      // content split at ~500-char sentence boundaries
  metadata: {
    size: number;
    type: string;
    chunkCount: number;
    wordCount: number;
    parsedAt: string;    // ISO timestamp
  };
}
```

### `parseDocument(file: File): Promise<IndexedDocument>`

Dispatches to the appropriate parser by file extension. Throws `DocumentParseError` if:
- The extension is not in the supported list.
- The extracted content is empty.
- The underlying parser throws.

### Parser Internals

- **TXT** — reads via `FileReader` (browser) or `File.text()` (Node); decodes as UTF-8.
- **DOCX** — implements a minimal ZIP parser in pure JavaScript to locate `word/document.xml`. Extracts text from `<w:t>` tags, preserving paragraph breaks from `</w:p>` boundaries. Uses `DecompressionStream('deflate-raw')` when available for deflate-compressed entries.
- **PDF** — basic extraction from raw PDF byte streams. Finds BT...ET text blocks and extracts strings from `Tj` and `TJ` operators. Falls back to a placeholder string `"[PDF: name] This PDF requires server-side parsing..."` when no text is found.

### `chunkContent(content, chunkSize?): string[]`

Splits content into chunks at sentence boundaries (`[^.!?]+[.!?]+\s*`). Default chunk size is 500 characters. A sentence that would push a chunk over the limit is moved to the next chunk.

### `DocumentParseError`

```ts
class DocumentParseError extends Error {
  filename: string;
  // message: "Document parsing failed for '{filename}': {reason}"
}
```

### Gotchas

- PDF extraction is basic and only works reliably for simple text-only PDFs. Scanned PDFs, encrypted PDFs, and PDFs with embedded fonts will produce empty or garbled text, triggering the server-side parsing placeholder.
- DOCX compressed entry parsing requires `DecompressionStream` (available in modern browsers; absent in Node.js < 18 without a polyfill). In environments without it, compressed `.docx` files return `null` for `word/document.xml` and throw.
- The `DocumentParser` and `ResearchService` each define an `IndexedDocument` interface independently. They are structurally identical.

---

## 9. ProjectService

**File:** `packages/shared/src/services/projectService.ts`

CRUD operations for user projects persisted in Firestore. All operations are user-scoped and silently return `null` / `false` / `[]` when Firebase is not configured or no user is authenticated.

### Firestore Schema

```
/users/{userId}/projects/{projectId}     — Project document
/users/{userId}/projects/{projectId}/exports/{exportId}  — ExportRecord subcollection
```

### Types

```ts
type ProjectType   = 'production' | 'story' | 'visualizer';
type ProjectStatus = 'draft' | 'in_progress' | 'completed' | 'archived';

interface Project {
  id: string;              // "proj_{timestamp}_{random}"
  userId: string;
  title: string;
  description?: string;
  type: ProjectType;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  thumbnailUrl?: string;
  duration?: number;       // seconds
  style?: string;
  topic?: string;
  language?: string;
  sceneCount?: number;
  hasVisuals?: boolean;
  hasNarration?: boolean;
  hasMusic?: boolean;
  hasExport?: boolean;
  cloudSessionId: string;  // "production_{projectId}"
  tags?: string[];
  isFavorite?: boolean;
}

interface ExportRecord {
  id: string;
  projectId: string;
  format: 'mp4' | 'webm' | 'gif';
  quality: 'draft' | 'standard' | 'high' | 'ultra';
  aspectRatio: '16:9' | '9:16' | '1:1';
  cloudUrl?: string;
  localUrl?: string;
  fileSize?: number;
  duration?: number;
  createdAt: Date;
  settings?: Record<string, unknown>;
}
```

### Project CRUD

```ts
createProject(input: CreateProjectInput): Promise<Project | null>
getProject(projectId: string): Promise<Project | null>
updateProject(projectId: string, updates: UpdateProjectInput): Promise<boolean>
deleteProject(projectId: string): Promise<boolean>
listUserProjects(maxResults?: number): Promise<Project[]>  // default 50, ordered by updatedAt desc
```

`getProject` verifies that the authenticated user's UID matches `project.userId` before returning the document.

`deleteProject` reads and ownership-checks the document before deleting. The `exports` subcollection is **not** deleted — Firestore does not cascade deletes. Full cleanup would require a Cloud Function.

### Utility Functions

```ts
markProjectAccessed(projectId)           // updates lastAccessedAt; non-critical, never throws
toggleFavorite(projectId): Promise<boolean>
searchProjects(searchTerm): Promise<Project[]>  // client-side filter on title, topic, description
getRecentProjects(): Promise<Project[]>  // last 5 by lastAccessedAt
getFavoriteProjects(): Promise<Project[]>
isProjectServiceAvailable(): boolean     // Firebase configured AND user authenticated
getProjectCount(): Promise<number>       // fetches up to 1000 to count
```

### Export History

```ts
saveExportRecord(projectId, exportData): Promise<ExportRecord | null>
// Also calls updateProject(projectId, { hasExport: true })

getExportHistory(projectId, maxResults?: number): Promise<ExportRecord[]>  // default 20, desc
```

### Gotchas

- `searchProjects` fetches up to 100 projects then filters client-side. Firestore does not support full-text search natively.
- `getProjectCount` fetches up to 1000 documents to count them. For large accounts this is expensive.
- Firestore rejects documents containing `undefined` values. When constructing project data to write, ensure all optional fields are omitted or set to a defined value. See the global CLAUDE.md gotcha on `sanitizeForFirestore`.
- `createProject` uses `serverTimestamp()` for Firestore writes but returns a `Project` with `new Date()` for `createdAt`/`updatedAt`. The in-memory object will not reflect the server-resolved timestamp until a subsequent `getProject` call.
- `cloudSessionId` is set to `"production_{projectId}"` at creation and is never updated. It is used as a lookup key for cloud storage sessions.
