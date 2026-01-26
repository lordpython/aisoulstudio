# LyricLens Codebase Improvement Plan

> **Generated:** January 25, 2026
> **Codebase Size:** ~70,000 lines of TypeScript/React
> **Issues Identified:** 59 actionable items
> **Estimated Dead Code:** ~4,300 lines

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Priority Matrix](#priority-matrix)
4. [Phase 1: Critical Cleanup](#phase-1-critical-cleanup)
5. [Phase 2: Code Quality](#phase-2-code-quality)
6. [Phase 3: Performance Optimization](#phase-3-performance-optimization)
7. [Phase 4: Architecture Improvements](#phase-4-architecture-improvements)
8. [Phase 5: Testing & Documentation](#phase-5-testing--documentation)
9. [File-by-File Action Items](#file-by-file-action-items)
10. [Risk Assessment](#risk-assessment)
11. [Success Metrics](#success-metrics)

---

## Executive Summary

### Key Findings

| Category | Issues | Impact |
|----------|--------|--------|
| Dead Code | 4,300+ lines | High - bloats bundle, confuses developers |
| Type Safety | 284 violations | High - runtime errors, maintenance burden |
| Performance | 160+ anti-patterns | Medium - unnecessary re-renders |
| Architecture | 6 god files (>1000 lines) | Medium - hard to maintain |
| Testing | 0 tests | Critical - no regression protection |
| Security | 2 concerns | High - agents run client-side |

### Recommended Approach

1. **Immediate** (Week 1): Delete dead code, fix security issues
2. **Short-term** (Weeks 2-3): Type safety, split god files
3. **Medium-term** (Weeks 4-6): Performance optimization, testing
4. **Long-term** (Ongoing): Architecture improvements, documentation

---

## Current State Analysis

### Codebase Metrics

```
Total Files:        ~150 TypeScript/React files
Total Lines:        ~70,000
Dead Code:          ~4,300 lines (6.1%)
God Files:          6 files >1,000 lines
Type Violations:    268 'any' + 16 @ts-ignore
Console Statements: 733 (no logging service)
Test Coverage:      0%
```

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ TooltipProv │→ │ErrorBoundary│→ │      AppShell       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    AppRouter                           │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌────────┐  │  │
│  │  │HomeScreen│ │StudioScr │ │VisualizerS│ │Settings│  │  │
│  │  │ (lazy)   │ │ (lazy)   │ │  (lazy)    │ │ (lazy) │  │  │
│  │  └──────────┘ └──────────┘ └────────────┘ └────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Services Layer                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              AI Multi-Agent System                   │    │
│  │  Supervisor → Import → Content → Media → Export     │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐     │
│  │ Narrator │ │  Image   │ │  Video   │ │   FFmpeg   │     │
│  │ Service  │ │ Service  │ │ Service  │ │  Pipeline  │     │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 Express Server (:3001)                       │
│  /api/export/* │ /api/import/* │ /api/gemini/* │ /api/deapi│
└─────────────────────────────────────────────────────────────┘
```

### Problem Areas

```
components/
├── AIStudioView.tsx       ← DEAD CODE (1,427 lines)
├── ProductionView.tsx     ← DEAD CODE (1,113 lines)
├── SleekProductionView.tsx← DEAD CODE (760 lines)
├── MusicGeneratorModal.tsx← TOO LARGE (1,032 lines)
└── ...

hooks/
├── useVideoProduction.ts  ← DEAD CODE (987 lines)
├── useSunoMusic.ts        ← TOO LARGE (845 lines)
└── useVideoProductionCore.ts ← DUPLICATE

services/
├── ai/productionAgent.ts  ← GOD FILE (2,849 lines)
├── jsonExtractor.ts       ← GOD FILE (1,960 lines)
└── ...

server/
└── index.ts               ← NO SEPARATION (1,306 lines)
```

---

## Priority Matrix

### P0 - Critical (Do First)

| Issue | Risk | Effort |
|-------|------|--------|
| Delete dead code (4,300 lines) | None | Low |
| Fix agents running client-side | Security | High |
| Add try/catch to JSON.parse | Runtime errors | Low |

### P1 - High Priority

| Issue | Risk | Effort |
|-------|------|--------|
| Fix 268 `any` types | Type safety | Medium |
| Split god files (6 files) | Maintainability | High |
| Add unit tests | Regression | High |
| Fix array index keys | UI bugs | Low |

### P2 - Medium Priority

| Issue | Risk | Effort |
|-------|------|--------|
| Replace 733 console.* | Debugging | Medium |
| Add React.memo | Performance | Medium |
| Fix inline onClick handlers | Performance | Medium |
| Centralize URLs | Configuration | Low |

### P3 - Low Priority

| Issue | Risk | Effort |
|-------|------|--------|
| Add alt text to images | Accessibility | Low |
| Extract magic numbers | Readability | Low |
| Fix inline styles | Consistency | Low |

---

## Phase 1: Critical Cleanup

### 1.1 Delete Dead Code

**Files to Delete:**
```bash
# Components (3,300 lines)
rm components/AIStudioView.tsx
rm components/ProductionView.tsx
rm components/SleekProductionView.tsx

# Hooks (987 lines)
rm hooks/useVideoProduction.ts

# Example files only (useVideoProductionCore.ts is NOT dead code - keep it!)
# DO NOT DELETE: hooks/useVideoProductionCore.ts (used by useVideoProductionRefactored.ts)
rm services/ai/enhancedStudioAgent.example.ts
```

**Verification:**
```bash
# Ensure no imports exist for dead code
grep -r "AIStudioView\|ProductionView\|SleekProductionView" --include="*.tsx" .
grep -r "useVideoProduction\b" --include="*.tsx" . | grep -v "Refactored\|Core"

# IMPORTANT: useVideoProductionCore.ts IS used - verify before any deletion:
grep -r "useVideoProductionCore" --include="*.ts" --include="*.tsx" .
# Should show import in useVideoProductionRefactored.ts - DO NOT DELETE
```

### 1.2 Security Fix - Server-Side Agents

**Current Problem:**
```typescript
// vite.config.ts - Current (INSECURE)
// TODO: Refactor agents to run server-side to remove this security risk.
```

**Recommendation:**

1. Move agent execution to Express server
2. Create API endpoint for agent invocation
3. Keep only UI components client-side

```typescript
// server/routes/agent.ts (NEW)
import { Router } from 'express';
import { runSupervisorAgent } from '../services/ai/subagents';

const router = Router();

router.post('/api/agent/run', async (req, res) => {
  const { sessionId, instruction, preferences } = req.body;

  try {
    const result = await runSupervisorAgent({
      sessionId,
      instruction,
      userPreferences: preferences,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

### 1.3 Fix JSON.parse Vulnerabilities

**Locations to Fix:**
```typescript
// hooks/useStoryGeneration.ts:100
const parsed = JSON.parse(savedState); // ❌ No try/catch

// Fix:
try {
  const parsed = JSON.parse(savedState);
  // use parsed
} catch (e) {
  console.error('Failed to parse saved state:', e);
  // fallback to default state
}
```

**All locations requiring fix:**
- `hooks/useStoryGeneration.ts:100`
- `components/TimelineEditor/GraphiteTimeline.tsx:149`
- `server/index.ts:554`
- `services/agent/agentTools.ts:36,46,457`

---

## Phase 2: Code Quality

### 2.1 Type Safety

**Replace `any` with proper types (268 occurrences)**

```typescript
// Before
const handleClick = (e: any) => { ... }

// After
const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => { ... }
```

**Priority files:**
1. `services/` - Most critical for data flow
2. `hooks/` - State management
3. `components/` - UI layer

**Fix `@ts-ignore` directives (16 occurrences):**

| File | Line | Fix |
|------|------|-----|
| `screens/SettingsScreen.tsx` | 62,88,103 | Add proper env types |
| `services/deapiService.ts` | 12 | Create Vite env.d.ts |
| `services/imageService.ts` | 131,165 | Update SDK types |
| `services/videoService.ts` | 283 | Update Gemini types |

**Create proper environment types:**
```typescript
// env.d.ts
interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_DEAPI_API_KEY: string;
  readonly VITE_SUNO_API_KEY: string;
  readonly VITE_FREESOUND_API_KEY: string;
  readonly VITE_USE_MULTI_AGENT: string;
  readonly VITE_SERVER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### 2.2 Split God Files

#### productionAgent.ts (2,849 → ~500 lines each)

```
services/ai/
├── productionAgent/
│   ├── index.ts           # Main orchestrator (~300 lines)
│   ├── phases/
│   │   ├── import.ts      # Import phase (~400 lines)
│   │   ├── content.ts     # Content planning (~400 lines)
│   │   ├── media.ts       # Media generation (~500 lines)
│   │   ├── enhancement.ts # Enhancement phase (~400 lines)
│   │   └── export.ts      # Export phase (~400 lines)
│   ├── utils/
│   │   ├── progress.ts    # Progress tracking
│   │   └── validation.ts  # Validation helpers
│   └── types.ts           # Shared types
```

#### server/index.ts (1,306 → ~200 lines each)

```
server/
├── index.ts               # App setup (~100 lines)
├── middleware/
│   ├── cors.ts
│   ├── upload.ts
│   └── errorHandler.ts
├── routes/
│   ├── export.ts          # /api/export/*
│   ├── import.ts          # /api/import/*
│   ├── gemini.ts          # /api/gemini/*
│   ├── deapi.ts           # /api/deapi/*
│   └── suno.ts            # /api/suno/*
└── controllers/
    ├── exportController.ts
    ├── importController.ts
    └── ...
```

#### StudioScreen.tsx (1,044 → ~300 lines each)

```
screens/
├── StudioScreen/
│   ├── index.tsx          # Main component (~200 lines)
│   ├── StudioChat.tsx     # Chat panel (~250 lines)
│   ├── StudioPreview.tsx  # Preview panel (~200 lines)
│   ├── StudioTimeline.tsx # Timeline panel (~200 lines)
│   ├── StudioModals.tsx   # Modal management (~150 lines)
│   └── hooks/
│       └── useStudioState.ts # Local state (~200 lines)
```

### 2.3 Implement Logging Service

**Create centralized logger:**

```typescript
// services/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, error?: Error, data?: unknown) => void;
}

const isDev = import.meta.env.DEV;

export const logger: Logger = {
  debug: (message, data) => {
    if (isDev) console.debug(`[DEBUG] ${message}`, data ?? '');
  },
  info: (message, data) => {
    console.info(`[INFO] ${message}`, data ?? '');
  },
  warn: (message, data) => {
    console.warn(`[WARN] ${message}`, data ?? '');
  },
  error: (message, error, data) => {
    console.error(`[ERROR] ${message}`, error, data ?? '');
    // In production, send to error tracking service
    if (!isDev && error) {
      // sendToErrorTracking(error, { message, data });
    }
  },
};
```

**Replace 733 console statements:**
```bash
# Find and replace pattern
grep -rn "console\." --include="*.ts" --include="*.tsx" . | grep -v node_modules
```

---

## Phase 3: Performance Optimization

### 3.1 Fix React Anti-Patterns

#### Array Index as Key

**Before:**
```tsx
{items.map((item, idx) => (
  <li key={idx}>{item.name}</li>
))}
```

**After:**
```tsx
{items.map((item) => (
  <li key={item.id}>{item.name}</li>
))}
```

**Files to fix:**
- `components/chat/QuickActions.tsx:68`
- `components/layout/Sidebar.tsx:166,192,215`
- `components/QualityDashboard.tsx:201,221,242,359`
- `components/story/CharacterView.tsx:90,103`
- `components/IntroAnimation.tsx:175`

#### Add React.memo

**Components to memoize:**
```typescript
// High-impact components (render frequently)
export const MessageBubble = React.memo<MessageBubbleProps>(({ ... }) => {
  // ...
});

export const SceneThumbnails = React.memo<SceneThumbnailsProps>(({ ... }) => {
  // ...
});

export const TimelinePanel = React.memo<TimelinePanelProps>(({ ... }) => {
  // ...
});
```

**Candidates for memoization:**
1. `MessageBubble` - Renders in list, content rarely changes
2. `SceneThumbnails` - Renders in list
3. `QuickActions` - Static actions
4. `TrackSidebar` - Timeline component
5. `VideoPreviewCard` - Complex rendering

#### Replace Inline Arrow Functions

**Before:**
```tsx
<Button onClick={() => setActiveTab(tab.id)}>
  {tab.label}
</Button>
```

**After:**
```tsx
const handleTabClick = useCallback((tabId: string) => {
  setActiveTab(tabId);
}, []);

<Button onClick={() => handleTabClick(tab.id)}>
  {tab.label}
</Button>

// Or better - use data attributes
const handleTabClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
  const tabId = e.currentTarget.dataset.tabId;
  if (tabId) setActiveTab(tabId);
}, []);

<Button data-tab-id={tab.id} onClick={handleTabClick}>
  {tab.label}
</Button>
```

### 3.2 Fix Timer Cleanup

**Pattern to follow:**

```typescript
useEffect(() => {
  const timeoutId = setTimeout(() => {
    // do something
  }, 1000);

  return () => clearTimeout(timeoutId); // Always cleanup
}, []);
```

**Files needing cleanup review:**
- `components/AIStudioView.tsx:173` - setTimeout without ref
- `components/LiveProgress.tsx:115,131` - setInterval
- `components/MusicChatModalV2.tsx:170,181` - Recursive polling
- `screens/StudioScreen.tsx:190,278` - Both setTimeout and setInterval

### 3.3 Add Functional State Updates

**Before:**
```typescript
setItems([...items, newItem]); // ❌ Stale closure risk
```

**After:**
```typescript
setItems(prev => [...prev, newItem]); // ✅ Always latest state
```

**Apply to all state updates involving previous state.**

---

## Phase 4: Architecture Improvements

### 4.1 Centralize Configuration

**Create config module:**

```typescript
// config/index.ts
export const config = {
  api: {
    baseUrl: import.meta.env.VITE_SERVER_URL || 'http://localhost:3001',
    timeout: 30000,
  },
  features: {
    multiAgent: import.meta.env.VITE_USE_MULTI_AGENT !== 'false',
    rag: import.meta.env.VITE_ENABLE_RAG !== 'false',
  },
  limits: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxVideoDuration: 300, // 5 minutes
  },
  defaults: {
    sampleRate: 24000,
    wavHeaderSize: 44,
    pollInterval: 5000,
  },
  thresholds: {
    quality: {
      good: 80,
      acceptable: 60,
    },
  },
} as const;
```

**Replace hardcoded values:**
```typescript
// Before
const SERVER_URL = "http://localhost:3001";
const sampleRate = 24000;
if (score >= 80) { ... }

// After
import { config } from '@/config';
const SERVER_URL = config.api.baseUrl;
const sampleRate = config.defaults.sampleRate;
if (score >= config.thresholds.quality.good) { ... }
```

### 4.2 Consolidate Types

**Create unified type system:**

```
types/
├── index.ts           # Re-exports all types
├── media.ts           # Media-related types
├── timeline.ts        # Timeline/editor types (from audio-editor.ts)
├── store.ts           # Store state types (from appStore.ts)
├── api.ts             # API request/response types
└── components.ts      # Component prop types
```

**Merge scattered types:**
- `types.ts` (root) → `types/media.ts`
- `types/audio-editor.ts` → `types/timeline.ts`
- Types from `stores/appStore.ts` → `types/store.ts`

### 4.3 Remove Deprecated Code

| Item | Location | Replacement |
|------|----------|-------------|
| `secureApiClient.ts` | `services/` | Use server proxy |
| `LANGUAGES` constant | `constants/languages.ts` | `CONTENT_LANGUAGES` |
| `processYouTube` method | `hooks/useLyricLens.ts` | `processFile` |
| 8 legacy exports | `TimelineEditor/index.ts` | `AudioTimelineEditor` |

### 4.4 Replace CommonJS Requires

**Files with require():**

```typescript
// services/agent/cloudStorageTools.ts
const cloudStorage = require("../cloudStorageService"); // ❌

// Fix:
import * as cloudStorage from "../cloudStorageService"; // ✅
```

**All files to fix:**
- `services/agent/cloudStorageTools.ts:29,33,36,39`
- `services/cloudStorageService.ts:268`
- `services/promptService.ts:369,370`

---

## Phase 5: Testing & Documentation

### 5.1 Add Unit Tests

**Testing stack (already configured):**
- Vitest for unit tests
- Playwright for E2E tests

**Priority test targets:**

```typescript
// 1. Services (pure functions, easy to test)
describe('narratorService', () => {
  it('should generate narration for scene', async () => {
    const result = await narrateScene(mockScene, mockConfig);
    expect(result.audioUrl).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);
  });
});

// 2. Hooks (state logic)
describe('useLyricLens', () => {
  it('should process audio file', async () => {
    const { result } = renderHook(() => useLyricLens());
    await act(() => result.current.processFile(mockFile));
    expect(result.current.songData).toBeDefined();
  });
});

// 3. Components (user interactions)
describe('ChatInput', () => {
  it('should submit on Enter key', () => {
    const onSubmit = vi.fn();
    render(<ChatInput onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalled();
  });
});
```

**Recommended test structure:**
```
__tests__/
├── unit/
│   ├── services/
│   │   ├── narratorService.test.ts
│   │   ├── contentPlannerService.test.ts
│   │   └── ...
│   ├── hooks/
│   │   ├── useLyricLens.test.ts
│   │   └── ...
│   └── utils/
├── integration/
│   ├── api/
│   └── agents/
└── e2e/
    ├── studio.spec.ts
    ├── visualizer.spec.ts
    └── ...
```

### 5.2 Add E2E Tests

```typescript
// e2e/studio.spec.ts
import { test, expect } from '@playwright/test';

test('should create video from topic', async ({ page }) => {
  await page.goto('/studio?mode=video');

  // Enter topic
  await page.fill('[data-testid="chat-input"]', 'Create a video about space');
  await page.press('[data-testid="chat-input"]', 'Enter');

  // Wait for generation
  await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();

  // Verify result
  await expect(page.locator('[data-testid="video-preview"]')).toBeVisible({
    timeout: 120000 // 2 minute timeout for generation
  });
});
```

### 5.3 Accessibility Fixes

**Add missing alt text:**
```tsx
// Before
<img src={scene.imageUrl} />

// After
<img
  src={scene.imageUrl}
  alt={`Scene ${index + 1}: ${scene.description}`}
/>
```

**Files needing alt text:**
- `components/ImageGenerator.tsx:327,361`
- `components/SceneEditor.tsx:183`
- `components/VideoPreviewCard.tsx:98,195`
- `components/visualizer/SceneThumbnails.tsx:73`
- `components/visualizer/VisualPreview.tsx:77`
- And 7 more locations

---

## File-by-File Action Items

### Components to Delete
| File | Lines | Action |
|------|-------|--------|
| `components/AIStudioView.tsx` | 1,427 | Delete |
| `components/ProductionView.tsx` | 1,113 | Delete |
| `components/SleekProductionView.tsx` | 760 | Delete |

### Components to Split
| File | Lines | Target |
|------|-------|--------|
| `components/MusicGeneratorModal.tsx` | 1,032 | 3-4 files |
| `screens/StudioScreen.tsx` | 1,044 | 5-6 files |

### Services to Refactor
| File | Lines | Target |
|------|-------|--------|
| `services/ai/productionAgent.ts` | 2,849 | 6-8 files |
| `services/jsonExtractor.ts` | 1,960 | 3-4 files |
| `services/sunoService.ts` | 1,423 | 2-3 files |

### Hooks to Delete/Consolidate
| File | Lines | Action |
|------|-------|--------|
| `hooks/useVideoProduction.ts` | 987 | Delete (dead code) |
| `hooks/useVideoProductionCore.ts` | 95 | **KEEP** (used by Refactored) |
| `hooks/useSunoMusic.ts` | 845 | Split |

### Server to Split
| File | Lines | Target |
|------|-------|--------|
| `server/index.ts` | 1,306 | 8-10 files |

---

## Risk Assessment

### Low Risk Changes
- Deleting dead code (no imports)
- Adding alt text
- Extracting magic numbers
- Adding React.memo

### Medium Risk Changes
- Splitting god files (may break imports)
- Replacing console.* with logger
- Fixing type safety issues

### High Risk Changes
- Moving agents to server-side
- Refactoring state management
- Changing API structure

### Mitigation Strategies

1. **Version Control**: Create feature branches for each phase
2. **Testing**: Add tests before refactoring
3. **Incremental**: Small, reviewable PRs
4. **Rollback Plan**: Tag releases before major changes

---

## Success Metrics

### Code Quality
| Metric | Current | Target |
|--------|---------|--------|
| Dead code | 4,300 lines | 0 lines |
| `any` types | 268 | <20 |
| `@ts-ignore` | 16 | 0 |
| Files >1000 lines | 6 | 0 |
| Console statements | 733 | 0 |

### Performance
| Metric | Current | Target |
|--------|---------|--------|
| Array index keys | 15+ | 0 |
| Inline onClick | 103 | <20 |
| Memoized components | 1 | 15+ |
| Bundle size | TBD | -10% |

### Testing
| Metric | Current | Target |
|--------|---------|--------|
| Unit test coverage | 0% | 70% |
| E2E tests | 0 | 20+ |
| Integration tests | 0 | 10+ |

### Maintainability
| Metric | Current | Target |
|--------|---------|--------|
| Avg file size | 450 lines | <300 lines |
| Max file size | 2,849 lines | <500 lines |
| Duplicated code | Unknown | <5% |

---

## Implementation Checklist

### Week 1: Critical Cleanup
- [ ] Delete `AIStudioView.tsx`
- [ ] Delete `ProductionView.tsx`
- [ ] Delete `SleekProductionView.tsx`
- [ ] Delete `useVideoProduction.ts`
- [x] **KEEP** `useVideoProductionCore.ts` (used by Refactored version!)
- [ ] Delete `enhancedStudioAgent.example.ts`
- [ ] Add try/catch to all JSON.parse calls
- [ ] Create security plan for server-side agents

### Week 2: Type Safety
- [ ] Create `env.d.ts` for environment types
- [ ] Fix all `@ts-ignore` directives
- [ ] Fix 50% of `any` types in services
- [ ] Fix all `as any` casts in components

### Week 3: Split God Files
- [ ] Split `server/index.ts` into routes
- [ ] Split `productionAgent.ts` into phases
- [ ] Split `StudioScreen.tsx` into components
- [ ] Split `MusicGeneratorModal.tsx`

### Week 4: Performance
- [ ] Fix all array index keys
- [ ] Add React.memo to 10 components
- [ ] Replace 50+ inline onClick handlers
- [ ] Add timer cleanup to all components

### Week 5: Testing
- [ ] Set up Vitest configuration
- [ ] Add tests for 5 critical services
- [ ] Add tests for 5 critical hooks
- [ ] Add 5 E2E tests with Playwright

### Week 6: Polish
- [ ] Implement logging service
- [ ] Replace all console statements
- [ ] Add missing alt text
- [ ] Centralize configuration
- [ ] Consolidate type definitions

---

## Appendix: Commands Reference

### Delete Dead Code
```bash
rm components/AIStudioView.tsx
rm components/ProductionView.tsx
rm components/SleekProductionView.tsx
rm hooks/useVideoProduction.ts
# DO NOT DELETE: hooks/useVideoProductionCore.ts (actively used!)
rm services/ai/enhancedStudioAgent.example.ts
```

### Find Issues
```bash
# Find any types
grep -rn "\bany\b" --include="*.ts" --include="*.tsx" . | grep -v node_modules

# Find console statements
grep -rn "console\." --include="*.ts" --include="*.tsx" . | grep -v node_modules

# Find array index keys
grep -rn "key={.*index\|key={.*idx\|key={i}" --include="*.tsx" . | grep -v node_modules

# Find inline onClick
grep -rn "onClick={() =>" --include="*.tsx" . | grep -v node_modules
```

### Run Tests
```bash
npm test              # Unit tests
npm run test:e2e      # E2E tests
npm run test:run      # CI mode
```

---

*This plan should be reviewed and updated as work progresses. Create GitHub issues for each major item to track progress.*
