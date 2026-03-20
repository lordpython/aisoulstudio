# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands

All commands run from the workspace root. Package manager is **pnpm**.

```bash
# Dev (run both together for full stack)
pnpm run dev          # Frontend only (Vite, port 3000)
pnpm run server       # Backend only (Express, port 3001)
pnpm run dev:all      # Frontend + backend concurrently
pnpm run dev:host     # Frontend exposed on LAN (mobile testing)

# Build
pnpm run build        # Production frontend build (output: packages/frontend/dist/)
pnpm run preview      # Serve production build locally

# Tests — three separate test surfaces
pnpm run test         # Frontend tests (Vitest, watch mode, jsdom env)
pnpm run test:run     # Frontend tests (run once)
pnpm run test:server  # Server/shared tests (Vitest, node env, reads __tests__/ at root)
pnpm run test:e2e     # Playwright E2E tests

# Single test file (server/shared — workspace root vitest config)
pnpm exec vitest run --config vitest.config.ts __tests__/services/textSanitizer.test.ts

# Single test file (frontend — uses packages/frontend vitest config)
pnpm --filter @studio/frontend exec vitest run components/CheckpointApproval.test.tsx

# Lint
pnpm --filter @studio/frontend exec eslint .

# Mobile (Capacitor)
pnpm run build:mobile  # Build + sync Capacitor
pnpm run cap:android   # Open Android Studio
pnpm run cap:ios       # Open Xcode
```

## Monorepo Structure

pnpm workspaces with three packages:

- **`packages/frontend`** (`@studio/frontend`) — React 19 SPA. Entry: `index.tsx` → `App.tsx` → React Router v7. Screens in `screens/`, components in `components/`, hooks in `hooks/`.
- **`packages/server`** (`@studio/server`) — Express 5 REST API on port 3001. Runs via `tsx` (no compile step). **`env.ts` must be the first import** in `index.ts`. Routes: `/api/export`, `/api/import`, `/api/gemini`, `/api/deapi`, `/api/suno`, `/api/cloud`, `/api/video`, `/api/director`.
- **`packages/shared`** (`@studio/shared`) — All business logic: AI agents, FFmpeg services, pipelines, Firebase, Zustand stores. Consumed by both frontend and server. Exports via `"./src/*": "./src/*"`.

Server/shared integration tests live in `__tests__/` at the workspace root, driven by the root `vitest.config.ts` (node environment).

## Environment Variables

`.env` and `.env.local` live at the **workspace root** (not inside packages). The server resolves them via `../../` from `packages/server/env.ts`, and Vite uses `envDir: "../../"`.

