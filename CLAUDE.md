# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LyricLens is an AI-powered video production platform built with React 19, TypeScript, Vite 7, and Express 5. It has two modes:
- **Production Mode**: Generate videos from text topics using multi-agent AI orchestration
- **Visualizer Mode**: Create lyric videos from audio files with synchronized subtitles

## Development Commands

```bash
# Development
npm run dev              # Frontend only (port 3000)
npm run server           # Backend only (port 3001)
npm run dev:all          # Both frontend and backend
npm run dev:all:host     # Both with network access (mobile testing)

# Testing
npm test                 # Vitest unit/integration tests
npm run test:run         # Single test run (no watch)
npm run test:e2e         # Playwright E2E tests
npm run test:agent       # LangChain agent tests
npm run test:pipeline    # Full pipeline tests

# Build
npm run build            # Production build
npm run preview          # Preview production build

# Mobile (Capacitor)
npm run cap:sync         # Sync web assets to native
npm run cap:android      # Open Android Studio
npm run cap:ios          # Open Xcode
```

**Note**: Always use `npm install --legacy-peer-deps` due to dotenv peer dependency conflict (handled by `.npmrc`).

## Architecture

### Layered Structure
```
screens/          → Full-page components (HomeScreen, StudioScreen, etc.)
    ↓
components/       → Feature-specific UI (TimelineEditor, chat, visualizer)
    ↓
hooks/            → React hooks bridging UI and services
    ↓
services/         → Business logic (React-free, usable in browser and Node)
    ↓
stores/appStore.ts → Zustand global state with localStorage persistence
```

### Key Directories
- `services/ai/` - Multi-agent orchestration with supervisor-subagent pattern
- `services/ai/subagents/` - Specialized agents (import, content, media, enhancement/export)
- `services/ffmpeg/` - Video rendering pipeline (client WASM or server native)
- `services/agent/` - LangChain tool definitions with Zod schemas
- `components/ui/` - Radix UI primitives (shadcn/ui style)

### Multi-Agent System
Toggle via `VITE_USE_MULTI_AGENT=true/false`:
- **Supervisor Agent** → orchestrates workflow
- **Import Subagent** → media/topic input
- **Content Subagent** → narrative planning, scene generation
- **Media Subagent** → TTS (Gemini), images (Imagen 4/DeAPI), video (Veo 3.1/LTX)
- **Enhancement/Export Subagent** → audio mixing, final export

### State Management
Single Zustand store (`stores/appStore.ts`) with sections:
- Conversation (chat history, context)
- Generation (pipeline progress)
- Export (settings, progress)
- UI (panels, modals, view modes)
- Production (scenes, playback)

### Video Export
Dual-engine approach:
- **Client-side**: FFmpeg WASM (instant preview, browser-based)
- **Server-side**: Native FFmpeg (production quality, required for mobile WebViews)

## API Endpoints (Express, port 3001)

- `POST /api/export/init|chunk|finalize` - Video export pipeline
- `POST /api/import/youtube` - YouTube audio download (requires yt-dlp)
- `POST /api/gemini/proxy/*` - Gemini API proxy
- `POST /api/deapi/image|animate` - DeAPI image/video generation
- `POST /api/suno/proxy/*` - Suno music generation proxy
- `GET /api/health` - Server status

## Configuration

### Environment Variables (.env.local)
```env
# Required
VITE_GEMINI_API_KEY=

# Optional AI services
VITE_DEAPI_API_KEY=
VITE_SUNO_API_KEY=
VITE_FREESOUND_API_KEY=
VITE_LANGSMITH_API_KEY=

# Feature flags
VITE_USE_MULTI_AGENT=true
```

### TypeScript
- Strict mode fully enabled
- Path alias: `@/*` maps to root

### ESLint
- Unused variables with `_` prefix allowed
- `@ts-ignore` allowed when needed
- `no-require-imports` disabled for conditional imports

## Key Conventions

- Services must be React-free (no React imports) for Node.js compatibility
- Use `arabic-reshaper` for Arabic text in subtitles (RTL support)
- FFmpeg WASM requires COOP/COEP headers (configured in vite.config.ts)
- Mobile WebViews don't support SharedArrayBuffer—use server-side export
