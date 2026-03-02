# Codebase vs V1 PRD Analysis

**Date:** 2026-03-02  
**V1 PRD:** AIsoul_Studio_V1_PRD.md  
**Future Roadmap:** AIsoul_Studio_Future_Roadmap.md

---

## Executive Summary

The codebase contains **significant scope beyond the V1 PRD**. While the core V1 features (YouTube narrator workflow) are present, the codebase also implements many Phase 2-4 features that should be deferred according to the PRD.

### Key Finding: Codebase is Ahead of V1 Scope

| Area | V1 PRD Requirement | Current Codebase | Status |
|------|-------------------|------------------|--------|
| **Routes** | `/`, `/projects`, `/studio`, `/settings`, `/signin` | Plus `/visualizer`, `/gradient-generator` | **Exceeds V1** |
| **AI Providers** | Gemini primary, DeAPI optional | Suno, Freesound fully integrated | **Exceeds V1** |
| **Job Queue** | Firestore + node-cron | File-based with SSE | **Different** |
| **Pipeline** | Sequential | Parallel execution engine exists | **Exceeds V1** |
| **Shot Control** | Scene-level (AI inferred) | Full Expert Mode exists | **Exceeds V1** |
| **Formats** | YouTube narrator only | Multiple formats supported | **Exceeds V1** |

---

## Detailed Analysis

### 1. Routes & Screens

#### V1 PRD Required Routes
- `/` — Home
- `/projects` — Projects
- `/studio` — Studio
- `/studio/setup` — Idea Setup
- `/signin` — Sign In
- `/settings` — Settings

#### Codebase Routes (router/routes.ts)
```typescript
'/'                    // Home ✅
'/projects'            // Projects ✅
'/studio'              // Studio ✅
'/visualizer'          // Visualizer ❌ POST-V1
'/gradient-generator'  // Extra feature ❌ NOT IN PRD
'/settings'            // Settings ✅
```

**Finding:** `/visualizer` route exists but should be Phase 3 per PRD.

---

### 2. AI Providers Integration

#### V1 PRD Strategy
| Provider | Required | V1 Status |
|----------|----------|-----------|
| Gemini | Yes | Primary engine |
| DeAPI | No | Optional accelerator |
| Suno | No | **Post-V1** |
| Freesound | No | **Post-V1** |

#### Codebase Implementation
- **Suno API** (`server/routes/suno.ts`): Fully implemented with file upload, custom generation
- **Freesound** (`shared/src/services/freesoundService.ts`): 27KB service with full search/download
- **DeAPI** (`server/routes/deapi.ts`): Image generation, animation endpoints
- **Gemini** (`server/routes/gemini.ts`): Basic integration

**Finding:** Suno and Freesound are fully integrated despite being marked Post-V1 in PRD.

---

### 3. Job Queue Architecture

#### V1 PRD Specification
```typescript
// Firestore-based job queue
interface ExportJob {
  jobId: string;
  userId: string;
  projectId: string;
  status: "pending" | "processing" | "complete";
  progress: number;
  // Stored in Firestore
}
// Poll-based progress (5-second intervals)
// node-cron for job processing
```

#### Codebase Implementation
```typescript
// File-based job queue (server/services/jobQueue/)
class JobQueueManager extends EventEmitter {
  private jobs: Map<string, RenderJob>;
  private subscribers: Map<string, Set<JobProgressCallback>>;
  // MAX_CONCURRENT_JOBS = 2
  // Jobs stored to disk: temp/jobs/{jobId}.json
}

// SSE progress subscriptions (not polling)
```

**Key Differences:**
| Aspect | V1 PRD | Codebase |
|--------|--------|----------|
| Storage | Firestore | File-based (temp/jobs/) |
| Progress | Polling (5s) | SSE (real-time) |
| Concurrency | 1 job | 2 concurrent jobs |
| Recovery | Firestore persistence | File recovery |

**Finding:** Architecture is more advanced than V1 spec but uses file storage instead of Firestore.

---

### 4. Pipeline Execution

#### V1 PRD: Sequential Pipeline
```
Idea Setup → Content Plan → Screenplay → Characters → 
Visual Generation → TTS → Export
```
- Sequential execution only
- No parallel stages

#### Codebase: Parallel Execution Exists
```typescript
// shared/src/services/parallelExecutionEngine.ts
export class ParallelExecutionEngine {
  async executeParallel(tasks: Task[]): Promise<Results>
  // Dependency graph execution
  // Worker pool management
}
```

