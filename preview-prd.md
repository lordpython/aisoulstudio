# AIsoul Studio — V1 Product Requirements Document

## Document Info

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Author | RA3 |
| Last Updated | 2026-02-24 |
| Status | Draft — Pre-Implementation |

---

## 1. Product Vision

AIsoul Studio is an AI-powered video production platform that transforms text ideas and audio inputs into exportable animated videos. The platform specializes in Arabic and English content creation, with deep support for Gulf Arabic dialect, cultural storytelling traditions, and multi-format content pipelines.

The V1 product combines:

- Conversational AI-assisted video production (Studio)
- Audio-first lyric visualizer workflows (Visualizer)
- Format-specific content pipelines (YouTube narrator, ads, documentaries, shorts, etc.)
- Project-based persistence with session recovery
- Async export with FFmpeg-based rendering and progress streaming
- Parallel AI orchestration to keep generation under 60 seconds per pipeline stage

---

## 2. Tech Stack

### 2.1 Frontend

- React 19, TypeScript, Vite 7, React Router 7
- Tailwind CSS 4, Radix UI, Framer Motion
- Zustand for client state management

### 2.2 Backend

- Express 5 (TypeScript via tsx)
- FFmpeg for server-side video encoding
- Worker pool + job queue for async export

### 2.3 Shared Domain Layer

- `@studio/shared` — services, stores, pipelines, types, prompt engine
- Consumed by both frontend and server packages

### 2.4 AI & Media Services

| Provider | Role | Required |
|----------|------|----------|
| Gemini | Text generation, image generation, TTS proxy, vision analysis | Yes |
| DeAPI | Image generation (Flux), video generation (LTX), upscaling, background removal | No (degrades gracefully) |
| Suno | AI music generation | No |
| Freesound | SFX library search and download | No |
| FFmpeg | Server-side video encoding and export | Yes (server-side) |

### 2.5 Data & Auth

- Firebase Auth (Google sign-in + email/password)
- Firestore (project records, export records)
- Google Cloud Storage (optional — asset persistence)

### 2.6 Monorepo Structure

```
packages/
  frontend/     → React app (Vite)
  server/       → Express API server
  shared/       → Domain logic, types, services, prompt engine
```

Managed via pnpm workspaces.

### 2.7 Testing

- Vitest — unit/integration (frontend + server + shared)
- Playwright — E2E (critical paths)

---

## 3. V1 Scope — What We're Building

### 3.1 Primary User Goals

1. Start creating quickly from a home screen with clear mode selection.
2. Manage and reopen projects across sessions.
3. Produce AI-generated video/story content in Studio with conversational AI assistance.
4. Create lyric videos from uploaded audio in Visualizer.
5. Export final videos with visible progress and downloadable output.
6. Work seamlessly in Arabic (Gulf dialect) and English, including RTL layouts.

### 3.2 What V1 Does NOT Include

- Team collaboration or real-time multi-user editing
- Billing, subscriptions, or usage metering
- Enterprise admin or organization dashboards
- Full moderation/review workflow for generated assets
- Public marketplace or template ecosystem
- Plugin ecosystem for external providers
- Non-developer template CMS/editor UI
- Advanced analytics dashboards

---

## 4. Information Architecture & Routing

### 4.1 Route Map

| Route | Page | Auth Required | Description |
|-------|------|---------------|-------------|
| `/` | Home | No | Mode selection landing page |
| `/projects` | Projects | Yes | Project dashboard with CRUD |
| `/studio` | Studio | Yes | Main production workspace |
| `/visualizer` | Visualizer | Yes | Audio-first lyric video workflow |
| `/signin` | Sign In | No | Authentication page |
| `/settings` | Settings | Yes | API key status and configuration |
| `*` | Not Found | No | 404 fallback |

Optional utility route (not launch-critical): `/gradient-generator`.

### 4.2 Auth Flow

All creation features require authentication. The flow is:

1. Unauthenticated user lands on Home → sees mode cards with sign-in CTAs
2. Clicking any creation card → redirects to `/signin` with return URL
3. After sign-in → redirects back to intended destination
4. Authenticated user on Home → cards route directly to creation surfaces
5. Direct navigation to protected routes without auth → redirect to `/signin`

No guest mode in V1. All project creation, generation, and export requires a signed-in user.

### 4.3 Session & Token Management

- Firebase Auth handles token refresh automatically via SDK
- On token expiry during active session: silent refresh, no user disruption
- On refresh failure (revoked account, network loss): redirect to `/signin` with "session expired" message
- Session persistence: Firebase `LOCAL` persistence (survives browser restart)
- Long idle timeout: no forced logout, but stale project data triggers re-fetch on resume
- Multi-tab/multi-device: last-write-wins on Firestore documents. No real-time conflict resolution in V1, but Firestore timestamps prevent silent data loss

---

## 5. Detailed Page Requirements

### 5.1 Home (`/`)

**Purpose:** Entry point. Help the user understand what they can create and get started fast.

**Layout:**
- Cinematic hero section with product tagline
- Three creation mode cards: Video Production, Music Video, Lyric Visualizer
- Header with nav actions (Projects, Settings, Sign In / User Avatar)
- Language toggle (AR/EN) in header

**Behavior:**
- Cards display static mode definitions with localized strings
- No backend call needed for initial render
- Auth state determines CTA text: "Sign in to create" vs "Start creating"
- Card click behavior:
  - Authenticated → route to `/studio?mode=video`, `/studio?mode=music`, or `/visualizer`
  - Unauthenticated → route to `/signin?redirect={target}`
- Main content region receives focus on route change (a11y)

**Data:** Static mode definitions only. Auth state from `useAuthStore`.

---

### 5.2 Projects (`/projects`)

**Purpose:** Dashboard for managing all user projects across types.

**Layout:**
- Create dropdown (Production / Story / Visualizer)
- Search input with debounced filtering
- Type filter tabs and sort controls (recent, alphabetical, favorites first)
- Grid/list view toggle with preference persistence
- Favorites section (pinned at top when present)

**Behavior:**
- Requires authentication. Redirect to `/signin` if not authenticated.
- Create project flow:
  1. User selects type from Create dropdown
  2. Immediately create project document in Firestore with `status: "draft"`
  3. Navigate to target workspace with `projectId` in URL
