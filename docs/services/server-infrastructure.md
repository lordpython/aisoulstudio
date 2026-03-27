# Server Infrastructure

**Last Updated:** 2026-03-26
**Entry Point:** `packages/server/index.ts`
**Port:** 3001 (default), configurable via `PORT` env var

## 1. Server Startup Sequence

The server binds to `0.0.0.0:3001` first, then runs rendering infrastructure initialization asynchronously so the API is immediately available even if FFmpeg or hardware encoder detection is slow.

```
app.listen(3001)
    └─► initializeRenderingInfrastructure()
            ├── 1. detectEncoders()          — probe GPU/CPU encoders
            ├── 2. workerPool.setMessageHandler(...)
            ├── 3. workerPool.initialize()   — pre-spawn one worker process
            ├── 4. jobQueue.setJobProcessor(...)
            └── 5. jobQueue.initialize()     — recover jobs from disk, start timeout manager
```

If any step in `initializeRenderingInfrastructure` throws, the error is logged and the server continues running. All non-export routes remain fully operational.

### Graceful Shutdown

Both `SIGTERM` and `SIGINT` call `jobQueue.shutdown()` then `workerPool.shutdown()` (which sends `SHUTDOWN` to each worker and waits up to 5 seconds before forceful kill).

---

## 2. Job Queue

**File:** `packages/server/services/jobQueue/index.ts`

### Job Lifecycle

```
pending ──► uploading ──► queued ──► encoding ──► complete
                                                      │
                                           failed ◄───┘ (on error or timeout, up to maxRetries)
```

| State | Description |
|---|---|
| `pending` | Job created, waiting for frames |
| `uploading` | Frames arriving in chunks |
| `queued` | All frames received; waiting for a worker slot |
| `encoding` | Worker is actively encoding |
| `complete` | Output file ready for download |
| `failed` | Exceeded retries or permanently errored |

### Concurrency

`MAX_CONCURRENT_JOBS = 2`. A mutex flag (`isProcessing`) prevents concurrent invocations of `processNextJob` from racing past the capacity check.

### Persistence (jobStore.ts)

Every status change is written to `{TEMP_DIR}/jobs/{jobId}.json`. On startup, `loadIncompleteJobs()` recovers any jobs that were in `encoding` state (reset to `queued`, retry count incremented) or still `queued`. This survives server restarts.

Job IDs are sanitized with `/[^a-zA-Z0-9_-]/g` before being used as file names to prevent path traversal.

Old completed/failed jobs are deleted hourly by `cleanupOldJobs(24)` (jobs older than 24 hours).

### Retry Policy

Each job has a `maxRetries` count. Both errors from workers and timeout events will re-queue the job if retries remain. The `handleJobError` and `handleJobTimeout` methods share the same re-queue logic.

---

## 3. Timeout Manager

**File:** `packages/server/services/jobQueue/timeoutManager.ts`

A polling loop runs every 5 seconds and checks two conditions for each active job:

| Condition | Threshold | Action |
|---|---|---|
| No heartbeat received | 60 seconds | Trigger `stall` timeout |
| Total job duration exceeded | 30 minutes | Trigger `timeout` timeout |

Workers are expected to send `HEARTBEAT` messages every 5 seconds via IPC. When a timeout fires, the job is untracked and the `JobQueueManager.handleJobTimeout` callback is invoked, which either re-queues the job or marks it `failed`.

---

## 4. Worker Pool

**File:** `packages/server/workers/workerPool.ts`

`MAX_WORKERS = 4`, each with an 8 GB Node.js heap limit (`--max-old-space-size=8192`).

### Worker Lifecycle

```
spawnWorker()  ── fork('ffmpegWorker.ts', { execArgv: ['--import', 'tsx', ...] })
    │
    ├── worker.on('message') ──► handleWorkerMessage()
    ├── worker.stdout/stderr  ──► logged at debug/warn level
    └── worker.on('exit')     ──► handleWorkerExit()
                                      └── if not shutting down: respawn after 1s
```

On initialization, one worker is pre-spawned to reduce latency for the first incoming job.

### IPC Message Protocol

**Main → Worker:**

| Message type | Payload | Effect |
|---|---|---|
| `START_JOB` | `{ job: RenderJob }` | Begin FFmpeg encoding |
| `CANCEL_JOB` | — | `SIGTERM` the FFmpeg process |
| `SHUTDOWN` | — | Stop timers, cancel current job, `process.exit(0)` after 1s |

