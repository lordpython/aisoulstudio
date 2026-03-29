# Frontend Component Wiring Diagram

## App Entry & Shell

```mermaid
graph TD
    subgraph Entry["App Entry"]
        INDEX["index.tsx"]
        APP["App.tsx"]
    end

    subgraph Shell["App Shell & Providers"]
        TP["TooltipProvider"]
        EB["ErrorBoundary"]
        AS["AppShell (RTL/LTR, lang, dir)"]
        INTRO["IntroAnimation (lazy)"]
        TOASTER["Toaster"]
    end

    INDEX --> APP
    APP --> TP --> EB --> AS
    AS --> INTRO
    AS --> ROUTER["AppRouter"]
    AS --> TOASTER
```

## Router → Screens

```mermaid
graph TD
    ROUTER["AppRouter (BrowserRouter)"]
    RL["RouteLayout"]

    ROUTER --> RL

    RL --> HOME["/ → HomeScreen"]
    RL --> PROJECTS["/projects → ProjectsScreen"]
    RL --> NEWPROJ["/projects/new → NewProjectScreen"]
    RL --> PROJID["/projects/:id → redirect /studio?projectId="]
    RL --> STORYID["/story/:id → redirect /studio?projectId=&mode=story"]
    RL --> STUDIO["/studio → StudioScreen"]
    RL --> VIZ["/visualizer → VisualizerScreen"]
    RL --> GRAD["/gradient-generator → GradientGeneratorScreen"]
    RL --> HELP["/help → HelpScreen"]
    RL --> SIGNIN["/signin → SignInScreen"]
    RL --> NOTFOUND["* → NotFoundScreen"]

    style STUDIO fill:#2563eb,color:#fff
    style HOME fill:#2563eb,color:#fff
```

## HomeScreen Internals

```mermaid
graph TD
    HOME["HomeScreen"]
    HEADER_H["Header"]
    CARDS["Mode Cards (3)"]

    HOME --> HEADER_H
    HOME --> CARDS

    CARDS -->|"Video card"| STUDIO_V["/studio?mode=video"]
    CARDS -->|"Music card"| STUDIO_M["/studio?mode=music"]
    CARDS -->|"Visualizer card"| VIZ["/visualizer"]
```

## StudioScreen — The Main Hub

```mermaid
graph TD
    STUDIO["StudioScreen"]

    subgraph Layout["ScreenLayout wrapper"]
        SL["ScreenLayout"]
        AMB["AmbientBackground"]
        HDR["Header + headerActions"]
        FOOTER["footer: ChatInput (chat mode only)"]
    end

    subgraph Hooks["Shared State & Hooks"]
        PS["useProjectSession(projectId)"]
        MS["useModalState()"]
        AS2["useAppStore()"]
    end

    subgraph ModeToggle["Mode Toggle (header)"]
        CHAT_BTN["Chat Mode"]
        STORY_BTN["Story Mode"]
        EDITOR_BTN["Editor"]
    end

    subgraph Panels["Lazy-Loaded Panels"]
        VPP["VideoProductionPanel"]
        SP["StoryPanel"]
        MP["MusicPanel"]
    end

    STUDIO --> Layout
    STUDIO --> Hooks
    SL --> HDR
    HDR --> ModeToggle
    SL --> FOOTER

    CHAT_BTN -->|"studioMode=chat"| VPP
    STORY_BTN -->|"studioMode=story"| SP
    EDITOR_BTN -->|"studioMode=editor"| MP

    style VPP fill:#16a34a,color:#fff
    style SP fill:#ca8a04,color:#fff
    style MP fill:#9333ea,color:#fff
```

## VideoProductionPanel — Chat/Video Mode

```mermaid
graph TD
    VPP["VideoProductionPanel"]

    subgraph Modals["Modals & Overlays"]
        EXP["VideoExportModal"]
        QD["QualityDashboard"]
        SE["SceneEditor"]
        MM["MusicGeneratorModal / MusicChatModalV2"]
        SET["SettingsModal"]
        TL["TimelinePlayer"]
    end

    subgraph Production["Production Components"]
        CP["CheckpointApproval"]
        PP["PipelineProgress"]
        AP["AgentProgress"]
        FS["FormatSelector"]
        VPC["VideoPreviewCard"]
        QE["QuickExport"]
        QU["QuickUpload"]
        RDU["ReferenceDocumentUpload"]
        TTS["TTSEngineSelector"]
    end

    subgraph ChatUI["Chat UI"]
        CI["ChatInput (from footer)"]
        MB["MessageBubble"]
        QA["QuickActions"]
    end

    VPP --> Modals
    VPP --> Production
    VPP --> ChatUI

    style VPP fill:#16a34a,color:#fff
```

## StoryPanel — Story Mode