- Delete: confirmation dialog → Firestore delete → optimistic UI removal
- Favorite: toggle `isFavorite` → optimistic UI update
- Search: client-side filter on loaded projects (V1 scope, <500 projects per user)
- Pagination: load all projects on mount for V1. Cursor-based pagination is post-V1.

**Data — Firestore Project Model:**

```typescript
interface Project {
  id: string;
  userId: string;
  title: string;
  type: "production" | "story" | "music" | "visualizer";
  status: "draft" | "in-progress" | "completed" | "failed";
  metadata: {
    topic?: string;
    style?: string;
    format?: string;       // youtube-narrator, advertisement, etc.
    language?: "ar" | "en";
    sceneCount?: number;
    hasNarration?: boolean;
    hasMusic?: boolean;
    hasSFX?: boolean;
    thumbnailUrl?: string;
  };
  isFavorite: boolean;
  tags: string[];
  cloudSessionId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastAccessedAt: Timestamp;
}
```

Firestore path: `users/{userId}/projects/{projectId}`

All CRUD operations validate `userId` ownership.

---

### 5.3 Studio (`/studio`)

**Purpose:** The main production workspace where AI-assisted content creation happens.

**URL Parameters:**
- `mode` — `video` | `music` | `story` (determines pipeline and UI variant)
- `projectId` — restores existing project session
- `style`, `duration`, `topic`, `format` — optional quick-start hints

**Layout:**
- Left panel: Chat/conversation interface for AI-assisted workflow
- Center: Preview canvas (image/video preview, storyboard surface)
- Right panel: Context panels (scene list, shot details, generation queue)
- Bottom: Timeline/editor bar (when content exists)
- Modal system for: export settings, quality selector, scene editor, music browser, shot editor

**Behavior:**
- When `projectId` is present: load project from Firestore, restore pipeline state, update `lastAccessedAt`
- When no `projectId`: operate in quick-start mode. First generation action auto-creates a project.
- Switching projects: full state reset, clear conversation, load new project context
- Pipeline orchestration drives the UI through defined stages (see Section 8)

**Data:**
- Production state lives in `useStudioStore`:
  - Content plan (topic, format, structure, act/scene breakdown)
  - Narration segments (text, timing, audio URLs)
  - SFX plan (cue points, asset URLs)
  - Scene list with visual map (image/video URLs per scene)
  - Shot breakdown (cinematography metadata per shot)
  - Music selection (track URL, timing, volume)
  - Conversation history (user messages + AI responses + generation results)
  - Export preferences (resolution, quality tier, format)

---

### 5.4 Story Mode (`/studio?mode=story`)

**Purpose:** Structured storyboard-driven production with shot-level control.

This is a sub-mode of Studio with specialized UI components for cinematographic workflows.

**Layout Components:**

**Shot Breakdown Table:**
- Scene-grouped rows with columns: Scene, Shot, Description, Dialogue, ERT, Size, Perspective, Movement, Equipment, Focal Length, Aspect Ratio, Notes
- Scene headers with per-scene generation entry points
- Sortable columns, drag-reorder rows within scenes

**Shot Editor Modal:**
- Image/video preview
- Per-scene shot navigation (prev/next within scene)
- Metadata editor fields for all shot properties
- Save (persists merged updates) and Retry (triggers regeneration) controls
- Non-destructive: save only updates touched fields, retry only regenerates visuals

**Storyboard Preview Surface:**
- Full-bleed visual/video preview for active shot
- Scene-collapsible thumbnail strip
- Duration timeline bar with per-shot ERT segments
- Keyboard shortcuts: `←`/`→` (navigate), `Space` (play/pause), `E` (edit), `F` (fullscreen), `?` (help), `Esc` (close)

**Shot Animation Grid:**
- Per-shot cards: thumbnail, label, summary
- Animate/regenerate actions per shot
- Processing overlay with generation progress

**Behavior:**
- Shot reordering reindexes `shotNumber` to maintain sequence integrity
- Edit saves are non-destructive merges (no forced regeneration)
- Retry triggers regeneration for that shot's visuals only
- Missing metadata fields derive defaults (equipment/focal length heuristics from shot type)

**Data — Shot Metadata Model:**

```typescript
interface ShotMetadata {
  id: string;
  sceneNumber: number;
  shotNumber: number;
  description: string;
  dialogue?: string;
  durationEst: number;              // seconds
  shotType: string;                  // wide, medium, close-up, extreme close-up, etc.
  cameraAngle: string;              // eye-level, low-angle, high-angle, bird's-eye, etc.
  movement: string;                 // static, pan, tilt, dolly, tracking, crane, etc.
  equipment?: string;               // steadicam, handheld, tripod, drone, etc.
  focalLength?: string;             // 24mm, 50mm, 85mm, etc.
  aspectRatio?: string;             // 16:9, 2.39:1, 9:16, 1:1
  notes?: string;
  imageUrl?: string;
  videoUrl?: string;
  narrationText?: string;
  narrationAudioUrl?: string;
  status: "pending" | "generating" | "complete" | "failed";
}
```

Format-specific required fields (not all formats need full cinematography):

| Format | Required Fields | Optional Fields |
|--------|----------------|-----------------|
| youtube-narrator | description, durationEst, shotType | All camera fields |
| advertisement | description, durationEst, shotType, movement | equipment, focalLength |
| documentary | All fields | notes |
| movie-animation | All fields | — |
| shorts | description, durationEst | All camera fields |
| music-video | description, durationEst, movement | equipment, focalLength |

---

### 5.5 Visualizer (`/visualizer`)

**Purpose:** Create lyric videos from uploaded audio.

**Layout:**
- Audio upload zone (drag-and-drop + file picker)
- Audio waveform display with playback controls
- Scene thumbnail strip with visual preview
- Timeline with lyric sync markers
- Export entry point

**Behavior:**
- Accept audio upload (MP3, WAV, FLAC, M4A — max 50MB)
- Validate format and duration before processing
- Generate lyric segmentation from audio (speech-to-text + timing)
- User can edit/correct lyrics and adjust timing markers
- Generate visual prompts per lyric segment
- Generate images per segment using DeAPI/Gemini
- Support image animation for each segment
- Track current scene during playback (sync highlight)
- `projectId` in URL restores previous Visualizer session

