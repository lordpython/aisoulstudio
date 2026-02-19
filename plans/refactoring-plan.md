# Project Refactoring Plan: Code Cleanup and Restructuring

## Executive Summary

This document outlines a comprehensive plan to clean up duplicated code, restructure the project, and improve maintainability of the LyricLens/AISoulStudio codebase.

---

## Current Issues Identified

### 1. Duplicate Utility Functions

| Function | Location 1 | Location 2 | Issue |
|----------|------------|------------|-------|
| `jaccardSimilarity` | [`services/researchService.ts:572`](services/researchService.ts:572) | [`services/promptService.ts:138`](services/promptService.ts:138) | Different signatures - one takes Sets, one takes strings |
| `chunkContent` | [`services/researchService.ts:525`](services/researchService.ts:525) | [`services/documentParser.ts:98`](services/documentParser.ts:98) | Similar functionality, different default chunk size |
| `tokenize` | [`services/researchService.ts:558`](services/researchService.ts:558) | - | Could be shared |
| `countWords` | [`services/promptService.ts:129`](services/promptService.ts:129) | - | Could be shared |
| `normalizeForSimilarity` | [`services/promptService.ts:118`](services/promptService.ts:118) | - | Could be shared |

### 2. Duplicate Type Definitions

| Type | Locations | Issue |
|------|-----------|-------|
| `ConversationMessage` | [`services/musicProducerAgentV2.ts:312`](services/musicProducerAgentV2.ts:312), [`services/ai/studioAgent.ts:72`](services/ai/studioAgent.ts:72) | Identical interface in 2 places |
| `IntentType` | [`types.ts:368`](types.ts:368), [`services/ai/nlpIntentParser.ts:14`](services/ai/nlpIntentParser.ts:14) | Different values - one for video production, one for NLP |
| Scene-related types | Multiple files | Scene, Character, ContentPlan defined in multiple places |

### 3. Scattered Error Classes

Nine different error classes extending `Error` across multiple files:

- `SunoApiError` - [`services/sunoService.ts:396`](services/sunoService.ts:396)
- `NarratorError` - [`services/narratorService.ts:433`](services/narratorService.ts:433)
- `FormatRouterError` - [`services/formatRouter.ts:74`](services/formatRouter.ts:74)
- `EditorError` - [`services/editorService.ts:60`](services/editorService.ts:60)
- `DocumentParseError` - [`services/documentParser.ts:309`](services/documentParser.ts:309)
- `DirectorServiceError` - [`services/directorService.ts:99`](services/directorService.ts:99)
- `ContentPlannerError` - [`services/contentPlannerService.ts:126`](services/contentPlannerService.ts:126)
- `OrchestratorError` - [`services/agentOrchestrator.ts:152`](services/agentOrchestrator.ts:152)
- `AgentToolError` - [`services/agent/errors.ts:8`](services/agent/errors.ts:8)

### 4. Files to Remove (Dead Code/Temp Files)

| File | Reason |
|------|--------|
| `components/TimelineEditor/Untitled-1.txt` | 1.2MB text file - appears to be accidental |
| `services/prompt/sceneShotTemplates.ts.tmp.6581.1771381193336` | Temp file |
| `consolelogs.txt` | Debug log file (68KB) |
| `firebase-debug.log` | Debug log |
| `firebase-debug copy.log` | Duplicate debug log |
| `ptoject.json` | Typo in filename - should be `project.json` |
| `build/reports/problems/problems-report.html` | Generated report - should be gitignored |

### 5. Directory Structure Issues

**Current `services/` structure is flat with 50+ files at root level:**

```
services/
├── agent/              # ✅ Well organized
├── ai/                 # ✅ Well organized (production, subagents, rag)
├── ffmpeg/             # ✅ Well organized
├── firebase/           # ✅ Well organized
├── pipelines/          # ✅ Well organized
├── prompt/             # ✅ Well organized
├── shared/             # ✅ Well organized
├── tracing/            # ✅ Well organized
├── tts/                # ✅ Well organized
├── [40+ individual service files]  # ❌ Needs reorganization
```

---

## Proposed Refactoring Plan

### Phase 1: Consolidate Duplicate Utility Functions

**Create:** `services/utils/textProcessing.ts`

```typescript
// Consolidate all text processing utilities
export function jaccardSimilarity(a: Set<string> | string, b: Set<string> | string): number;
export function chunkContent(content: string, chunkSize?: number): string[];
export function tokenize(text: string): Set<string>;
export function countWords(s: string): number;
export function normalizeForSimilarity(s: string): string;
```

**Actions:**
1. Create new utility module with consolidated functions
2. Update imports in:
   - `services/researchService.ts`
   - `services/promptService.ts`
   - `services/documentParser.ts`
   - `services/geminiService.ts`
3. Remove duplicate function definitions

### Phase 2: Create Shared Type Definitions

**Reorganize:** `types.ts` into domain-specific type files

```
types/
├── index.ts           # Re-exports all types
├── video.ts           # VideoFormat, ContentPlan, Scene, etc.
├── audio.ts           # Audio-related types
├── story.ts           # StoryState, StoryStep, etc.
├── agent.ts           # Agent-related types (IntentType, etc.)
├── export.ts          # Export-related types
└── common.ts          # Shared utility types
```