```mermaid
graph TD
    SP["StoryPanel"]

    subgraph StoryWorkspace["StoryWorkspace"]
        IV["IdeaView"]
        SV["ScriptView"]
        SBV["StoryboardView"]
        CV["CharacterView"]
        SC["SceneCard"]
        SEM["ShotEditorModal"]
        SS["StyleSelector"]
        TG["TemplatesGallery"]
        EOP["ExportOptionsPanel"]
        VHP["VersionHistoryPanel"]
    end

    subgraph Progress["Progress Indicators"]
        BP["BreakdownProgress"]
        SBP["StoryboardProgress"]
        SPB["StepProgressBar"]
    end

    subgraph Guards["Guards & Boundaries"]
        LWD["LockWarningDialog"]
        SWEB["StoryWorkspaceErrorBoundary"]
    end

    SP --> StoryWorkspace
    SP --> Progress
    SP --> Guards

    style SP fill:#ca8a04,color:#fff
```

## MusicPanel — Editor Mode

```mermaid
graph TD
    MP["MusicPanel"]

    subgraph VideoEditor["VideoEditor"]
        VE["VideoEditor.tsx"]
        CP2["CanvasPreview"]
        MTT["MultiTrackTimeline"]
        ETB["EnhancedTransportBar"]
        VET["VideoEditorToolbar"]
        TPL["ToolPanels"]
        TLP["TrackLabelPanel"]
        TR["TrackRow"]
    end

    subgraph Clips["Track Clips"]
        ATC["AudioTrackClip"]
        ITC["ImageTrackClip"]
        VTC["VideoTrackClip"]
        TC["TextClip"]
    end

    subgraph TimelineEditor["TimelineEditor"]
        ATE["AudioTimelineEditor"]
        GC["GraphiteClip"]
        AC["AudioClip"]
        PH["Playhead"]
        TRUL["TimeRuler"]
        TLB["TrackLabel"]
        TLN["TrackLane"]
        TB["TransportBar"]
        FN["FooterNav"]
    end

    subgraph TEEditor["TimelineEditor/editor"]
        TLPN["TimelinePanel"]
        TLC["TimelineControls"]
        VPREV["VideoPreview"]
        TSB["TrackSidebar"]
        IMM["ImportMediaModal"]
        ICC["ImageClipComponent"]
        VCC["VideoClipComponent"]
        SUB["SubtitleClip"]
        WC["WaveformClip"]
    end

    MP --> VideoEditor
    VE --> Clips
    MP --> TimelineEditor
    ATE --> TEEditor

    style MP fill:#9333ea,color:#fff
```

## Layout Components (shared across screens)

```mermaid
graph TD
    subgraph LayoutLayer["Layout Layer"]
        AL["AppLayout"]
        AS3["AppShell"]
        SL2["ScreenLayout"]
        HDR2["Header"]
        SB["Sidebar"]
        DI["DirectionalIcon"]
        LS["LanguageSwitcher"]
    end

    AS3 -->|"wraps everything"| AL
    SL2 -->|"used by screens"| HDR2
    SL2 -->|"uses"| AMB2["AmbientBackground"]
    HDR2 --> LS
    HDR2 --> DI

    subgraph Auth["Auth Components"]
        AM["AuthModal"]
        UM["UserMenu"]
    end

    HDR2 --> UM
    UM --> AM
```

## Visualizer & Gradient Screens

```mermaid
graph TD
    VIZ["VisualizerScreen"]
    AUF["AudioUploadForm"]
    STH["SceneThumbnails"]
    VPRE["VisualPreview"]

    VIZ --> AUF
    VIZ --> STH
    VIZ --> VPRE

    GRAD["GradientGeneratorScreen"]
    GG["GradientGenerator"]
    GC2["GradientControls"]
    GP["GradientPreview"]
    GPR["GradientPresets"]
    GE["GradientExport"]

    GRAD --> GG
    GG --> GC2
    GG --> GP
    GG --> GPR
    GG --> GE
```

## Projects Screen

```mermaid
graph TD
    PROJ["ProjectsScreen"]
    PC["ProjectCard"]

    PROJ -->|"renders list of"| PC
    PC -->|"navigates to"| STUDIO["/studio?projectId=..."]
```

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx                              │
│  TooltipProvider → ErrorBoundary → AppShell → AppRouter     │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────────┐
              │            │                │
         HomeScreen    StudioScreen    Other Screens
              │            │           (Visualizer,
              │            │            Projects,
         Header +     ScreenLayout      Gradient,
         Mode Cards    ├── Header        Help, etc.)
              │        ├── [Mode Toggle]
              │        ├── Content Area
              │        │    ├── VideoProductionPanel (chat)
              │        │    ├── StoryPanel (story)
              │        │    └── MusicPanel (editor)
              │        └── Footer (ChatInput)
              │
              └── navigates to /studio or /visualizer
```

### State Management

| Store | Scope | Used By |
|---|---|---|
| `useAppStore` | Global app state, messages | StudioScreen, VideoProductionPanel |
| `useVideoEditorStore` | Video editor timeline state | VideoEditor, MultiTrackTimeline, clips |
| `useProjectSession` | Project persistence | StudioScreen → passes to panels |
| `useModalState` | Modal visibility toggles | StudioScreen → passes to VideoProductionPanel |
| `useStoryGeneration` | Story pipeline state | StoryPanel → StoryWorkspace |