**Worker → Main:**

| Message type | Payload | Effect |
|---|---|---|
| `STARTED` | `{ jobId }` | Worker records `currentJobId` |
| `PROGRESS` | `{ progress, currentFrame, totalFrames, encodingSpeed }` | Forwarded to `jobQueue.updateJobProgress` |
| `HEARTBEAT` | `{ jobId }` | Forwarded to `jobQueue.recordHeartbeat` → timeout manager |
| `MEMORY_WARNING` | `{ memoryUsage }` | Logged; pool tracks `worker.memoryUsage` |
| `COMPLETE` | `{ outputPath, outputSize, progress: 100 }` | Forwarded to `jobQueue.updateJobStatus('complete', ...)` |
| `ERROR` | `{ error }` | Forwarded to `jobQueue.handleJobError` |

If a worker process exits unexpectedly while it holds a job, the pool synthesizes an `ERROR` message for that job before respawning.

---

## 5. FFmpeg Worker

**File:** `packages/server/workers/ffmpegWorker.ts`

Each worker is a standalone Node.js process. It receives a `RenderJob` over IPC, locates the session directory at `{TEMP_DIR}/{sessionId}/`, builds FFmpeg arguments, and spawns the `ffmpeg` binary.

### FFmpeg Command Structure

```
ffmpeg
  -framerate {fps}
  -i {sessionDir}/frame%06d.jpg
  [-i {sessionDir}/audio.mp3]        # if present
  -c:v {encoder} {encoder-args}      # from encoderStrategy ENCODING_SPEC
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -pix_fmt yuv420p
  [-c:a aac -b:a 256k -shortest]     # if audio present
  -movflags +faststart
  -y {sessionDir}/output.mp4
```

Progress is parsed from FFmpeg's stderr (`frame= NNN fps= ...`) and emitted as `PROGRESS` IPC messages at 1% intervals. The worker also runs a heartbeat timer (every 5s) and a memory monitor (warns when heap exceeds 1.5 GB).

---

## 6. Encoder Strategy

**File:** `packages/server/services/encoding/encoderStrategy.ts`

### Detection Order (priority)

| Priority | Encoder | Type |
|---|---|---|
| 1 | `h264_nvenc` | NVIDIA GPU |
| 2 | `h264_qsv` | Intel Quick Sync |
| 3 | `h264_amf` | AMD GPU |
| 4 | `libx264` | CPU software (always available) |

`detectEncoders()` queries `ffmpeg -encoders`, then performs a real 0.1-second test encode at 1280x720 for each hardware encoder (10s timeout). Results are cached in a module-level `Map`. `libx264` is always marked available as a guaranteed fallback.

`getSelectedEncoder()` returns the cached result. If called before `detectEncoders()` completes (e.g., legacy sync route), it falls back to a synchronous encoder list check.

### ENCODING_SPEC

All encoders output with:
- Color space: BT.709
- Pixel format: `yuv420p`
- Quality defaults: CQ/CRF 18-19 depending on encoder

`getEncoderArgs(encoder, quality?)` returns the full FFmpeg argument slice for the chosen encoder, including color metadata.

`getFallbackChain(primary)` returns an ordered list of available encoders to try if the primary fails.

---

## 7. SSE (Server-Sent Events) — Export Progress

**Endpoint:** `GET /api/export/events/:jobId`

The SSE endpoint sets `Content-Type: text/event-stream` and subscribes to `jobQueue.subscribe(jobId, callback)`. Each `JobProgress` object is serialized as `data: {...}\n\n`.

```
Client                         Server (export.ts)               JobQueueManager
  │                                   │                                │
  ├─── GET /events/:jobId ──────────► │                                │
  │                                   ├── subscribe(jobId, cb) ──────► │
  │                                   │                        ◄─────  │ current state sent immediately
  │ ◄─── data: {status, progress} ────┤                                │
  │                                   │                                │
  │           (encoding in progress)  │     worker PROGRESS msg ──────►│
  │ ◄─── data: {progress: 42} ────────┤ ◄────── emitProgress() ────────│
  │                                   │                                │
  │           (encoding complete)     │     worker COMPLETE msg ───────►│
  │ ◄─── data: {status: complete} ────┤ ◄────── emitProgress() ────────│
  │                                   ├── setTimeout(res.end, 100ms)   │
  │                                   │                                │
  ├─── client disconnect ───────────► │                                │
  │                                   ├── req.on('close') ──────────── unsubscribe()
  │                                   └── clearInterval(keepAlive)
```