**Data:**
- Song metadata (title, artist, duration, BPM if detectable)
- Lyric segments with timestamps
- Prompt list (one per segment)
- Generated image URLs
- Generated video URLs (animated segments)
- Playback state (currentTime, playing, activeSegment)

**Upload Validation:**

| Check | Constraint |
|-------|-----------|
| Format | MP3, WAV, FLAC, M4A |
| Size | ≤ 50 MB |
| Duration | ≤ 10 minutes |
| Channels | Mono or Stereo |

---

### 5.6 Sign In (`/signin`)

**Purpose:** Authenticate users before they can create content.

**Layout:**
- Desktop: split-screen with branding/visual on left, auth form on right
- Mobile: single-column auth form with branding header
- Google sign-in button (primary)
- Email/password form with toggle between sign-in and sign-up modes

**Behavior:**
- Already authenticated → redirect to `/` or `redirect` URL param
- Google sign-in: Firebase `signInWithPopup` (desktop) / `signInWithRedirect` (mobile)
- Email sign-in: Firebase `signInWithEmailAndPassword`
- Email sign-up: Firebase `createUserWithEmailAndPassword`
- Error states: invalid credentials, email already in use, weak password, network failure
- Loading states during auth actions
- After successful auth: redirect to stored return URL or `/`

**Data:** Firebase Auth only. No additional user profile document in V1.

---

### 5.7 Settings (`/settings`)

**Purpose:** Show API key status and help users configure required services.

**Layout:**
- Service status summary (all services at a glance)
- Individual API key cards with status indicator (configured/missing/error)
- Env variable template (copyable)
- External links for key provisioning

**Behavior:**
- On mount: run runtime checks for key availability
- Refresh button re-checks all services
- Show/copy `.env` template for missing keys
- DeAPI: show queue position and wait telemetry when configured

**Service Requirements:**

| Service | Required | Check Method |
|---------|----------|-------------|
| Gemini | Yes | Server-side key validation |
| DeAPI | No | Server-side key validation + queue status |
| Suno | No | Server-side key validation |
| Freesound | No | Server-side key validation |
| FFmpeg | Yes (server) | Binary availability check |

---

### 5.8 Not Found (`*`)

- Friendly 404 page with navigation back to Home
- Suggest common routes if the URL looks like a typo
- Log unknown routes for analytics (post-V1)

---

## 6. Internationalization & RTL Support

### 6.1 Language Support

V1 supports two languages: Arabic (Gulf dialect focus) and English.

### 6.2 i18n Architecture

- String extraction into locale files: `locales/en.json`, `locales/ar.json`
- Use a lightweight i18n library (e.g., `i18next` with React bindings)
- Language detection priority: user preference (stored) → browser locale → default (English)
- Language toggle in header, persisted to localStorage

### 6.3 RTL Layout Requirements

- `dir="rtl"` and `lang="ar"` set on `<html>` when Arabic is active
- Tailwind CSS logical properties (`ps-`, `pe-`, `ms-`, `me-`, `start`, `end`) instead of `left`/`right`
- All layout components must use logical properties for margins, padding, positioning
- Icon mirroring: navigation arrows, progress indicators flip in RTL
- Timeline scrubs right-to-left when in Arabic mode
- Shot breakdown table columns remain LTR for technical metadata (focal length, aspect ratio) but description/dialogue cells render RTL
- Chat messages: user messages align to the start edge, AI responses align to the start edge (standard chat pattern, but direction-aware)

### 6.4 Arabic Text in AI Pipelines

- All prompt templates must have Arabic variants or support `{{language_instruction}}` variable that injects Arabic-specific guidance
- Narration text must preserve Arabic diacritical marks (tashkeel) when present
- Gulf dialect preferences should be configurable per project (formal Arabic vs Gulf colloquial)
- Text-to-speech must support Arabic voices (Gemini TTS Arabic or fallback)

### 6.5 Font Requirements

- Arabic: Noto Sans Arabic or IBM Plex Arabic (supports tashkeel rendering)
- English: Inter or system font stack
- Monospace (code/metadata): JetBrains Mono or system monospace
- Font loading: preload critical fonts, use `font-display: swap`

---

## 7. State Management Architecture

### 7.1 Store Domains

Each concern gets its own Zustand store with clear boundaries:

```
useAuthStore          → user session, token state, sign-in/out actions
useProjectStore       → active project metadata, CRUD operations, project list
useStudioStore        → production pipeline state (plan, narration, scenes, shots, music)
useVisualizerStore    → audio state, lyric segments, visual generation, playback
useExportStore        → job queue, progress tracking, download state
useConversationStore  → chat messages, AI responses, conversation persistence
useUIStore            → modals, panels, navigation state, layout prefs, language
```

### 7.2 Persistence Strategy

| Store | Persistence | Method |
|-------|-------------|--------|
| `useAuthStore` | Across sessions | Firebase Auth SDK (automatic) |
| `useProjectStore` | Across sessions | Firestore (source of truth) |
| `useStudioStore` | Current session + recovery | Zustand `persist` middleware → localStorage |
| `useVisualizerStore` | Current session + recovery | Zustand `persist` middleware → localStorage |
| `useExportStore` | Current session only | Memory only (re-fetches job status on reload) |
| `useConversationStore` | Current session + recovery | Zustand `persist` middleware → localStorage |
| `useUIStore` | Across sessions (preferences) | Zustand `persist` middleware → localStorage |

### 7.3 State Recovery

When a user returns to a project (`/studio?projectId=X`):

1. Load project metadata from Firestore
2. Check localStorage for matching `projectId` session state
3. If local state exists and `updatedAt` matches: restore full pipeline state
4. If local state is stale: load from Firestore, clear local state, re-hydrate
5. If no local state: fresh start from Firestore project metadata

### 7.4 State Reset Protocol

When switching projects or starting new:

1. Clear active `useStudioStore` / `useVisualizerStore` state
2. Clear `useConversationStore`
3. Clear `useExportStore`
4. Preserve `useUIStore` (layout preferences carry over)
5. Load new project context

---

## 8. Pipeline Orchestration

### 8.1 Pipeline as a State Machine

Every production pipeline follows a defined stage model. Each stage has clear enter/exit conditions, dependencies, and failure handling.

**Pipeline Stage Model:**