Required: `VITE_GEMINI_API_KEY`. Optional: `VITE_DEAPI_API_KEY`, `VITE_SUNO_API_KEY`, `VITE_FREESOUND_API_KEY`, `VITE_LANGSMITH_API_KEY`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`.

## Path Aliases

**Frontend** (`packages/frontend/vite.config.ts`) uses regex aliases — **order matters**:
- `@/services/*`, `@/types/*`, `@/constants/*`, `@/utils/*`, `@/lib/*`, `@/stores/*` → `packages/shared/src/`
- `@/*` (catch-all) → `packages/frontend/` — **must be last**

The frontend `tsconfig.json` mirrors these aliases for type-checking.

**Server** (`packages/server/tsconfig.json`):
- `@studio/shared/src/*`, `@shared/*`, `@/*` → `packages/shared/src/`

## Architecture

### API Proxying

The frontend never calls AI APIs directly. All AI calls route through the Express server:
- Frontend → `fetch('/api/...')` → Vite dev proxy → `localhost:3001` → server route → Gemini/DeAPI/Suno
- `ProxyAIClient` in `shared/src/services/shared/apiClient.ts` mimics the `@google/genai` SDK interface so shared services work isomorphically on client and server.

### AI Models (`packages/shared/src/services/shared/apiClient.ts`)

The `MODELS` constant defines which models are used:
- `TEXT`: `gemini-3-flash-preview`
- `IMAGE`: `imagen-4.0-fast-generate-001`
- `VIDEO`: `veo-3.1-fast-generate-preview`
- `TTS`: `gemini-2.5-flash-preview-tts`

Server uses **Vertex AI** (`GOOGLE_CLOUD_PROJECT`) with ADC auth. Falls back to `VITE_GEMINI_API_KEY` for direct API key auth.

### Production Pipelines

Format-specific pipelines in `packages/shared/src/services/pipelines/` (e.g. `newsPolitics.ts`, `documentary.ts`, `shorts.ts`) orchestrate full video production:
1. Research/script generation (LLM via `apiClient.ts` → server proxy → Gemini)
2. Checkpoint gates (user approval steps via `checkpointSystem.ts`)
3. Parallel visual generation (`imageService.ts` → Gemini Imagen)
4. Sequential TTS narration (`narratorService.ts` → Gemini 2.5 Flash TTS)
5. Assembly

The supervisor/subagent pattern in `shared/src/services/ai/subagents/` handles open-ended "chat" style production. Toggle multi-agent vs monolithic mode via `VITE_USE_MULTI_AGENT` env var.

### Retry / Circuit Breaker

`withRetry()` in `apiClient.ts` retries on `error.status === 500/503/429` or messages containing `"INTERNAL"` / `"fetch failed"`. `ProxyAIClient.callProxy()` attaches `.status` to thrown errors so retry detection works. **Do not wrap errors before passing them to `withRetry`** — wrap them after.

### Server Rendering Infrastructure

On startup: `detectEncoders()` → `workerPool.initialize()` → `jobQueue.initialize()`. The job queue delegates render jobs to a worker pool (`packages/server/workers/`), which runs FFmpeg workers. Progress/completion messages flow back via the worker message handler.

### State Management

Zustand stores in `packages/shared/src/stores/`. All localStorage keys use prefix `ai_soul_studio_`. `useStoryGeneration(projectId?)` resets state when projectId changes to prevent cross-project data leakage.

### Firebase / Firestore

Firestore rejects `undefined` values — always sanitize with `JSON.parse(JSON.stringify(obj))` before `setDoc()`.

### FFmpeg

Two modes: browser-side WASM (`@ffmpeg/ffmpeg`) and server-side native via `/api/export` endpoints. WASM is not available in Capacitor WebViews — use server-side export. Dev server intentionally omits COOP/COEP headers to avoid breaking Firebase Auth popups.

## Key Gotchas

- **Imagen API**: `seed` param is not supported — remove it before calling `imageService.ts`.
- **DeAPI animation**: `animateImageWithDeApi` expects full data URLs (`data:image/png;base64,...`), not raw base64.
- **Tailwind v4**: PostCSS emits a cosmetic warning about missing `from` option — filtered out in `vite.config.ts`.
- **Peer deps**: `.npmrc` sets `legacy-peer-deps=true` because `@langchain/community` pins an older `dotenv` range.
- **TTS voice**: Language-aware voice selection in `narratorService.ts` — e.g. `"Kore"` for English.
- **Studio URL modes**: `parseStudioParams()` in `StudioScreen.tsx` parses `?mode=video|music|story`.
- **Vertex AI auth**: Server requires `gcloud auth application-default login` and `GOOGLE_CLOUD_PROJECT`. Falls back to `VITE_GEMINI_API_KEY`.
- **Mobile builds**: Set `CAPACITOR_BUILD=true` to switch Vite `base` to `"./"` for relative asset paths.
- **TypeScript strict mode**: Frontend and server both use full strict (`noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, etc.).
- **ESLint**: `@typescript-eslint/no-explicit-any` is **off**; `no-console` warns (except `warn`/`error`/`info`); React hooks rules are enforced.