**Keep-alive:** A `: ping\n\n` comment is written every 30 seconds to prevent proxy/load balancer timeouts.

**Unsubscribe race condition:** Both the terminal-state handler (`setTimeout res.end, 100ms`) and the `req.on('close')` handler call `unsubscribe()`. The `Set.delete` in `JobQueueManager.subscribe` is idempotent, so calling it twice is safe.

**Download:** Once `status === 'complete'`, the frontend calls `GET /api/export/download/:jobId` which streams `output.mp4` from disk, then cleans up the session directory.

---

## 8. API Routes Overview

All routes are mounted under `/api/*` in `packages/server/index.ts`. The Vite dev proxy forwards `/api/*` from port 3000 to port 3001.

### /api/export

| Method | Path | Description |
|---|---|---|
| `POST` | `/init` | Create session, accept audio file, create job in queue |
| `POST` | `/chunk` | Receive batch of frame images (multipart) |
| `POST` | `/finalize` | Validate frames and queue job for encoding |
| `GET` | `/events/:jobId` | SSE stream of encoding progress |
| `GET` | `/status/:jobId` | Polling fallback: one-shot job status |
| `GET` | `/download/:jobId` | Stream completed MP4 |
| `POST` | `/cancel/:jobId` | Cancel a job (deprecated route, still supported) |
| `GET` | `/stats` | Queue statistics and active encoder info |

### /api/gemini

Proxy for Gemini/Vertex AI. Endpoints:
- `POST /proxy/generateContent` — text generation
- `POST /proxy/generateImages` — Imagen image generation
- `POST /tts` — TTS audio generation via Gemini 2.5 Flash

### /api/deapi

Proxy for DeAPI image animation and video generation endpoints.

### /api/suno

Proxy for Suno music generation API.

### /api/cloud

Firebase Cloud Storage operations (upload/download for project assets).

### /api/director

AI director agent endpoints for orchestrating multi-scene production workflows.

### /api/production

Scene production pipeline endpoints (story mode assembly, character consistency).

### /api/import

Import project files and assets into a session.

### /api/health

`GET /api/health` — returns server status, encoder info, and queue statistics.

---

## 9. ProxyAIClient

**File:** `packages/shared/src/services/shared/apiClient.ts`

The `ai` export is a lazy Proxy. In a browser context it returns a `ProxyAIClient` instance; on the server it returns a real `GoogleGenAI` instance using Vertex AI ADC or a direct API key.

### Browser Path

```
shared service (e.g. imageService.ts)
    └── ai.models.generateContent(params)
            └── ProxyAIClient.callProxy('/api/gemini/proxy/generateContent', params)
                    └── fetch('/api/gemini/...') → Vite proxy → Express server
                                                        └── Vertex AI / Gemini API
```

`ProxyAIClient.callProxy` attaches `.status` to thrown errors so `withRetry()` can detect HTTP 429/500/503 and apply exponential backoff. Errors must not be wrapped before reaching `withRetry` — wrap after.

### Server Path

```
GoogleGenAI({ vertexai: true, project, location })   ← if GOOGLE_CLOUD_PROJECT set
  or
GoogleGenAI({ apiKey: GEMINI_API_KEY })               ← fallback
```

### Retry and Circuit Breaker

`withRetry(fn, retries=3, delayMs=1000, backoffFactor=2)`:
- Retries on HTTP 500, 503, 429, or messages containing `"INTERNAL"` / `"fetch failed"`
- Exponential backoff capped at 30 seconds
- Circuit breaker trips after 5 consecutive failures, blocks all calls for 30 seconds
- Success resets the failure counter

---

## 10. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | Recommended | Vertex AI project ID (server-side AI calls) |
| `GOOGLE_CLOUD_LOCATION` | Optional | Vertex AI region, default `global` |
| `VITE_GEMINI_API_KEY` | Fallback | Direct API key if Vertex AI not configured |
| `PORT` | Optional | Server port, default `3001` |

Both `.env` and `.env.local` are loaded from the **workspace root** via `packages/server/env.ts` (resolves with `../../`). `env.ts` must be the first import in `index.ts`.
