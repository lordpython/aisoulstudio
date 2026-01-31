# LyricLens Technical Specification & Implementation Roadmap

## Executive Summary

This document provides a comprehensive technical specification for **LyricLens**, a professional-grade AI video production and editing application. The system is built on React with Zustand for state management, featuring a complex timeline editor, modular AI-driven services, and a hierarchical UI architecture.

---

## 1. Frontend Architecture (React + Zustand)

### 1.1 Multi-Store State Management

The application uses a **unified Zustand store** (`stores/appStore.ts`) with logical slices:

```typescript
// Store Schema - Current Implementation
interface AppStore {
  // === CONVERSATION SLICE ===
  messages: Message[];
  conversationContext: ConversationContext;
  workflow: WorkflowState;
  isTyping: boolean;
  
  // === GENERATION SLICE ===
  generationStage: GenerationStage;
  generationProgress: number;
  generationMessage: string;
  
  // === UI SLICE ===
  activePanel: PanelType;
  viewMode: ViewMode;
  sidebarOpen: boolean;
  
  // === EXPORT SLICE ===
  exportFormat: ExportFormat;
  exportQuality: ExportQuality;
  exportProgress: number;
  
  // === PRODUCTION SLICE ===
  contentPlan: ContentPlan | null;
  narrationSegments: NarrationSegment[];
  sfxPlan: VideoSFXPlan | null;
  topic: string;
  visualStyle: string;
  targetDuration: number;
}
```

**Key Types:**
- `GenerationStage`: `'idle' | 'planning' | 'narrating' | 'generating' | 'editing' | 'exporting'`
- `ExportFormat`: `'mp4' | 'webm' | 'gif'`
- `ExportQuality`: `'720p' | '1080p' | '4k'`
- `PanelType`: `'chat' | 'timeline' | 'preview' | 'settings'`

### 1.2 Store Features

- **Persistence**: Uses Zustand's `persist` middleware with localStorage
- **Serialization**: Base64 encoding for audio blobs, URL stripping for large media
- **Actions**: Atomic updates with immutable state patterns

---

## 2. Timeline Editor Component Architecture

### 2.1 Directory Structure

```
components/TimelineEditor/
├── GraphiteTimeline.tsx      # Main orchestrator component
├── TransportBar.tsx          # Playback controls (play, pause, seek)
├── TimeRuler.tsx             # Time scale with ticks
├── TrackLane.tsx             # Individual track container
├── TrackLabel.tsx            # Track name labels
├── Playhead.tsx              # Current time indicator
├── AudioClip.tsx             # Audio clip representation
├── GraphiteClip.tsx          # Visual clip component
├── graphite-timeline.css     # Timeline styles
├── graphite-timeline-utils.ts # Utility functions
├── timelineAdapter.ts        # State adapter layer
├── useTimelineScroll.ts      # Scroll behavior hook
├── index.ts                  # Barrel exports
└── editor/                   # Advanced editing tools
    └── (10 sub-components)
```

### 2.2 GraphiteTimeline Props Interface

```typescript
interface GraphiteTimelineProps {
  scenes: Scene[];
  visuals?: Record<string, string>;
  narrationSegments?: NarrationSegment[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSceneSelect?: (sceneId: string) => void;
  selectedSceneId?: string | null;
  projectName?: string;
  sfxPlan?: VideoSFXPlan | null;
  onDeleteClip?: (clipId: string) => void;
}
```

### 2.3 Timeline Synchronization Engine

**Core Logic (from `useTimelineAdapter.ts`):**

```typescript
// Timeline state synchronization
function syncTimelineState(scenes: Scene[], currentTime: number) {
  // 1. Calculate cumulative scene timings
  let cumulativeTime = 0;
  const sceneTimings = scenes.map(scene => {
    const start = cumulativeTime;
    cumulativeTime += scene.duration;
    return { sceneId: scene.id, start, end: cumulativeTime };
  });
  
  // 2. Find active scene based on playhead position
  const activeScene = sceneTimings.find(
    timing => currentTime >= timing.start && currentTime < timing.end
  );
  
  // 3. Calculate scene-relative time for frame-accurate seeking
  const sceneRelativeTime = activeScene 
    ? currentTime - activeScene.start 
    : 0;
    
  return { sceneTimings, activeScene, sceneRelativeTime };
}
```