**Actions:**
1. Split `types.ts` into domain-specific modules
2. Resolve `IntentType` conflict:
   - Rename video production one to `VideoIntentType`
   - Rename NLP one to `NlpIntentType`
3. Consolidate `ConversationMessage` into `agent.ts`
4. Update all imports

### Phase 3: Consolidate Error Classes

**Create:** `services/errors/index.ts`

```typescript
// Base error class
export abstract class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Domain-specific errors
export class MediaGenerationError extends AppError { }
export class ContentPlanningError extends AppError { }
export class ExportError extends AppError { }
export class NarrationError extends AppError { }
export class ServiceError extends AppError { }
```

**Actions:**
1. Create unified error hierarchy
2. Create migration mapping for existing errors
3. Update all throw statements and catch blocks
4. Remove old error classes

### Phase 4: Reorganize Services Directory

**Proposed structure:**

```
services/
├── index.ts                    # Main entry point
├── errors/                     # Consolidated errors
│   └── index.ts
├── utils/                      # Shared utilities
│   ├── textProcessing.ts
│   ├── idGeneration.ts
│   └── index.ts
├── types/                      # Service-specific types
│   └── index.ts
├── core/                       # Core services
│   ├── geminiService.ts
│   ├── directorService.ts
│   └── index.ts
├── media/                      # Media generation
│   ├── imageService.ts
│   ├── videoService.ts
│   ├── deapiService.ts
│   ├── sunoService.ts
│   └── index.ts
├── audio/                      # Audio services
│   ├── narratorService.ts
│   ├── audioMixerService.ts
│   ├── audioConcatService.ts
│   ├── sfxService.ts
│   ├── transcriptionService.ts
│   └── index.ts
├── content/                    # Content planning
│   ├── contentPlannerService.ts
│   ├── editorService.ts
│   ├── promptService.ts
│   ├── researchService.ts
│   └── index.ts
├── export/                     # Export services
│   ├── exportFormatsService.ts
│   ├── formatRouter.ts
│   ├── formatRegistry.ts
│   └── index.ts
├── project/                    # Project management
│   ├── projectService.ts
│   ├── projectTemplatesService.ts
│   ├── versionHistoryService.ts
│   └── index.ts
├── agent/                      # Agent system (already organized)
├── ai/                         # AI services (already organized)
├── ffmpeg/                     # FFmpeg utilities (already organized)
├── firebase/                   # Firebase services (already organized)
├── pipelines/                  # Format pipelines (already organized)
├── prompt/                     # Prompt templates (already organized)
└── shared/                     # Shared utilities (already organized)
```

### Phase 5: Clean Up Component Imports

**Current issues:**
- Components import directly from service files
- Inconsistent import patterns

**Actions:**
1. Create barrel exports for each service domain
2. Update component imports to use barrel exports
3. Establish import conventions:
   - Components should import from `services/media`, not `services/imageService`
   - Use type-only imports where possible

### Phase 6: Remove Dead Code and Unused Files

**Files to delete:**
```
components/TimelineEditor/Untitled-1.txt
services/prompt/sceneShotTemplates.ts.tmp.6581.1771381193336
consolelogs.txt
firebase-debug.log
firebase-debug copy.log
```

**Files to rename:**
```
ptoject.json → project.json (or delete if not needed)
```

**Files to add to .gitignore:**
```
build/reports/
*.log
firebase-debug*.log
consolelogs.txt
```

---

## Migration Strategy

### Step-by-Step Approach

1. **Create new structure alongside existing code**
   - Don't break existing functionality
   - Create new directories and files first

2. **Update imports incrementally**
   - One service domain at a time
   - Run tests after each domain

3. **Remove old files only after verification**
   - Ensure all imports updated
   - All tests passing

### Testing Strategy

After each phase:
1. Run unit tests: `npm test`
2. Run type checking: `npx tsc --noEmit`
3. Run linting: `npm run lint`
4. Manual smoke test of key features

### Rollback Plan

- Each phase is a separate commit
- Git allows easy rollback if issues arise
- Keep old files until verification complete

---

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| Duplicate utility functions | 5+ | 0 |
| Duplicate type definitions | 3+ | 0 |
| Scattered error classes | 9 files | 1 file |
| Files in services root | 40+ | ~10 |
| Dead/temp files | 6 | 0 |

---

## Priority Order

1. **High Priority** - Remove dead files (immediate cleanup)
2. **High Priority** - Consolidate utility functions (reduces bugs)
3. **Medium Priority** - Consolidate error classes (improves error handling)
4. **Medium Priority** - Reorganize services directory (improves navigation)
5. **Low Priority** - Split types.ts (large effort, incremental benefit)

---

## Next Steps

1. Review this plan and approve/desired modifications
2. Switch to Code mode to begin implementation
3. Start with Phase 6 (dead file removal) for quick wins
4. Proceed with Phase 1 (utility consolidation)

---

## Questions for Discussion

1. Should we keep backward compatibility with old import paths during migration?
2. Are there any services that should remain standalone?
3. What is the preferred naming convention for the consolidated error classes?
4. Should we create a monorepo structure with separate packages?
