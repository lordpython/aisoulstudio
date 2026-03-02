# AIsoul Studio — V1 Product Requirements Document

> **This document describes the V1 release (YouTube narrator videos only).**  
> For features planned after launch, see [AIsoul_Studio_Future_Roadmap.md](AIsoul_Studio_Future_Roadmap.md).

---

## Document Info

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Author | RA3 + Grok Collaboration |
| Last Updated | 2026-03-02 |
| Status | V1 Ready — Focused on Core Workflow |

---

## 1. Product Vision

AIsoul Studio is an AI Film Studio that turns raw ideas into export-ready YouTube-style narrator videos with consistent visuals and professional polish.

**V1 Focus: Single Core Workflow — YouTube-Style Narrator Videos**

To validate the platform with real users sooner and reduce integration debt, V1 is intentionally scoped to one high-value format:

- **YouTube Narrator Videos**: Engaging, story-driven content with AI narration and visuals
  - Fast visual Idea Setup with Director's Brief
  - Structured Character Seed generation & persistence
  - Master Context Injection for zero style/character drift
  - Simplified pipeline: Content Plan → Screenplay → Visual Generation → Export
  - Sequential generation with simple queue (no complex parallel stages)
  - Project persistence, async export, Gulf Arabic + English support

**Next Steps & Future Vision**

After V1 validation, we will expand to additional formats (advertisement, documentary, shorts, music-video), audio-first Visualizer workflow, shot-level Expert Mode, and advanced pipeline features. See the [Future Roadmap](AIsoul_Studio_Future_Roadmap.md) for full details.

---

## 2. Tech Stack

### 2.1 Frontend

- React 19, TypeScript, Vite 7, React Router 7
- Tailwind CSS 4, Radix UI, Framer Motion
- Zustand for client state management

### 2.2 Backend

- Express 5 (TypeScript via tsx)
- FFmpeg for server-side video encoding
- Simple Firestore-based job queue (no Redis/BullMQ in V1)

### 2.3 Shared Domain Layer

- `@studio/shared` — services, stores, pipelines, types, prompt engine
- Consumed by both frontend and server packages

### 2.4 AI & Media Services

| Provider | Role | Required | V1 Status |
|----------|------|----------|-----------|
| Gemini | Text generation (`gemini-2.5-flash`), TTS (`gemini-2.5-flash-preview-tts`), image generation (Imagen) | Yes | **Primary engine** |
| DeAPI | Image/video generation acceleration | No | **Optional accelerator** — fallback to Gemini |
| Suno | AI music generation | No | **Post-V1** |
| Freesound | SFX library search | No | **Post-V1** |
| FFmpeg | Server-side video encoding | Yes (server) | Required |

**V1 Provider Strategy:**

- **Gemini is the sole required AI provider** — handles all text generation, TTS, and image generation
- **DeAPI is an optional accelerator** — when available, provides faster/higher-quality image/video generation; falls back to Gemini when unavailable
- **Music/SFX deferred** — Users upload their own audio files in V1

### 2.5 Data & Auth

- Firebase Auth (Google sign-in + email/password)
- Firestore (user profile, project, export, and job records)
- Google Cloud Storage (required for generated media asset persistence)

### 2.6 Monorepo Structure

```
packages/
  frontend/     → React app (Vite)
  server/       → Express API server + prompt templates
  shared/       → Core TypeScript types only
```

### 2.7 Testing

- Vitest — unit/integration (frontend + server + shared)
- Playwright — E2E (critical paths)

---

## 3. V1 Scope — What We're Building

### 3.1 V1 Focus: YouTube-Style Narrator Videos

**Primary User Goals:**

1. Start creating quickly from a home screen
2. Complete a guided Idea Setup (topic + genre + art style) in under 45 seconds
3. Manage and reopen projects across sessions
4. Produce AI-generated YouTube-style narrator videos with consistent visuals
5. Export final videos with visible progress and downloadable output
6. Work seamlessly in Arabic (Gulf dialect) and English, including RTL layouts