**Finding:** Parallel execution engine exists (15KB) despite V1 specifying sequential only.

---

### 5. Shot/Scene Control

#### V1 PRD: Scene-Level (Simplified)
```typescript
interface Scene {
  id: string;
  sceneNumber: number;
  description: string;
  narrationText?: string;
  imageUrl?: string;
  durationEst: number;
  // AI infers shot composition
}
```

#### Codebase: Full Expert Mode
```typescript
// ShotType, CameraAngle, Movement enums exist
export type ShotType =
  | "extreme-close-up"
  | "close-up"
  | "medium-shot"
  | "wide-shot";

// InstructionTriplet for cinematography
export interface InstructionTriplet {
  primaryEmotion: string;
  cinematicDirection: string;
  environmentalAtmosphere: string;
}
```

**Finding:** Full cinematographic control types exist despite V1 specifying AI-inferred only.

---

### 6. Services Beyond V1 Scope

#### Post-V1 Services Already Implemented

| Service | Size | Purpose | PRD Phase |
|---------|------|---------|-----------|
| `sunoService.ts` | 28KB | AI music generation | Phase 3 |
| `freesoundService.ts` | 27KB | SFX library | Phase 3 |
| `parallelExecutionEngine.ts` | 15KB | Parallel pipeline | Phase 4 |
| `visualConsistencyService.ts` | 14KB | Style persistence | Phase 2 |
| `checkpointSystem.ts` | 7KB | Critique & revision | Phase 4 |
| `narratorService.ts` | 44KB | Multi-format narration | Phase 2 |

**Finding:** ~135KB of services exist for Post-V1 features.

---

### 7. Visualizer (Phase 3 Feature)

#### Codebase Implementation
- **Route:** `/visualizer` exists
- **Screen:** `VisualizerScreen.tsx` (20KB)
- **Components:**
  - `AudioUploadForm.tsx` (14KB)
  - `SceneThumbnails.tsx` (4KB)
  - `VisualPreview.tsx` (5KB)
- **Hooks:** `useLyricLens.ts` (17KB)

**Finding:** Full Visualizer workflow implemented despite being Phase 3 in PRD.

---

### 8. Multi-Format Support

#### V1 PRD: YouTube Narrator Only
```typescript
interface Project {
  type: "youtube-narrator";  // Single format
  format: "youtube-narrator";
}
```

#### Codebase: Format Registry
```typescript
// shared/src/services/formatRegistry.ts
export const FORMATS = {
  YOUTUBE_NARRATOR: 'youtube-narrator',
  SHORTS: 'shorts',
  DOCUMENTARY: 'documentary',
  MOVIE_ANIMATION: 'movie-animation',
  ADVERTISEMENT: 'advertisement',
  EDUCATIONAL: 'educational',
  MUSIC_VIDEO: 'music-video',
};

// Format routing and validation exists
```

**Finding:** Full format registry exists with routing logic despite V1 specifying single format.

---

### 9. Architecture Alignment

#### Database & Storage

| Aspect | V1 PRD | Codebase | Status |
|--------|--------|----------|--------|
| Auth | Firebase Auth | Firebase Auth ✅ | ✅ Aligned |
| Project Store | Firestore | Firestore ✅ | ✅ Aligned |
| Job Queue | Firestore | File-based ⚠️ | ⚠️ Different |
| Media Storage | GCS | GCS ✅ | ✅ Aligned |
| State Persistence | localStorage + Firestore | localStorage + Firestore ✅ | ✅ Aligned |

#### Export Pipeline

| Aspect | V1 PRD | Codebase | Status |
|--------|--------|----------|--------|
| Encoder | FFmpeg | FFmpeg ✅ | ✅ Aligned |
| Queue | Firestore + cron | File-based + SSE ⚠️ | ⚠️ Different |
| Workers | Same server | Worker pool exists ⚠️ | ⚠️ Exceeds |
| Progress | Polling | SSE ⚠️ | ⚠️ Exceeds |

---

### 10. Misalignment Summary

#### Features That Exceed V1 Scope