```typescript
type StageStatus = "idle" | "queued" | "running" | "complete" | "failed" | "skipped";

interface PipelineStage {
  id: string;
  label: string;
  status: StageStatus;
  progress: number;           // 0-100
  dependencies: string[];     // stage IDs that must be "complete" before this can start
  canRetry: boolean;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}
```

### 8.2 Story Production Pipeline

```
[content-plan] → [screenplay] → [character-extraction] → [shot-breakdown]
                                                              ↓
                                    ┌─────────────────────────┼─────────────────────────┐
                                    ↓                         ↓                         ↓
                              [narration-gen]           [visual-gen]              [music-selection]
                                    ↓                         ↓                         ↓
                              [narration-tts]           [image-animation]              │
                                    ↓                         ↓                         │
                                    └─────────────────────────┼─────────────────────────┘
                                                              ↓
                                                         [assembly]
                                                              ↓
                                                          [export]
```

**Parallelism rules after shot-breakdown:**
- `narration-gen`, `visual-gen`, and `music-selection` run in parallel
- `narration-tts` depends on `narration-gen`
- `image-animation` depends on `visual-gen`
- `assembly` depends on ALL of: `narration-tts`, `image-animation`, `music-selection`
- `export` depends on `assembly`

### 8.3 Visualizer Pipeline

```
[audio-upload] → [transcription] → [lyric-segmentation] → [prompt-generation]
                                                                  ↓
                                                ┌─────────────────┼─────────────┐
                                                ↓                               ↓
                                          [image-gen]                    [music-analysis]
                                                ↓                               │
                                          [image-animation]                     │
                                                ↓                               │
                                                └───────────────┼───────────────┘
                                                                ↓
                                                           [assembly]
                                                                ↓
                                                            [export]
```

### 8.4 Stage Failure & Recovery

- If a stage fails: mark as `"failed"`, surface error in UI, enable retry button
- Retry only re-runs the failed stage (and its dependents), not the entire pipeline
- Successful upstream stages are never re-run unless the user explicitly requests regeneration
- If a stage fails 3 times consecutively: suggest user check Settings for service status
- Pipeline can be paused and resumed (stages already complete are preserved)

### 8.5 Generation Rate Limiting

- Client-side debounce on all generation triggers (500ms)
- Server-side per-user rate limit: 10 concurrent generation requests
- Queue overflow: return 429 with estimated wait time
- UI disables generation buttons while a request is in-flight for the same stage

---

## 9. Component Architecture

### 9.1 Application Shell

```
AppShell
├── AppHeader
│   ├── Logo + Home link
│   ├── NavLinks (Projects, Settings)
│   ├── LanguageToggle
│   └── UserMenu / SignInButton
├── RouteGuard                          ← handles auth redirect logic
│   └── <Outlet />                      ← renders current route
├── ServiceStatusBanner                 ← shows degraded-service warnings
├── ModalHost                           ← portal target for all modals
└── ToastProvider                       ← notification system
```

### 9.2 Shared/Reusable Components

```
Components/shared/
├── AuthGuard                  → route wrapper, redirects unauthenticated users
├── ServiceStatusProvider      → context: polls /api/health, exposes availability
├── GenerationProgressCard     → stage label, progress %, ETA, cancel action
├── RetryableAction            → wraps generation calls with retry UI + backoff feedback
├── AssetPreview               → unified image/video preview: loading, error, regenerate
├── EmptyState                 → illustration + message + CTA for empty lists/surfaces
├── ConfirmDialog              → destructive action confirmation
├── LoadingSkeleton            → shimmer placeholders for async content
├── RTLAware                   → utility wrapper that applies directional styles
└── ErrorBoundary              → catches render errors, shows recovery UI
```

### 9.3 Studio Components

```
Studio/
├── StudioWorkspace                      ← top-level layout orchestrator
│   ├── ChatPanel
│   │   ├── ChatMessageList              ← virtualized message rendering
│   │   ├── ChatInput                    ← text input + attachment + send states
│   │   └── AssistantResponseBlock       ← structured AI response (text + assets + actions)
│   ├── PreviewCanvas
│   │   ├── ImagePreview
│   │   ├── VideoPreview
│   │   └── PlaceholderCanvas
│   ├── ContextPanel
│   │   ├── SceneList
│   │   ├── ShotDetails
│   │   └── GenerationQueue
│   └── TimelineBar
│       ├── TimelineTrack                ← per-track: narration, music, SFX, video
│       ├── TimelinePlayhead             ← scrubber + current time indicator
│       ├── TimelineZoom                 ← zoom controls
│       └── ClipHandle                   ← trim/extend individual clips
├── PipelineStatusBar                    ← shows current pipeline stage + overall progress
├── ExportModal
├── QualitySelector
└── MusicBrowser
```

### 9.4 Story Mode Components

```
Story/
├── StoryWorkspaceShell                  ← tab/state orchestration only
│   ├── ShotBreakdownSection
│   │   ├── SceneHeader                  ← scene title + per-scene generate button
│   │   └── ShotTable
│   │       └── ShotRow                  ← display-only, emits edit/reorder actions
│   ├── ShotEditorModal                  ← full edit surface + save/retry + navigation
│   ├── StoryboardStage
│   │   ├── FullBleedPreview             ← image/video with narration overlay
│   │   ├── KeyboardShortcutOverlay
│   │   └── ShotTimelineBar              ← duration segments + quick seek
│   ├── ShotThumbnailStrip               ← scene-collapsible + drag/drop reorder
│   └── ShotAnimationGrid               ← per-shot animate/regenerate cards
```

**State boundaries:**
- Domain state lives in `useStudioStore` (shotlist, breakdown, narration, animations)
- Presentational components receive derived props + callbacks, no direct service calls
- Side effects (regeneration, save, reorder) handled by container-level action handlers

### 9.5 Visualizer Components

```
Visualizer/
├── VisualizerWorkspace
│   ├── AudioUploadZone                  ← drag-drop + file picker + validation
│   ├── AudioWaveform                    ← waveform display + playback controls
│   ├── LyricEditor                     ← editable lyric segments with timing
│   ├── SegmentThumbnailStrip           ← visual preview per lyric segment
│   ├── VisualizerPreview               ← synchronized playback: audio + visuals
│   ├── VisualizerTimeline              ← lyric sync markers + segment boundaries
│   └── VisualizerExportEntry           ← export button + quality selection
```