### 3.2 What V1 Does NOT Include

- Additional formats (advertisement, documentary, shorts, music-video, movie-animation)
- Lyric video Visualizer workflow
- Shot-level cinematographic control (Expert Mode)
- Team collaboration or real-time multi-user editing
- Billing, subscriptions, or usage metering
- Automated critique loops with auto-revision
- AI music generation (Suno)
- AI SFX library (Freesound)
- Complex parallel pipeline stages
- Separate export worker pool (BullMQ/Redis)

---

## 4. Information Architecture & Routing

### 4.1 Route Map

| Route | Page | Auth Required | Description |
|-------|------|---------------|-------------|
| `/` | Home | No | Landing page with create CTA |
| `/projects` | Projects | Yes | Project dashboard with CRUD |
| `/studio` | Studio | Yes | Main production workspace |
| `/studio/setup` | Idea Setup | Yes | Guided visual start for new projects |
| `/signin` | Sign In | No | Authentication page |
| `/settings` | Settings | Yes | API key status and configuration |
| `*` | Not Found | No | 404 fallback |

### 4.2 Auth Flow

All creation features require authentication. The flow is:

1. Unauthenticated user lands on Home → sees create CTA with sign-in prompt
2. Clicking create → redirects to `/signin` with return URL
3. After sign-in → redirects to `/studio/setup`
4. Direct navigation to protected routes without auth → redirect to `/signin`

---

## 5. Detailed Page Requirements

### 5.1 Home (`/`)

**Purpose:** Entry point. Help the user understand what they can create and get started fast.

**Layout:**
- Cinematic hero section with product tagline
- Single prominent CTA: "Create YouTube Video"
- Header with nav actions (Projects, Settings, Sign In / User Avatar)
- Language toggle (AR/EN) in header

**Behavior:**
- Single creation path — all users create YouTube-style narrator videos
- Clicking "Create" → `/studio/setup` for authenticated users
- Unauthenticated users route to `/signin?redirect=/studio/setup`

### 5.2 Projects (`/projects`)

**Purpose:** Dashboard for managing all user projects.

**Layout:**
- Create button
- Search input with debounced filtering
- Sort controls (recent, alphabetical, favorites first)
- Grid/list view toggle
- Favorites section

**Behavior:**
- Create project flow:
  1. Click "Create New Video" → create project in Firestore with `format: "youtube-narrator"`
  2. Navigate to `/studio/setup?projectId=NEW`
- Delete, favorite, search functionality

**Data — Firestore Project Model:**

```typescript
interface Project {
  id: string;
  userId: string;
  title: string;
  type: "youtube-narrator";
  status: "draft" | "in-progress" | "completed" | "failed";
  metadata: {
    topic?: string;
    style?: string;
    format: "youtube-narrator";
    language?: "ar" | "en";
    sceneCount?: number;
    hasNarration?: boolean;
    hasMusic?: boolean;      // User-uploaded only
    hasSFX?: boolean;        // User-uploaded only
    thumbnailUrl?: string;
  };
  isFavorite: boolean;
  tags: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastAccessedAt: Timestamp;
}
```

### 5.3 Studio (`/studio`)

**Purpose:** The main production workspace.

**URL Parameters:**
- `projectId` — restores existing project session

**Layout:**
- Left panel: Chat/conversation interface
- Center: Preview canvas
- Right panel: Scene list and generation queue
- Bottom: Timeline bar

### 5.3.1 Idea Setup (`/studio/setup`)

**Purpose:** Fast, visual onboarding. Collect topic + genre + art style.

**Layout:**
- **Left (35%) — Idea Input:** Large textarea with character count
- **Center (35%) — Genre:** Card grid (Gulf-first ordering)
- **Right (30%) — Art Style:** Gallery of 8 visual cards + upload option

**Bottom bar:**
- Cancel
- Generate Story Plan (primary)
- Skip & Use Chat

### 5.4 Story Workspace (`/studio`)

**Purpose:** Structured storyboard-driven production with simplified V1 controls.