| Feature | Location | PRD Phase | Action Needed |
|---------|----------|-----------|---------------|
| Visualizer | `/visualizer` route, screen, components | Phase 3 | **Disable/hide** for V1 |
| Suno Integration | `suno.ts` route, `useSunoMusic.ts` | Phase 3 | **Disable** for V1 |
| Freesound | `freesoundService.ts` | Phase 3 | **Disable** for V1 |
| Parallel Pipeline | `parallelExecutionEngine.ts` | Phase 4 | Ensure sequential mode only |
| Multi-format | `formatRegistry.ts` | Phase 2 | Restrict to youtube-narrator |
| Expert Mode Types | `ShotType`, `InstructionTriplet` | Phase 2 | Hide UI, keep types |
| Gradient Generator | `/gradient-generator` route | Not in PRD | **Remove** or keep as utility |

#### Architecture Differences

| Aspect | Current | V1 Spec | Recommendation |
|--------|---------|---------|----------------|
| Job Storage | File-based | Firestore | Evaluate: File-based may be acceptable for V1 |
| Progress | SSE | Polling | Keep SSE — it's better UX |
| Concurrency | 2 jobs | 1 job | Acceptable for V1 |

---

## Recommendations

### Option 1: Disable Post-V1 Features (Recommended)

Add feature flags to disable Post-V1 features for initial launch:

```typescript
// config.ts
export const FEATURE_FLAGS = {
  VISUALIZER: false,        // Phase 3
  SUNO_INTEGRATION: false,  // Phase 3
  FREESOUND: false,         // Phase 3
  MULTI_FORMAT: false,      // Phase 2 — lock to youtube-narrator
  EXPERT_MODE: false,       // Phase 2 — scene-level only
  PARALLEL_PIPELINE: false, // Phase 4 — sequential only
};
```

**Pros:**
- Clean V1 scope
- Can enable features incrementally
- Matches PRD commitments

**Cons:**
- Code exists but is unused
- Maintenance overhead

### Option 2: Update PRD to Match Codebase

Revise V1 PRD to include features that are already implemented:

**Potential V1 Additions:**
- Visualizer (already complete)
- Suno integration (already complete)
- File-based job queue (works well)
- SSE progress (better than polling)

**Pros:**
- Ship more features
- No code changes needed

**Cons:**
- Increases V1 risk
- More integration points to test
- Delays launch

### Option 3: Hybrid Approach

Keep core V1 features + select "ready" features:

**V1 Core (Required):**
- YouTube narrator workflow
- Gemini integration
- Sequential pipeline
- Scene-level control

**V1 Additions (Already Working):**
- Visualizer (complete, low risk)
- File-based job queue (working)
- SSE progress (better UX)

**Post-V1 (Disable):**
- Suno/Freesound (external dependencies)
- Multi-format (testing overhead)
- Expert Mode (complex UI)

---

## Code Quality Observations

### Strengths
1. **Well-organized monorepo** — Clear package separation
2. **Type safety** — Comprehensive TypeScript types
3. **i18n support** — Arabic and English locales ready
4. **Service architecture** — Clean separation of concerns
5. **Hook-based React** — Modern patterns with custom hooks

### Concerns
1. **Large hook files** — `useStoryGeneration.ts` is 99KB (consider splitting)
2. **Feature bloat** — Many Post-V1 features mixed in V1 code
3. **Test coverage** — Limited test files visible
4. **Documentation** — Some services lack inline documentation

---

## Next Steps

1. **Decision Required:** Choose Option 1, 2, or 3 above
2. **If Option 1:** Implement feature flags and hide Post-V1 UI
3. **If Option 2:** Update PRD and test all features thoroughly
4. **If Option 3:** Selectively enable features with flags
5. **Testing:** Add E2E tests for critical V1 paths
6. **Documentation:** Update inline docs for key services

---

## Appendix: File Inventory by Phase

### V1 Core Files
```
frontend/screens/HomeScreen.tsx
frontend/screens/ProjectsScreen.tsx
frontend/screens/StudioScreen.tsx
frontend/screens/SignInScreen.tsx
frontend/screens/SettingsScreen.tsx
server/routes/gemini.ts
server/routes/export.ts
shared/src/services/narratorService.ts (youtube-narrator mode)
```

### Post-V1 Files (Phase 2+)
```
frontend/screens/VisualizerScreen.tsx          # Phase 3
frontend/hooks/useSunoMusic.ts                 # Phase 3
frontend/hooks/useLyricLens.ts                 # Phase 3
server/routes/suno.ts                          # Phase 3
shared/src/services/freesoundService.ts        # Phase 3
shared/src/services/parallelExecutionEngine.ts # Phase 4
shared/src/services/checkpointSystem.ts        # Phase 4
shared/src/services/visualConsistencyService.ts # Phase 2
shared/src/services/formatRegistry.ts          # Phase 2
```