### 9.6 Projects Components

```
Projects/
├── ProjectDashboard
│   ├── CreateDropdown                   ← Production / Story / Visualizer
│   ├── ProjectSearchBar
│   ├── ProjectFilters                   ← type tabs + sort controls
│   ├── ViewToggle                       ← grid / list
│   ├── FavoritesSection
│   └── ProjectGrid / ProjectList
│       └── ProjectCard / ProjectRow     ← thumbnail, title, type, last accessed, actions
```

---

## 10. Backend / API Architecture

### 10.1 Route Groups

| Route Group | Purpose |
|-------------|---------|
| `/api/health` | Service readiness, key checks, system status |
| `/api/auth` | Token validation middleware (all protected routes) |
| `/api/projects` | Project CRUD (Firestore proxy with ownership validation) |
| `/api/export` | Job lifecycle: init → chunk upload → finalize → status/SSE → download → cancel |
| `/api/import` | YouTube audio import |
| `/api/gemini` | Text/image generation proxy + TTS |
| `/api/deapi` | Image/video generation proxy |
| `/api/suno` | Music generation proxy |
| `/api/freesound` | SFX search and download proxy |
| `/api/video` | Prompt generation + direct video generation |
| `/api/director` | Scene prompt generation |
| `/api/cloud` | GCS session init / upload / status / file proxy |

### 10.2 Export Pipeline

**Architecture:** Server-side FFmpeg encoding.

**Flow:**
1. Client calls `POST /api/export/init` with project metadata + asset manifest
2. Server validates asset availability and creates job in queue
3. Client uploads frame chunks via `POST /api/export/chunk` (or server pulls from stored assets)
4. Client calls `POST /api/export/finalize` when all chunks are uploaded
5. Server worker picks up job, runs FFmpeg encode
6. Progress streams via `GET /api/export/events/:jobId` (SSE)
7. Client polls or listens for completion
8. Download via `GET /api/export/download/:jobId`
9. Cancel via `POST /api/export/cancel/:jobId`

**Export Quality Tiers:**

| Tier | Resolution | FPS | Bitrate | Use Case |
|------|-----------|-----|---------|----------|
| Draft | 720p | 24 | Low | Quick preview |
| Standard | 1080p | 30 | Medium | Default for first-time users |
| High | 1080p | 30 | High | Final delivery |

Default for new users: Standard.

**Validation before encode:**
- Frame sequence continuity (no gaps)
- Minimum frame size (≥ 256px on shortest edge)
- Asset URLs are reachable
- Audio duration matches visual duration (within 1s tolerance)

### 10.3 API Client & Reliability

**Shared API Client (`packages/shared/src/services/shared/apiClient.ts`):**

- Automatic retry with exponential backoff (3 retries, 1s/2s/4s delays)
- Circuit breaker per service: opens after 5 consecutive failures, half-opens after 30s
- Request timeout: 30s for text generation, 120s for image/video generation
- All provider API keys are server-side only — never exposed to client
- Request deduplication: prevent identical concurrent requests

**Error Response Contract:**

```typescript
interface ApiError {
  code: string;           // machine-readable: "SERVICE_UNAVAILABLE", "RATE_LIMITED", etc.
  message: string;        // human-readable
  service?: string;       // which provider failed
  retryAfter?: number;    // seconds until retry is safe
}
```

### 10.4 Server Lifecycle

- Graceful startup: wait for worker pool + job queue initialization before accepting requests
- Graceful shutdown: stop accepting new requests → drain in-flight requests (30s timeout) → clean up worker pool → exit
- Health check returns `503` during startup/shutdown transitions

---

## 11. Prompt Service & Template Architecture

### 11.1 Prompt Module (`packages/shared/src/services/prompt`)

The prompt system has two layers that serve different purposes:

**Layer 1: Template Engine (LLM instructions)**
- Natural language prompts sent to Gemini for text generation
- Format-specific, phase-specific templates with variable substitution
- Consumed by pipeline orchestrators

**Layer 2: Style Guide Builder (structured generation params)**
- Typed JSON-like objects sent to image/video generation APIs
- Maps shot cinematography metadata into visual generation parameters
- Consumed by image/video generation services

These are separate concerns with separate validation rules.

### 11.2 Template Engine

**File: `templateLoader.ts`**

```typescript
// Core API
loadTemplate(formatId: string, phase: string): string
substituteVariables(template: string, vars: Record<string, string>): string
hasTemplate(formatId: string, phase: string): boolean
listTemplates(): TemplateManifest[]

// Template loading: eager via import.meta.glob
// Lookup: strict — missing templates throw with descriptive error
```

**Template directory convention:**
```
templates/{formatId}/{phase}.txt
```

**Supported template variables:**

| Variable | Description | Required |
|----------|-------------|----------|
| `{{topic}}` | Story/content topic | Yes |
| `{{genre}}` | Content genre/style | Yes |
| `{{language_instruction}}` | Language-specific guidance (Arabic/English) | Yes |
| `{{format}}` | Content format identifier | Yes |
| `{{duration}}` | Target duration in seconds | No |
| `{{act_count}}` | Number of acts | No |
| `{{scene_count}}` | Number of scenes | No |
| `{{research_context}}` | Optional reference material | No |
| `{{character_descriptions}}` | Extracted character data | No |
| `{{previous_context}}` | Prior pipeline stage output | No |

### 11.3 Template Library

**Format folders:**

| Format | Description |
|--------|-------------|
| `advertisement` | Commercial/promotional content |
| `documentary` | Documentary-style narration |
| `educational` | Educational/explainer content |
| `movie-animation` | Cinematic animated storytelling |
| `music-video` | Music video visual narratives |
| `news-politics` | News/political commentary |
| `shorts` | Short-form vertical content |
| `youtube-narrator` | YouTube narrator-style storytelling |

**Phase coverage per format:**

| Phase | Baseline | Ad | Doc | Edu | Movie | Music | News | Shorts | YT |
|-------|----------|----|-----|-----|-------|-------|------|--------|----|
| `breakdown` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `screenplay` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `script-generation` | ✓ | | | | | | | | |
| `cta-creation` | | ✓ | | | | | | | |
| `chapter-structure` | | | ✓ | | | | | | |
| `learning-objectives` | | | | ✓ | | | | | |
| `lyrics-generation` | | | | | | ✓ | | | |
| `source-citation` | | | | | | | ✓ | | |
| `hook-creation` | | | | | | | | ✓ | ✓ |