**V1 Simplification:** Shot-level cinematographic control is deferred. V1 provides AI-inferred shot details with scene-level organization.

**Layout Components:**

**Scene List Panel:**
- Scene cards with thumbnail previews
- Scene-level generation entry points

**Scene Editor:**
- Image preview for active scene
- Description and narration text editing
- Simple controls: regenerate image, adjust narration

**Storyboard Preview Surface:**
- Full-bleed visual preview
- Scene thumbnail strip
- Duration timeline bar
- Keyboard shortcuts: `←`/`→`, `Space`, `E`, `F`, `?`, `Esc`

**Behavior:**
- AI infers shot composition from scene descriptions
- No shot-level metadata in V1
- Edit saves are non-destructive

**V1 Data Model:**

```typescript
interface Scene {
  id: string;
  sceneNumber: number;
  description: string;
  narrationText?: string;
  narrationAudioUrl?: string;
  imageUrl?: string;
  videoUrl?: string;  // Optional: if DeAPI available
  durationEst: number;
  status: "pending" | "generating" | "complete" | "failed";
}
```

### 5.5 Sign In (`/signin`)

**Purpose:** Authenticate users.

**Layout:**
- Desktop: split-screen with branding/visual on left, auth form on right
- Google sign-in button (primary)
- Email/password form

### 5.6 Settings (`/settings`)

**Purpose:** Show API key status.

**Service Requirements:**

| Service | Required | Check Method |
|---------|----------|-------------|
| Gemini | Yes | Server-side validation |
| DeAPI | No | Server-side validation |
| FFmpeg | Yes | Binary check |
| GCS | Yes | Bucket connectivity |

---

## 6. Internationalization & RTL Support

### 6.1 Language Support

V1 supports Arabic (Gulf dialect) and English.

### 6.2 i18n Architecture

- Locale files: `locales/en.json`, `locales/ar.json`
- Language detection: preference → browser locale → default (English)
- Language toggle in header, persisted to localStorage

### 6.3 RTL Layout Requirements

- `dir="rtl"` and `lang="ar"` on `<html>` when Arabic active
- Tailwind CSS logical properties (`ps-`, `pe-`, `ms-`, `me-`)
- Icon mirroring in RTL
- Timeline scrubs right-to-left in Arabic mode

### 6.4 Arabic Text in AI Pipelines

- `{{language_instruction}}` variable for Arabic guidance
- Gulf Arabic dialect preference for TTS
- Diacritical marks (tashkeel) preservation

**Testing & Quality:**
- Validate with native Gulf Arabic speakers before launch
- Prepare separate `.ar.txt` templates if shared approach fails
- Test dialogue naturalness, cultural references, TTS pronunciation

---

## 7. State Management Architecture

### 7.1 Store Domains

```
useAuthStore          → user session, token state
useProjectStore       → active project metadata, CRUD
useStudioStore        → production pipeline state
useExportStore        → job queue, progress tracking
useConversationStore  → chat messages, AI responses
useUIStore            → modals, panels, navigation state
```

### 7.2 Persistence Strategy

| Store | Persistence | Method |
|-------|-------------|--------|
| `useAuthStore` | Across sessions | Firebase Auth |
| `useProjectStore` | Across sessions | Firestore |
| `useStudioStore` | Session + recovery | localStorage |
| `useExportStore` | Current session | Memory + Firestore |
| `useConversationStore` | Session + recovery | localStorage |
| `useUIStore` | Across sessions | localStorage |

---

## 8. Pipeline Orchestration

### 8.1 Pipeline Stage Model

```typescript
type StageStatus = "idle" | "queued" | "running" | "complete" | "failed" | "skipped";

interface PipelineStage {
  id: string;
  label: string;
  status: StageStatus;
  progress: number;
  dependencies: string[];
  canRetry: boolean;
  error?: string;
  estimatedDurationSeconds?: number;
}
```

### 8.2 V1 Simplified Pipeline (Sequential)