**Keyboard Shortcuts (from `useTimelineKeyboard.ts`):**
- `Space`: Play/Pause toggle
- `←/→`: Seek ±5 seconds
- `Tab`: Navigate between clips
- `Delete`: Remove selected clip
- `Ctrl+Z`: Undo

---

## 3. Services Layer Architecture

### 3.1 Directory Structure

```
services/
├── ai/                          # AI Orchestration
│   ├── production/              # Production Agent
│   │   ├── agentCore.ts         # Main execution loop
│   │   ├── prompts.ts           # System prompts
│   │   ├── toolRegistration.ts  # Tool definitions
│   │   ├── types.ts             # Production types
│   │   └── tools/               # Individual tools
│   ├── subagents/               # Specialized agents
│   │   ├── supervisorAgent.ts   # Orchestrates subagents
│   │   ├── importSubagent.ts    # Media import
│   │   ├── contentSubagent.ts   # Content planning
│   │   ├── mediaSubagent.ts     # Visual/audio generation
│   │   └── exportSubagent.ts    # Export handling
│   ├── rag/                     # Knowledge base
│   └── studioAgent.ts           # Chat interface agent
│
├── ffmpeg/                      # Video Processing
│   ├── exporters.ts             # Export pipelines
│   ├── frameRenderer.ts         # Canvas rendering
│   ├── transitions.ts           # Scene transitions
│   ├── textRenderer.ts          # Subtitle rendering
│   └── assetLoader.ts           # Media loading
│
├── contentPlannerService.ts     # Scene planning
├── narratorService.ts           # TTS generation
├── directorService.ts           # Visual prompts
├── imageService.ts              # Image generation
├── videoService.ts              # Video generation
├── audioMixerService.ts         # Audio mixing
├── sfxService.ts                # Sound effects
├── sunoService.ts               # Music generation
└── cloudStorageService.ts       # Cloud uploads
```

### 3.2 Service Patterns

**Each service follows this pattern:**

```typescript
// Example: narratorService.ts
export async function generateNarration(
  scenes: Scene[],
  voiceConfig: VoiceConfig,
  onProgress?: (progress: number) => void
): Promise<NarrationSegment[]> {
  // 1. Validate inputs
  // 2. Process each scene
  // 3. Return typed results
}
```

---

## 4. UI Component Hierarchy

### 4.1 Architecture Layers

```
┌─────────────────────────────────────────────────────┐
│                    SCREENS                          │
│  HomeScreen | StudioScreen | VisualizerScreen       │
├─────────────────────────────────────────────────────┤
│                  FEATURE VIEWS                      │
│  HomeView | ProductionView | TimelinePlayer         │
├─────────────────────────────────────────────────────┤
│                 LAYOUT COMPONENTS                   │
│  Header | Sidebar | MainContent | Footer            │
├─────────────────────────────────────────────────────┤
│               COMPOSITE COMPONENTS                  │
│  SceneEditor | VideoExportModal | MusicGenerator    │
├─────────────────────────────────────────────────────┤
│                 UI PRIMITIVES                       │
│  Button | Card | Dialog | Input | Select | Slider   │
└─────────────────────────────────────────────────────┘
```

### 4.2 Component Directory

```
components/
├── layout/           # Layout components
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   └── MainContent.tsx
├── ui/               # Radix UI primitives (shadcn/ui)
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   └── (17 more)
├── TimelineEditor/   # Timeline feature
├── chat/             # AI chat interface
├── story/            # Story mode components
├── visualizer/       # Audio visualizer
└── *.tsx             # Feature components
```

---

## 5. Custom React Hooks

### 5.1 Video Playback Hooks

```
hooks/
├── useMediaPlayback.ts           # Core playback logic
├── useVideoProductionCore.ts     # Production state
├── useVideoProductionRefactored.ts # Full workflow
├── useTimelineAdapter.ts         # Timeline state sync
├── useTimelineSelection.ts       # Clip selection
├── useTimelineKeyboard.ts        # Keyboard shortcuts
├── useStoryGeneration.ts         # Story workflow
└── useLyricLens.ts               # Visualizer workflow
```

### 5.2 Key Hook: useMediaPlayback

```typescript
interface UseMediaPlaybackReturn {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
}

function useMediaPlayback(mediaRef: RefObject<HTMLMediaElement>) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const animationFrame = useRef<number>();
  
  // Sync with media element
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    
    const updateTime = () => {
      setCurrentTime(media.currentTime);
      animationFrame.current = requestAnimationFrame(updateTime);
    };
    
    if (isPlaying) {
      animationFrame.current = requestAnimationFrame(updateTime);
    }
    
    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [isPlaying, mediaRef]);
  
  // ... play, pause, seek implementations
}
```

