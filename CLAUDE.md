# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the workspace root unless noted.

```bash
# Dev (run both together for full stack)
pnpm run dev          # Frontend only (Vite, port 3000)
pnpm run dev:host     # Frontend + exposed on LAN (for mobile testing)
pnpm run server       # Backend only (Express, port 3001)
pnpm run dev:all      # Frontend + backend concurrently

# Build & preview
pnpm run build        # Production frontend build
pnpm run preview      # Serve production build locally

# Tests
pnpm run test         # Frontend tests (Vitest, watch mode)
pnpm run test:run     # Frontend tests (run once)
pnpm run test:server  # Server/shared tests (Vitest node env, reads __tests__/ at root)
pnpm run test:e2e     # Playwright E2E tests

# Run a single test file (server/shared — from workspace root)
pnpm exec vitest run --config vitest.config.ts __tests__/services/textSanitizer.test.ts
# Run a single test file (frontend — from packages/frontend or workspace root)
pnpm --filter @studio/frontend exec vitest run components/CheckpointApproval.test.tsx

# Mobile
pnpm run build:mobile  # Build frontend then sync Capacitor
pnpm run cap:android   # Open Android Studio
pnpm run cap:ios       # Open Xcode
```

## Environment

`.env` and `.env.local` live at the **workspace root** (not inside packages). The server's `env.ts` resolves them via `../../` from `packages/server/`, and Vite uses `envDir: "../../"`. Both must be loaded from the root.

## Monorepo Structure

pnpm workspaces with three packages:

- **`packages/frontend`** (`@studio/frontend`) — React 19 SPA. Entry: `index.tsx` → `App.tsx` → React Router v7. Screens in `screens/`, reusable components in `components/`, hooks in `hooks/`.
- **`packages/server`** (`@studio/server`) — Express 5 REST API on port 3001. Runs via `tsx` (no compile step). `env.ts` **must be imported first** in `index.ts`. Routes: `/api/export`, `/api/import`, `/api/gemini`, `/api/deapi`, `/api/suno`, `/api/cloud`, `/api/video`, `/api/director`.
- **`packages/shared`** (`@studio/shared`) — All business logic (AI agents, FFmpeg services, pipelines, Firebase, Zustand stores). Consumed by both frontend and server. Exports via `"./src/*": "./src/*"`.

Server/shared integration tests live in `__tests__/` at the workspace root, driven by `vitest.config.ts` there.

## Path Aliases

**Frontend** (`packages/frontend/vite.config.ts`) — regex aliases, **order matters**:
- `@/services/*`, `@/types/*`, `@/constants/*`, `@/utils/*`, `@/lib/*`, `@/stores/*` → `packages/shared/src/`
- `@/*` (catch-all) → `packages/frontend/` — **must be last**

**Server** (`packages/server/tsconfig.json`):
- `@studio/shared/src/*` and `@shared/*` → `packages/shared/src/`

**Frontend tsconfig** mirrors the Vite aliases so tsc type-checks correctly.

## Architecture

### AI Models (`packages/shared/src/services/shared/apiClient.ts`)

The `MODELS` constant defines which models are used:
- `TEXT`: `gemini-3-flash-preview` (primary LLM for all text tasks)
- `IMAGE`: `imagen-4.0-fast-generate-001`
- `VIDEO`: `veo-3.1-fast-generate-preview`
- `TTS`: `gemini-2.5-flash-preview-tts` (audio output modality)

Server-side uses **Vertex AI** (`GOOGLE_CLOUD_PROJECT`). Browser-side proxies all calls through the Express server.

### AI Pipeline

Format-specific pipelines in `packages/shared/src/services/pipelines/` (e.g. `newsPolitics.ts`, `documentary.ts`, `shorts.ts`) orchestrate the full production workflow:
1. Research/script generation (LLM calls via `apiClient.ts` → server proxy → Gemini)
2. Checkpoint gates (user approval steps via `checkpointSystem.ts`)
3. Parallel visual generation (`imageService.ts` → Gemini Imagen)
4. Sequential TTS narration (`narratorService.ts` → Gemini 2.5 Flash TTS)
5. Assembly

The supervisor/subagent pattern in `services/ai/subagents/` handles open-ended "chat" style production.

### API Proxying

The frontend never calls AI APIs directly. All AI calls go through the Express server:
- Frontend → `fetch('/api/...')` → Vite proxy → `localhost:3001` → server route → Gemini/DeAPI/Suno
- `ProxyAIClient` in `shared/src/services/shared/apiClient.ts` mimics the `@google/genai` SDK interface so shared services are isomorphic.

### Retry / Circuit Breaker

`withRetry()` in `apiClient.ts` retries on `error.status === 500/503/429` or messages containing `"INTERNAL"` / `"fetch failed"`. The `ProxyAIClient.callProxy()` attaches `.status` to thrown errors so retry detection works. Errors must **not** be wrapped before being passed to `withRetry` — wrap them after.

### Server Rendering Infrastructure

On startup, `index.ts` initializes: `detectEncoders()` → `workerPool.initialize()` → `jobQueue.initialize()`. The job queue delegates render jobs to a worker pool (`packages/server/workers/workerPool.ts`), which runs `ffmpegWorker.ts`. Progress/completion messages flow back via the worker message handler.

### State Management

Zustand stores in `packages/shared/src/stores/`. localStorage keys all use prefix `ai_soul_studio_`. `useStoryGeneration(projectId?)` resets state when the projectId changes to prevent cross-project data leakage.

### Firebase

Firestore rejects `undefined` values — always sanitize with a JSON round-trip (`JSON.parse(JSON.stringify(obj))`) before `setDoc()`. See `storySync.ts`.

### FFmpeg

Two modes: browser-side WASM (`@ffmpeg/ffmpeg`) and server-side via the `/api/export` endpoints. WASM isn't available in Capacitor WebViews — use server-side export there. Dev server intentionally omits COOP/COEP headers to avoid breaking Firebase Auth popups.

## Key Gotchas

- **Imagen API**: `seed` param is not supported — remove it before calling `imageService.ts`.
- **DeAPI animation**: `animateImageWithDeApi` expects full data URLs (`data:image/png;base64,...`), not raw base64.
- **Tailwind v4**: PostCSS emits a cosmetic warning about missing `from` option — filtered out in `vite.config.ts`.
- **Peer deps**: `.npmrc` sets `legacy-peer-deps=true` because `@langchain/community` pins an older `dotenv` range.
- **TTS voice**: Language-aware voice selection happens in `narratorService.ts` — e.g. `"Kore"` for English.
- **Studio URL modes**: `parseStudioParams()` in `StudioScreen.tsx` parses `?mode=video|music|story`.
- **Vertex AI auth**: Server requires `gcloud auth application-default login` and `GOOGLE_CLOUD_PROJECT` set. Falls back to `VITE_GEMINI_API_KEY` for direct API key auth.
- **Mobile builds**: Set `CAPACITOR_BUILD=true` env var to switch Vite `base` to `"./"` for relative asset paths.