```
[Idea Setup → Director's Brief]
          ↓
[Content Plan] ← Gemini structured output
          ↓
[Screenplay / Script] ← Sequential generation
          ↓
[Character Seed Generation] ← Gemini structured output
          ↓
[Visual Generation] ← Sequential image generation
          ↓
[Narration TTS] ← Single TTS call for entire script
          ↓
[Export] ← Basic FFmpeg on same server
          ↓
       [Done]
```

**V1 Pipeline Rules:**
- Sequential execution (no parallel stages)
- Simple image queue (one-by-one)
- Single TTS call for entire script
- Same-server export (no separate workers)
- Manual review only (no auto-critique)
- AI-inferred cinematography (no Expert Mode)

### 8.3 Provider Assignment (V1)

| Stage | Primary Provider | Fallback |
|-------|-----------------|----------|
| Content plan, screenplay | Gemini | — |
| Image generation | Gemini Imagen | DeAPI (if configured) |
| TTS narration | Gemini TTS | — |
| Export encoding | FFmpeg (server) | — |

### 8.4 Stage Failure & Recovery

- Failed stages surface error in UI with retry button
- Retry only re-runs failed stage and dependents
- Pipeline can be paused; completed stages preserved in Firestore

### 8.5 Long-Running Generation Jobs

**Job Persistence Model:**

```typescript
interface GenerationJob {
  jobId: string;
  userId: string;
  projectId: string;
  stage: string;
  status: "queued" | "running" | "complete" | "failed";
  progress: number;
  estimatedWaitSeconds?: number;
  resultUrl?: string;
  error?: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;  // 7 days
}
```

- Jobs stored in Firestore
- API returns `jobId` immediately
- Frontend polls every 5 seconds
- Users can leave and resume via `jobId`

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
├── RouteGuard
│   └── <Outlet />
├── ServiceStatusBanner
├── ModalHost
└── ToastProvider
```

### 9.2 Studio Components

```
Studio/
├── IdeaSetupScreen
│   ├── IdeaTextarea
│   ├── GenreCard
│   ├── ArtStyleCard
│   └── UploadZone
├── StudioWorkspace
│   ├── ChatPanel
│   ├── PreviewCanvas
│   ├── ContextPanel
│   └── TimelineBar
├── PipelineStatusBar
└── ExportModal
```

---

## 10. Backend / API Architecture

### 10.1 Route Groups

| Route Group | Purpose |
|-------------|---------|
| `/api/health` | Service readiness |
| `/api/auth` | Token validation |
| `/api/projects` | Project CRUD |
| `/api/export` | Export job lifecycle |
| `/api/ai` | Story plan, generation, TTS |
| `/api/deapi` | Optional image/video proxy |
| `/api/storage` | GCS upload proxy |

### 10.2 Export Pipeline (V1 Simplified)

**Architecture:** Server-side FFmpeg with Firestore job queue.

**Flow:**
1. `POST /api/export/init` → validate manifest → create Firestore job → return `jobId`
2. Cron job (every 30s) picks up pending exports
3. FFmpeg assembles timeline on API server
4. Progress updates written to Firestore
5. Client polls `GET /api/export/status/:jobId`

**V1 Job Schema:**

```typescript
interface ExportJob {
  jobId: string;
  userId: string;
  projectId: string;
  status: "pending" | "processing" | "complete" | "failed";
  progress: number;
  manifest: ExportManifest;
  outputUrl?: string;
  expiresAt: Timestamp;  // 30 days
}
```

### 10.3 API Reliability

- Automatic retry with exponential backoff (max 3)
- Circuit breaker per service
- Request timeout: 30s for sync calls
- All API keys server-side only

---

## 11. Prompt Service & Template Architecture

### 11.1 Template Engine

**File:** `packages/server/src/services/promptBuilder.ts`

```typescript
buildPrompt(domain: TemplateDomain, phase: string, variables: Record<string, string>): string
```

**Template Variables:**

| Variable | Description | Required |
|----------|-------------|----------|
| `{{idea}}` | Story topic | Yes |
| `{{genre}}` | Selected genre | Yes |
| `{{language_instruction}}` | Arabic/English guidance | Yes |
| `{{art_style}}` | Art style name | No |
| `{{character_descriptions}}` | Character data | No |

### 11.2 Template Library (V1)

**V1 Format:**

| Format | Status |
|--------|--------|
| `youtube-narrator` | **V1** |
| All other formats | [Future Roadmap](AIsoul_Studio_Future_Roadmap.md) |

**V1 Phases:**
- `breakdown`
- `screenplay`
- `script-generation`
- `hook-creation`

### 11.3 Gemini TTS

**Voice:** Charon (informative) — matches YouTube narrator style

**Arabic Support:** Gulf Arabic dialect + tashkeel guidance injected for TTS

### 11.4 Arabic Template Strategy

- Primary: `{{language_instruction}}` variable
- Fallback: Separate `.ar.txt` files if testing shows issues
- **Testing required:** Validate with native speakers

---

## 12. Data Architecture

### 12.1 Firestore Schema

```
users/
  {userId}/
    → User profile
    projects/
      {projectId}/
        → Project document
        exports/
          {exportId}/
        sessions/
          {sessionId}/
    jobs/
      {jobId}/
        → Generation/export jobs