---

## 6. Story Mode Workflow (Visual Reference Parity)

Based on the reference designs, the Story Mode requires specific enhancements to match the professional workflow.

### 6.1 Feature Requirements

1.  **Granular Progress Tracking**:
    -   Replace generic progress bars with a **Checkout-style Step List**:
        -   [x] Reading story idea...
        -   [x] Aligning with genre...
        -   [ ] Identifying characters...
        -   [ ] Creating scene breakdown...

2.  **Tabular Shotlist View**:
    -   Implement a dense **Data Grid View** for the "Shot List" step (alongside the visual grid).
    -   **Columns**: Scene #, Shot #, Description, Dialogue, Duration, Shot Size (Wide/Close), Perspective, Movement (Pan/Tilt), Equipment (Tripod/Handheld).
    -   **Functionality**: Inline editing, row reordering.

3.  **Character Management Studio**:
    -   **CRUD Operations**: "Add New", "Edit", "Delete" characters manually.
    -   **Visual Editor**: modal with portrait upload/generation and attribute editing.
    -   **Consistency Check**: Per-character visual consistency verification.

4.  **Genre Selection Interface**:
    -   Visual grid selection for genres (Action, Animation, Comedy, etc.) before breakdown generation.
    -   Genre-specific prompt biases for the Content Planner.

### 6.2 Component Additions/Updates

```typescript
components/story/
├── ShotlistTable.tsx         // [NEW] Tabular view using TanStack Table
├── CharacterEditorDialog.tsx // [NEW] Add/Edit character details
├── ProgressSteps.tsx         // [NEW] Granular checklist visualization
└── StoryboardView.tsx        // [UPDATE] Add toggle for Grid vs Table view
```

---

## 7. Implementation Roadmap

### Phase 1: Core Foundation (Weeks 1-2)
- [x] Zustand store with persistence
- [x] Basic UI primitives (shadcn/ui)
- [x] Route configuration
- [x] Type definitions

### Phase 2: Timeline Editor (Weeks 3-4)
- [x] GraphiteTimeline component
- [x] Multi-track rendering
- [x] Playhead and seeking
- [x] Keyboard navigation
- [x] Accessibility (ARIA)

### Phase 3: AI Services (Weeks 5-7)
- [x] Content planner service
- [x] Narrator service (TTS)
- [x] Image generation (Gemini)
- [x] Video generation (Veo/DeAPI)
- [x] Multi-agent orchestration

### Phase 4: Export Pipeline (Weeks 8-9)
- [x] FFmpeg integration
- [x] Frame rendering
- [x] Transitions
- [x] Audio mixing
- [x] Cloud storage

### Phase 5: Polish (Weeks 10-12)
- [x] Error recovery
- [x] Progress tracking
- [x] Mobile support
- [x] Performance optimization

### Phase 6: Story Mode Enhancements (Refinement Phase) [NEW]
- [ ] Implement `ShotlistTable` with inline editing
- [ ] Add `CharacterEditor` for manual character management
- [ ] Create `ProgressSteps` component for granular feedback
- [ ] Refine `IdeaView` with visual genre selector card grid

---

## 8. Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State Management | Zustand | Simpler than Redux, built-in persistence |
| UI Components | Radix/shadcn | Accessible, unstyled primitives |
| Styling | Tailwind CSS 4 | Utility-first, design tokens |
| Video Processing | FFmpeg WASM + Server | Browser + server fallback |
| AI Orchestration | LangChain | Tool calling, streaming, tracing |
| Routing | React Router v7 | Type-safe, data loading |

---

## 9. Current State Summary

**Implemented Features:**
- ✅ Multi-store Zustand architecture with persistence
- ✅ Non-linear timeline editor with multi-track support
- ✅ Modular services for AI, media, and export
- ✅ Hierarchical UI with primitives and feature components
- ✅ Custom hooks for playback and state sync
- ✅ Multi-agent production pipeline
- ✅ FFmpeg export with transitions
- ✅ Cloud storage integration
- ✅ Internationalization (EN/AR)

**Architecture Highlights:**
- 99 components across 7 categories
- 101 service files across 6 domains
- 16 custom React hooks
- Comprehensive type system (548 lines in types.ts)
- Full accessibility support

---

*This specification documents the existing LyricLens architecture as implemented, with planned enhancements for visual reference parity.*