### 11.4 Style Guide Builder

**File: `imageStyleGuide.ts`**

```typescript
// Core API
buildImageStyleGuide(params: StyleGuideParams): ImageStyleGuide
fromShotBreakdown(shot: ShotMetadata, styleDefaults: StyleDefaults): ImageStyleGuide
toJSON(guide: ImageStyleGuide): string
toNaturalLanguage(guide: ImageStyleGuide): string
```

**Style guide maps shot metadata to visual generation params:**

| Shot Field | Style Guide Block |
|------------|-------------------|
| `shotType` | `composition.framing` |
| `cameraAngle` | `composition.angle` |
| `movement` | `camera.movement` |
| `focalLength` | `camera.lens` |
| `aspectRatio` | `output.dimensions` |
| `equipment` | `camera.rig` (informs motion/stability hints) |

### 11.5 Template Validation

**Startup-time check (server boot):**
- Scan all format directories
- Verify required phases exist for each format
- Log warnings for missing optional phases
- Fail startup if any required template is missing

**CI check:**
- Template manifest file (`templates/manifest.json`) lists all expected format/phase pairs
- CI script validates manifest against actual template files
- PR fails if manifest and files are out of sync

### 11.6 Arabic Template Strategy

Every template must support Arabic content generation via one of:

1. **Separate Arabic template file:** `templates/{formatId}/{phase}.ar.txt` — used when Arabic prompts need structurally different instructions
2. **Language instruction variable:** `{{language_instruction}}` — injects Arabic-specific guidance into a shared template

V1 approach: use `{{language_instruction}}` for all templates. Create separate Arabic templates only where testing shows the shared approach produces poor Arabic output.

Arabic language instruction content should include:
- Use Gulf Arabic dialect for dialogue and narration
- Preserve cultural idioms and references
- Use formal Arabic (MSA) for descriptions and metadata
- Include diacritical marks (tashkeel) on narration text for TTS accuracy

---

## 12. Data Architecture

### 12.1 Firestore Schema

```
users/
  {userId}/
    projects/
      {projectId}/
        → Project document (see Section 5.2)
        exports/
          {exportId}/
            → Export document
        sessions/
          {sessionId}/
            → Pipeline state snapshot (for recovery)
```

**Export Document:**

```typescript
interface ExportRecord {
  id: string;
  projectId: string;
  userId: string;
  status: "queued" | "processing" | "complete" | "failed" | "cancelled";
  quality: "draft" | "standard" | "high";
  resolution: string;
  fps: number;
  progress: number;
  fileUrl?: string;
  fileSize?: number;
  duration?: number;
  error?: string;
  createdAt: Timestamp;
  completedAt?: Timestamp;
}
```

### 12.2 Cloud Asset Structure (GCS — Optional)

```
users/
  {userId}/
    projects/
      {sessionId}/
        images/
          scene-{n}-shot-{m}.png
        videos/
          scene-{n}-shot-{m}.mp4
        audio/
          narration-{n}.mp3
          music.mp3
          sfx-{n}.mp3
        exports/
          final-{quality}.mp4
```

Legacy structure support retained for backward compatibility.

### 12.3 Local Storage Budget

| Key | Max Size | Cleanup Trigger |
|-----|----------|-----------------|
| `studio-state` | 5 MB | On project switch |
| `visualizer-state` | 5 MB | On project switch |
| `conversation-state` | 2 MB | On project switch, or 500+ messages |
| `ui-preferences` | 50 KB | Never (user preferences) |

Total localStorage budget: ~12 MB. Warn user if approaching 90%.

### 12.4 Asset Lifecycle & Cleanup

**Temporary assets (server /tmp):**
- Frame chunks, intermediate renders, uploaded audio
- Cleaned up after export job completes or 24 hours (whichever comes first)

**Generated assets (GCS or local):**
- Retained as long as project exists
- Deleted when project is deleted (cascade)
- No automatic TTL in V1

**Export files:**
- Retained for 30 days after creation
- User can re-export if expired

---

## 13. Error Handling & Resilience

### 13.1 Error Boundary Strategy

**React Error Boundaries:**
- `AppErrorBoundary` — wraps entire app, catches catastrophic failures, shows full-page recovery UI
- `PanelErrorBoundary` — wraps each major panel (chat, preview, timeline), allows other panels to continue
- `GenerationErrorBoundary` — wraps individual generation cards, shows per-item retry

**Error categories and UI responses:**

| Category | UI Response | User Action |
|----------|------------|-------------|
| Network failure | Toast + retry button | Retry or check connection |
| Auth failure | Redirect to signin with message | Sign in again |
| Generation failure | Inline error on affected stage | Retry stage |
| Service unavailable | Banner + degraded mode | Wait or check Settings |
| Rate limited | Toast with countdown | Wait for countdown |
| Validation error | Inline field-level error | Fix input |
| Server error (500) | Toast + "contact support" hint | Retry later |

### 13.2 Degraded Mode Behavior

When a non-required service is unavailable:

| Service Down | Impact | Degraded Behavior |
|-------------|--------|-------------------|
| DeAPI | Image/video generation | Fall back to Gemini image generation. Video generation unavailable — show "service unavailable" on video-dependent actions |
| Suno | Music generation | Music selection step shows "unavailable" — user can skip or upload their own audio |
| Freesound | SFX | SFX step shows "unavailable" — user can skip |
| GCS | Cloud storage | Assets stored locally only. Warn: "project assets won't sync across devices" |

When a required service is unavailable:

| Service Down | Impact |
|-------------|--------|
| Gemini | All text generation blocked. Show full-page "core service unavailable" with Settings link |
| FFmpeg | Export blocked. Show "export temporarily unavailable" on export actions |

### 13.3 Structured Logging & Observability

**Log format (server-side):**

```typescript
interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  traceId: string;         // follows a request through all stages
  userId?: string;
  projectId?: string;
  service?: string;         // gemini, deapi, suno, etc.
  action: string;           // "generation.start", "generation.complete", etc.
  duration?: number;        // ms
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}
```