```

### 12.2 Cloud Asset Structure (GCS)

```
users/{userId}/
  projects/{projectId}/
    images/scene-{n}.png
    videos/scene-{n}.mp4
    exports/final-{quality}.mp4
audio/
  narration/{userId}/{sceneId}.wav
  music/{userId}/{projectId}.mp3
```

---

## 13. Error Handling & Resilience

### 13.1 Degraded Mode

| Service Down | Degraded Behavior |
|-------------|-------------------|
| DeAPI | Fall back to Gemini Imagen for images |
| Gemini | Full-page "core service unavailable" |

### 13.2 Structured Logging

```typescript
interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  traceId: string;
  userId?: string;
  projectId?: string;
  service?: string;
  action: string;
  duration?: number;
  error?: { code: string; message: string };
}
```

---

## 14. Accessibility Requirements

### 14.1 Foundation (WCAG 2.1 AA)

- Semantic HTML, proper heading hierarchy
- 4.5:1 color contrast minimum
- Visible focus indicators
- Focus trapping in modals
- `aria-live` for async updates

### 14.2 Keyboard Navigation

| Context | Keys | Action |
|---------|------|--------|
| Global | `Tab` / `Shift+Tab` | Navigate elements |
| Storyboard | `←` / `→` | Navigate scenes |
| Storyboard | `Space` | Play/pause |
| Storyboard | `E` | Edit current |
| Modal | `Esc` | Close |

---

## 15. Security

- All API keys server-side only
- Firebase Auth token validation on all routes
- Input sanitization before prompt use
- File upload validation (type, size, magic bytes)
- Lightweight content moderation pre-flight

---

## 16. Performance Requirements

### 16.1 Generation Time Targets (Realistic)

| Stage | p50 | p95 |
|-------|-----|-----|
| Content plan | < 15s | < 30s |
| Screenplay | < 20s | < 45s |
| Image (Gemini) | < 15s | < 30s |
| Image (DeAPI) | 30-120s | 2-5 min |
| TTS (full script) | < 30s | < 60s |
| Export (5-min video) | 1-2 min | 3-5 min |
| **Full pipeline** | **10-15 min** | **30-45 min** |

### 16.2 Progress Indicators

- Real-time progress % per stage
- ETA based on observed p95 times
- Users can pause/resume via `jobId`

### 16.3 Export Capacity (V1)

- Single-process export using `node-cron`
- Concurrency: 1 job at a time
- FFmpeg on same server as API

---

## 17. Documentation

| File | Location | Priority |
|------|----------|----------|
| `AGENTS.md` | Root | Required |
| `CLAUDE.md` | Root | Required |
| `docs/PRD.md` | `docs/` | Required |
| `docs/PIPELINE.md` | `docs/` | Required |
| `docs/PROMPTS.md` | `docs/` | Required |
| `docs/API.md` | `docs/` | Required |
| `docs/DEAPI.md` | `docs/` | Required |
| `docs/GEMINI.md` | `docs/` | Required |
| Future Roadmap | `AIsoul_Studio_Future_Roadmap.md` | Reference |

---

## 18. Testing Strategy

### 18.1 Coverage Targets

| Package | Target |
|---------|--------|
| `shared` — prompt engine | 90% |
| `shared` — pipeline | 85% |
| `server` — routes | 75% |
| `frontend` — stores | 80% |

### 18.2 E2E Critical Paths

1. Home → Sign In → Home
2. Projects → Create → Idea Setup → Studio
3. Studio → Pipeline → Export → Download
4. Sign Out → Redirect to Sign In

---

## 19. Success Criteria

V1 is complete when:

1. User can navigate from Home to creation flow
2. Authentication works (Google + email)
3. User can CRUD projects
4. Core pipeline runs: plan → screenplay → characters → images → TTS → export
5. Sequential execution (no parallel complexity)
6. Export works with poll-based progress
7. Shot workflow supports basic edit/save/retry
8. Prompt templates resolve for youtube-narrator
9. RTL works in Arabic
10. Health endpoint reports status
11. Responsive on desktop/tablet/mobile
12. Build and tests pass
13. Degraded mode falls back to Gemini
14. Job persistence works (pause/resume)
15. Progress indicators show ETA
16. Arabic quality validated with native speakers

---

## 20. Open Questions

| # | Question | Decision |
|---|----------|----------|
| 1 | Guest access? | No — sign-in required |
| 2 | Default export quality? | Standard (1080p/30fps) |
| 3 | Cloud storage? | Mandatory |
| 4 | V1 format scope? | YouTube narrator only |
| 5 | Job queue? | Firestore + node-cron |
| 6 | Shot-level control? | Auto-generated; Expert Mode deferred |
| 7 | Music/SFX? | User-uploaded only |

---

## 21. Milestones

### Milestone 0 — Environment (Week 0)
- Firebase setup, emulator config
- Local dev environment

### Milestone 1 — Foundation (Weeks 1-2)
- Routes, auth, projects CRUD
- i18n, RTL, state management
- GCS bootstrap

### Milestone 2 — Core Pipeline (Weeks 3-5)
- Prompt template engine
- Sequential pipeline implementation
- Idea Setup, chat interface
- Gemini integration (primary)
- Optional DeAPI with fallback

### Milestone 3 — Export + Polish (Weeks 5-7)
- Firestore job queue + cron
- FFmpeg export on server
- Poll-based progress
- Degraded mode
- Accessibility, responsive

### Milestone 4 — QA + Launch (Weeks 7-8)
- E2E tests
- Arabic testing
- Documentation
- Bug fixes, launch review

---

## Appendix A: Source of Truth

| Concern | Location |
|---------|----------|
| Frontend routing | `packages/frontend/src/router/` |
| Server routes | `packages/server/src/routes/` |
| AI generation | `packages/server/src/services/gemini.ts` |
| Prompt builder | `packages/server/src/services/promptBuilder.ts` |
| Templates | `packages/server/src/prompts/templates/` |
| Export processor | `packages/server/src/services/exportJobProcessor.ts` |
| Job queue | Firestore: `users/{userId}/jobs/{jobId}` |
| Stores | `packages/frontend/src/stores/` |
| Types | `packages/shared/src/types/core.ts` |

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| ERT | Estimated Run Time |
| Scene | A narrative segment with visuals and narration |
| Pipeline Stage | A discrete step in content generation |
| Template | Text file with variable placeholders |
| Tashkeel | Arabic diacritical marks |
| MSA | Modern Standard Arabic |
| Gulf Arabic | Regional dialect (Kuwait, UAE, Saudi Arabia) |
| Expert Mode | Post-V1 shot-level control feature |

---

**Next Steps:** For features planned after V1 launch, see [AIsoul_Studio_Future_Roadmap.md](AIsoul_Studio_Future_Roadmap.md).