**Trace ID propagation:**
- Generated at request entry (API middleware)
- Passed through all service calls as header and log context
- Included in SSE events for export progress
- Logged in client console for support debugging

**Key metrics to track (V1 — console/file logging, structured for future ingestion):**
- Generation latency per stage per provider
- Generation success/failure rate per provider
- Export job duration and success rate
- Pipeline stage transition timing
- API rate limit hit frequency

---

## 14. Accessibility Requirements

### 14.1 Foundation (WCAG 2.1 AA Target)

- Semantic HTML: proper heading hierarchy, landmark regions, form labels
- Color contrast: 4.5:1 minimum for normal text, 3:1 for large text
- Focus management: visible focus indicators on all interactive elements
- Focus trapping in modals (Tab/Shift+Tab cycle within modal)
- `aria-live` regions for async status updates (generation progress, export status)

### 14.2 Keyboard Navigation

| Context | Keys | Action |
|---------|------|--------|
| Global | `Tab` / `Shift+Tab` | Navigate interactive elements |
| Storyboard | `←` / `→` | Navigate shots |
| Storyboard | `Space` | Play/pause |
| Storyboard | `E` | Edit current shot |
| Storyboard | `F` | Toggle fullscreen |
| Storyboard | `?` | Show keyboard shortcuts |
| Storyboard | `Esc` | Close overlay/modal |
| Shot Table | `Enter` | Open shot editor |
| Shot Table | `Delete` | Delete shot (with confirmation) |
| Timeline | `←` / `→` | Scrub 1 second |
| Timeline | `Shift+←` / `Shift+→` | Scrub 5 seconds |
| Any Modal | `Esc` | Close modal |

### 14.3 Screen Reader Support

- Generation status changes announced via `aria-live="polite"`
- Export progress percentage announced at 25% intervals
- Image/video previews include `alt` text derived from generation prompt
- Drag-and-drop reordering has keyboard alternative (move up/down actions)
- Error messages associated with trigger elements via `aria-describedby`

### 14.4 Responsive Design

| Breakpoint | Layout Behavior |
|-----------|-----------------|
| Mobile (< 768px) | Single-column, bottom sheet panels, simplified timeline |
| Tablet (768-1024px) | Two-column, collapsible side panels |
| Desktop (> 1024px) | Full three-column layout with all panels visible |

---

## 15. Security

### 15.1 API Key Protection

- All provider API keys (Gemini, DeAPI, Suno, Freesound) are server-side environment variables only
- Server proxies all provider API calls — client never contacts providers directly
- Keys are never logged, never included in error responses, never stored in Firestore

### 15.2 Authentication & Authorization

- All API routes (except `/api/health`) require valid Firebase Auth token in `Authorization: Bearer {token}` header
- Server validates token via Firebase Admin SDK on every request
- Project operations validate `userId` matches token claims
- Export downloads validate project ownership before serving file

### 15.3 Input Validation

- All user-provided text inputs sanitized before use in prompts (prevent prompt injection)
- File uploads validated: type, size, magic bytes (not just extension)
- URL parameters validated against expected patterns
- Firestore rules enforce ownership and type constraints

### 15.4 Content Security

- Generated content is not moderated in V1, but the system should:
  - Log all generation prompts for audit (server-side)
  - Respect provider-side content filters (Gemini, DeAPI)
  - Not attempt to bypass provider safety filters

---

## 16. Performance Requirements

### 16.1 Load Time Targets

| Metric | Target |
|--------|--------|
| First Contentful Paint (Home) | < 1.5s |
| Time to Interactive (Home) | < 3s |
| Route transition | < 300ms |
| Project list load (< 100 projects) | < 1s |

### 16.2 Generation Time Targets

| Stage | Target | Notes |
|-------|--------|-------|
| Content plan | < 15s | Single Gemini call |
| Screenplay | < 20s | Single Gemini call |
| Shot breakdown | < 15s | Single Gemini call |
| Image generation (per shot) | < 30s | Parallel, bounded by provider |
| Video generation (per shot) | < 60s | Parallel, bounded by provider |
| Narration TTS (per segment) | < 10s | Parallel |
| Full pipeline (10-scene story) | < 3 min | With parallelism |

### 16.3 Bundle Size Budget

| Package | Max Size (gzipped) |
|---------|-------------------|
| Initial JS bundle | < 200 KB |
| Initial CSS | < 50 KB |
| Per-route chunk | < 100 KB |
| Total loaded (Studio page) | < 500 KB |

Use Vite code splitting per route. Lazy-load heavy components (timeline, waveform, video player).

### 16.4 Media Performance

- Image previews: serve thumbnails (300px width) in lists, full resolution in preview canvas
- Video previews: use poster frames, lazy-load video player
- Audio waveform: compute and cache waveform data, don't recompute on re-render
- Generated assets: cache URLs in store, don't re-fetch from provider

---

## 17. Documentation & Developer Experience

### 17.1 Required Documentation Files

| File | Location | Purpose |
|------|----------|---------|
| `AGENTS.md` | Root | Engineering constraints, architecture guardrails, commands, gotchas |
| `CLAUDE.md` | Root | AI assistant-facing repo guidance |
| `llms.txt` `https://deapi.ai/llms.txt`  | Root | Long-form third-party AI API reference (currently DeAPI) |
| `https://ai.google.dev/api/llms.txt` | online | Long-form third-party AI API reference |
| `docs/PRD.md` | `docs/` | This document |
| `docs/PIPELINE.md` | `docs/` | Pipeline architecture and stage documentation |
| `docs/PROMPTS.md` | `docs/` | Prompt template authoring guide |
| `docs/API.md` | `docs/` | Backend API endpoint reference |
| `docs/DEAPI.md` | `docs/` | DeAPI integration reference |
| `docs/GEMINI.md` | `docs/` | Gemini/Vertex integration notes |
| `docs/SUNO.md` | `docs/` | Suno integration notes |
| `docs/FREESOUND.md` | `docs/` | Freesound integration notes |

### 17.2 Provider Documentation Standards

Each provider doc must include:
- Quick start + auth model
- Endpoints grouped by capability
- Request/response examples (copy-paste-ready with placeholders)
- Status/result delivery patterns (polling/webhook/SSE)
- Rate limits, pricing, and error behavior
- Security/compliance notes
- Canonical external links

### 17.3 Documentation Maintenance Rules

- Keep reference docs at repo root or `docs/` with stable names
- Update docs when endpoint contracts, auth, or pricing change
- Never store secrets in docs — only variable names and acquisition steps
- Run doc link checker in CI (post-V1)

---

## 18. Testing Strategy

### 18.1 Unit Tests (Vitest)

**Coverage targets:**

| Package | Target |
|---------|--------|
| `shared` — prompt engine | 90% |
| `shared` — pipeline logic | 85% |
| `shared` — services | 80% |
| `server` — route handlers | 75% |
| `frontend` — stores | 80% |
| `frontend` — utility functions | 80% |

### 18.2 Integration Tests (Vitest)

- Pipeline stage transitions (mock provider responses)
- Template loading and variable substitution
- Export job lifecycle
- Project CRUD with mocked Firestore
- Auth flow with mocked Firebase

### 18.3 E2E Tests (Playwright)

**Critical paths for V1:**

1. Home → Sign In → Home (authenticated)
2. Projects → Create Project → Studio (with projectId)
3. Studio → Run pipeline → Export → Download
4. Visualizer → Upload audio → Generate visuals → Export
5. Sign Out → Attempt protected route → Redirect to Sign In

### 18.4 Template Tests

- Every format/phase pair in manifest has a corresponding template file
- Every template renders without error when all required variables are provided
- Variable substitution handles missing optional variables gracefully
- Arabic language instruction produces valid Arabic prompt text

---

## 19. Success Criteria

V1 is complete when:

1. User can navigate from Home to all creation surfaces without dead ends
2. Authentication flow works for Google sign-in and email/password
3. Authenticated user can create, list, search, favorite, and delete projects
4. Creating a project routes to correct workspace with `projectId` context
5. Studio pipeline runs end-to-end: plan → screenplay → breakdown → generation → export
6. Parallel generation stages execute concurrently where the dependency graph allows
7. Visualizer supports audio upload → transcription → visual generation → export
8. Export API supports full async lifecycle with SSE progress streaming
9. Shot workflow supports edit/save/retry with metadata persistence and reorder
10. Storyboard surface supports keyboard navigation and per-shot timeline
11. Prompt templates resolve for all active format/phase combinations
12. RTL layout works correctly when Arabic is selected
13. Health endpoint reports service status accurately
14. Settings page shows clear configuration guidance
15. Core experiences are responsive on desktop/tablet/mobile
16. Build and test baselines pass (frontend build, all Vitest suites, critical E2E paths)
17. No blocker-level runtime errors in primary V1 journeys
18. Degraded mode works correctly when optional services are unavailable

---

## 20. Open Questions

| # | Question | Status | Decision |
|---|----------|--------|----------|
| 1 | Guest access? | Resolved | No guest mode. Sign-in required for all creation. |
| 2 | `/gradient-generator` in launch nav? | Open | Likely hidden as internal utility. |
| 3 | Default export quality tier? | Proposed | Standard (1080p/30fps). |
| 4 | Cloud storage mandatory or optional? | Proposed | Optional with local fallback. Warn about cross-device limitations. |
| 5 | Story mode launch-critical or post-V1? | Open | Recommend launch-critical with reduced format coverage. |
| 6 | Arabic template strategy? | Proposed | `{{language_instruction}}` variable for V1, separate files only where needed. |
| 7 | Max projects per user? | Open | Suggest 100 for V1, revisit with usage data. |
| 8 | Asset retention policy for deleted projects? | Proposed | Immediate cascade delete. No grace period in V1. |

---

## 21. Milestones

### Milestone 1 — Foundation (Weeks 1-2)
- Route stability and navigation
- Auth flow (Google + email)
- Project CRUD + dashboard
- i18n setup + RTL foundation
- State management architecture

### Milestone 2 — Studio Pipeline (Weeks 3-5)
- Pipeline orchestration engine with state machine
- Content plan → screenplay → shot breakdown stages
- Chat interface with AI responses
- Parallel generation architecture
- Image and video generation integration
- Narration TTS integration

### Milestone 3 — Visualizer + Story Mode (Weeks 5-7)
- Visualizer: audio upload → transcription → visual gen
- Story mode: shot table, editor modal, storyboard surface
- Prompt template engine with format-specific templates
- Style guide builder for visual consistency

### Milestone 4 — Export + Polish (Weeks 7-9)
- Async export pipeline with SSE progress
- Cloud storage integration (optional)
- Degraded mode handling
- Accessibility pass
- Responsive layout pass
- Performance optimization (bundle, lazy loading)

### Milestone 5 — QA + Launch (Weeks 9-10)
- Full E2E test suite
- Template validation CI
- Documentation completion
- Bug fixes and regression pass
- Launch readiness review

---

## Appendix A: Source of Truth (Codebase)

| Concern | Location |
|---------|----------|
| Frontend routing | `packages/frontend/router` |
| Frontend screens | `packages/frontend/screens` |
| Server routes | `packages/server/index.ts` |
| Project service | `packages/shared/src/services/projectService.ts` |
| API client (retry/circuit breaker) | `packages/shared/src/services/shared/apiClient.ts` |
| Export queue + workers | `packages/server/routes/export.ts`, `packages/server/services`, `packages/server/workers` |
| Story UI | `packages/frontend/components/story/StoryWorkspace.tsx`, `ShotEditorModal.tsx`, `StoryboardView.tsx` |
| Type contracts | `packages/shared/src/types.ts` |
| Prompt engine | `packages/shared/src/services/prompt/` |
| Prompt templates | `packages/shared/src/services/prompt/templates/` |

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| ERT | Estimated Run Time — predicted duration for a shot |
| Shot | A single continuous camera take within a scene |
| Scene | A group of related shots in one location/time |
| Pipeline Stage | A discrete step in the content generation process |
| Style Guide | Structured JSON describing visual generation parameters |
| Template | Text file with variable placeholders for LLM prompts |
| Format | Content type (youtube-narrator, advertisement, etc.) |
| Phase | Pipeline step within a format (breakdown, screenplay, etc.) |
| Tashkeel | Arabic diacritical marks that indicate vowel sounds |
| MSA | Modern Standard Arabic — formal written Arabic |
| Gulf Arabic | Regional dialect spoken in Kuwait, UAE, Saudi Arabia, etc. |
