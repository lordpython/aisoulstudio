# AIsoul Studio — Future Roadmap & Specifications

> **This document captures features planned after the V1 launch.**  
> For the current V1 release scope, see [AIsoul_Studio_V1_PRD.md](AIsoul_Studio_V1_PRD.md).

---

## Document Info

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Last Updated | 2026-03-02 |
| Status | Living Document — Future Planning |

---

## 1. Introduction

This document outlines all features and enhancements intentionally deferred from the initial V1 release (YouTube narrator videos). It serves as a reference for future development phases and a living specification for upcoming capabilities.

### How to Use This Document

- This is a **planning reference**, not a commitment to specific dates
- Features are organized by theme and approximate phase
- Each section includes enough detail for development to begin when prioritized
- Update this document as plans evolve

---

## 2. Additional Formats

Beyond YouTube narrator videos, the platform will support multiple content formats with specialized templates and workflows.

### 2.1 Advertisement

**Purpose:** Commercial and promotional content

**Template Requirements:**
- `breakdown` — Content structure
- `screenplay` — Script with voiceover
- `script-generation` — Core generation
- `cta-creation` — Call-to-action optimization

**Voice Mapping:** Zephyr (bright) — punchy, memorable, brand-aligned

**UI Considerations:**
- CTA placement editor
- Brand color/style injection
- Duration targeting (15s, 30s, 60s)

### 2.2 Documentary

**Purpose:** Documentary-style narration

**Template Requirements:**
- `breakdown`
- `screenplay`
- `script-generation`
- `chapter-structure` — Chapter-based organization

**Voice Mapping:** Kore (firm) — measured, authoritative

**UI Considerations:**
- Chapter markers in timeline
- Source citation fields

### 2.3 Educational / Explainer

**Purpose:** Educational content

**Template Requirements:**
- `breakdown`
- `screenplay`
- `script-generation`
- `learning-objectives` — Objective mapping

**Voice Mapping:** Charon (informative) — plain, accessible language

**UI Considerations:**
- Quiz/question integration points
- Knowledge check markers

### 2.4 Movie-Animation

**Purpose:** Cinematic animated storytelling

**Template Requirements:**
- `breakdown`
- `screenplay`
- `script-generation`
- Full cinematographic control

**Voice Mapping:** Fenrir (excitable) — vivid voiceover narration

**UI Considerations:**
- Full Expert Mode by default
- Complex scene/shot hierarchy
- Character relationship mapping

### 2.5 Music-Video

**Purpose:** Music video visual narratives

**Template Requirements:**
- `breakdown`
- `screenplay` — Uses "Lyrics" speaker (for Suno)
- `script-generation`
- `lyrics-generation`

**Audio Strategy:**
- Suno AI music generation
- Lyrics → Suno (not TTS)
- No narration TTS for this format

**UI Considerations:**
- Beat-sync visual markers
- Lyric-to-scene alignment

### 2.6 News-Politics

**Purpose:** News and political commentary

**Template Requirements:**
- `breakdown`
- `screenplay`
- `script-generation`
- `source-citation`

**Voice Mapping:** Kore (firm) — formal, neutral, professional

**UI Considerations:**
- Source citation overlay
- Fact-check markers

### 2.7 Shorts

**Purpose:** Short-form vertical content (TikTok/Reels/Shorts)

**Template Requirements:**
- `breakdown`
- `screenplay`
- `script-generation`
- `hook-creation` — First 3 seconds optimization

**Voice Mapping:** Zephyr (bright) — fast-paced, punchy

**UI Considerations:**
- 9:16 aspect ratio default
- Hook quality scoring
- Rapid-cut editing support

### 2.8 Format Phase Coverage Summary

| Phase | Ad | Doc | Edu | Movie | Music | News | Shorts | YT |
|-------|----|-----|-----|-------|-------|------|--------|----|
| `breakdown` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `screenplay` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `script-generation` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `cta-creation` | ✓ | | | | | | | |
| `chapter-structure` | | ✓ | | | | | | |
| `learning-objectives` | | | ✓ | | | | | |
| `lyrics-generation` | | | | | ✓ | | | |
| `source-citation` | | | | | | ✓ | | |
| `hook-creation` | | | | | | | ✓ | ✓ |

---

## 3. Visualizer (Lyric Videos)

**Status:** Deferred to Phase 3

### 3.1 Overview

Audio-first workflow for creating lyric videos from uploaded songs.

### 3.2 Route

`/visualizer` — Audio-first lyric video workspace

### 3.3 Workflow

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

### 3.4 Features

**Audio Upload:**
- Formats: MP3, WAV, FLAC, M4A
- Max size: 100MB
- Max duration: 10 minutes

**Transcription:**
- Gemini audio understanding (default)
- DeAPI WhisperLargeV3 (cost-friendly option)
- Provider selector for quality vs. cost

**Lyric Segmentation:**
- Line/sentence-level timing
- Word-level karaoke timing (post-V1)
- Manual timing adjustment

**Visual Generation:**
- Generate prompts per lyric segment
- Image generation (DeAPI/Gemini)
- Optional image animation

**Playback:**
- Synchronized audio + visuals
- Current lyric highlighting
- Scene thumbnail strip

### 3.5 Data Model

```typescript
interface VisualizerProject {
  id: string;
  audioUrl: string;
  duration: number;
  bpm?: number;
  segments: LyricSegment[];
  generatedImages: string[];
  generatedVideos?: string[];
}

interface LyricSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  visualPrompt?: string;
  imageUrl?: string;
  videoUrl?: string;
}
```

---

## 4. Advanced Pipeline Features

### 4.1 Parallel Generation Stages

**Current V1:** Sequential execution  
**Future:** Parallel execution where dependencies allow

```
[Visual Generation]
         ↓
    ┌────┴────┬────────────┐
    ↓         ↓            ↓
[Narration] [Animation] [Music]
    ↓         ↓            ↓
    └────┬────┴────────────┘
         ↓
    [Assembly]
```

**Benefits:**
- Reduced total pipeline time
- Better resource utilization
- Independent stage retry

### 4.2 Automated Critique Loops

**Overview:** AI-powered quality assessment with auto-revision

**CritiqueResult Schema:**

```typescript
interface CritiqueResult {
  overallScore: number;  // 0-10
  breakdown: {
    styleFidelity: number;
    characterConsistency: number;
    pacingAccuracy: number;
    cinematicQuality: number;
  };
  revisionNeeded: boolean;
  revisionInstructions?: string;
  revisedPrompt?: string;
}
```

**Workflow:**
1. Generate visual asset
2. Run critique (Gemini vision analysis)
3. If score < 8: auto-revision with `revisedPrompt`
4. Max 1 auto-revision; manual flag if still insufficient

**UI Integration:**
- Score badges on thumbnails (green >= 8, yellow 6-7.9, red < 6)
- "Critique & Improve" button
- Optional auto-regenerate toggle

### 4.3 Master Context Injection

**Full Implementation:**
- Director's Brief generated from Idea Setup
- Character Seeds persisted and injected
- Style reference URLs maintained across all generations
- `buildMasterContext()` prepended to every prompt

---

## 5. Expert Mode (Shot-Level Control)

**Status:** Phase 2 — Post-V1

### 5.1 Overview

Progressive disclosure UI for cinematographic control. Default: AI-inferred. Expert Mode: Full manual control.

### 5.2 Shot Metadata Schema

```typescript
interface ShotMetadata {
  id: string;
  sceneNumber: number;
  shotNumber: number;
  description: string;
  dialogue?: string;
  durationEst: number;
  
  // Cinematography (Expert Mode)
  shotType: string;           // wide, medium, close-up, extreme close-up
  cameraAngle: string;        // eye-level, low-angle, high-angle, bird's-eye
  movement: string;           // static, pan, tilt, dolly, tracking, crane
  equipment?: string;         // steadicam, handheld, tripod, drone
  focalLength?: string;       // 24mm, 50mm, 85mm
  aspectRatio?: string;       // 16:9, 2.39:1, 9:16, 1:1
  
  notes?: string;
  imageUrl?: string;
  videoUrl?: string;
  narrationText?: string;
  narrationAudioUrl?: string;
  charactersInShot?: string[];
  
  // Critique integration
  critiqueScore?: number;
  critiqueHistory?: CritiqueResult[];
  
  status: "pending" | "generating" | "complete" | "failed";
}

interface CharacterSeed {
  id: string;               // CHAR-A7K9
  name: string;
  visualDescription: string;
  portraitPrompt: string;
  voiceDescription?: string;
  personality?: string;
  referenceImages?: string[];
}
```

### 5.3 UI Components

**Shot Breakdown Table:**
- Scene-grouped rows
- Columns: Scene, Shot, Description, ERT, Size, Angle, Movement, Equipment, Focal Length
- Sortable, drag-reorder

**Shot Editor Modal:**
- Image/video preview
- Per-shot navigation
- All metadata fields editable
- Save (merge updates) and Retry (regenerate)

**Storyboard Surface:**
- Per-shot timeline (not just scene)
- Shot-level duration bars
- Keyboard navigation by shot

### 5.4 Format-Specific Shot Requirements

| Format | Required Fields | Optional Fields |
|--------|----------------|-----------------|
| youtube-narrator | description, durationEst | All camera fields |
| advertisement | description, durationEst, movement | equipment, focalLength |
| documentary | All fields | notes |
| movie-animation | All fields | — |
| shorts | description, durationEst | All camera fields |
| music-video | description, durationEst, movement | equipment, focalLength |

### 5.5 Shot Prompt Builder

**Service:** `shotPromptBuilder.ts`

Combines:
- Director's Brief (style, tone, constraints)
- Shot metadata (cinematography)
- Character portrait prompts
- Style reference images

Output: Optimized prompt for DeAPI/Gemini image generation

---

## 6. Music & SFX Integration

### 6.1 Suno AI Music Generation

**Status:** Phase 3

**Use Case:** Music-video format, background tracks

**Integration Points:**
- Lyrics → Suno API
- Style selection (genre, mood, tempo)
- Duration targeting
- Multiple variant generation

**API Route:** `POST /api/suno/generate`

**Fallback:** User-uploaded audio (V1 behavior)

### 6.2 Freesound SFX Library

**Status:** Phase 3

**Use Case:** Sound effects for all formats

**Features:**
- Text search across Freesound library
- Preview in browser
- Auto-download and cache
- Cue point placement in timeline

**API Route:** `GET /api/freesound/search?q={query}`

**Fallback:** User-uploaded SFX files (V1 behavior)

---

## 7. DeAPI Model Reference

Full model mapping for when DeAPI is configured as the optional accelerator.

### 7.1 Model Capabilities

| Capability | DeAPI Model Slug(s) | Usage |
|------------|---------------------|-------|
| Text-to-Image | `ZImageTurbo_INT8`, `Flux1schnell`, `Flux_2_Klein_4B_BF16` | Visual generation |
| Image-to-Image | `Flux_2_Klein_4B_BF16`, `QwenImageEdit_Plus_NF4` | Style transfer |
| Text/Image-to-Video | `Ltxv_13B_0_9_8_Distilled_FP8` | Animation |
| Transcription | `WhisperLargeV3` | STT (Visualizer) |
| OCR | `Nanonets_Ocr_S_F16` | Text extraction |
| TTS | `Kokoro` | Cost-friendly voice |
| Embeddings | `Bge_M3_FP16` | Semantic search |
| Background Removal | `Ben2`, `RMBG-1.4` | Cleanup workflows |

### 7.2 Model Assignment by Stage

| Stage | Recommended Models |
|-------|-------------------|
| Fast image gen | `ZImageTurbo_INT8`, `Flux1schnell` |
| Quality image gen | `Flux_2_Klein_4B_BF16` |
| Style transfer | `QwenImageEdit_Plus_NF4` |
| Video animation | `Ltxv_13B_0_9_8_Distilled_FP8` |
| Cost-friendly TTS | `Kokoro` |

### 7.3 Runtime Validation

Model availability must be checked against `GET /api/v1/client/models` at startup. UI should disable unavailable models.

---

## 8. Export Infrastructure Upgrades

### 8.1 BullMQ + Redis Job Queue

**Current V1:** Firestore + node-cron  
**Future:** BullMQ + Redis for production scale

**Benefits:**
- Higher throughput
- Better job prioritization
- Delayed jobs
- Job progress events (SSE)

**Migration Path:**
1. Keep Firestore as job store (persistence)
2. Add BullMQ for queue management
3. Move FFmpeg to dedicated workers
4. Implement SSE for real-time progress

### 8.2 Dedicated Export Workers

**Architecture:**
- API server accepts export requests
- BullMQ distributes to worker pool
- Workers pull from GCS, process with FFmpeg
- Progress written to Redis → streamed via SSE

**Scaling:**
- Horizontal worker scaling based on queue depth
- CPU/RAM caps per worker
- Target wait time SLOs

### 8.3 SSE Real-Time Progress

**Endpoint:** `GET /api/export/events/:jobId` (SSE)

**Events:**
- `progress` — Percentage updates
- `stage` — Current processing stage
- `complete` — Download URL ready
- `error` — Failure with message

**Benefits over polling:**
- Lower latency updates
- Reduced server load
- Better UX

---

## 9. Phased Roadmap

### Phase 2: Additional Formats (Months 2-3)

**Goals:** Expand content capabilities

**Features:**
- Advertisement format
- Documentary format
- Shorts format
- Expert Mode (shot-level control)
- Full format template library

**Success Criteria:**
- 4+ formats fully functional
- Expert Mode toggle working
- Template validation CI passing

### Phase 3: Visualizer & Audio (Months 3-4)

**Goals:** Audio-first workflow + AI music

**Features:**
- Visualizer workflow (`/visualizer`)
- Suno music generation integration
- Freesound SFX integration
- Audio sync and beat matching

**Success Criteria:**
- End-to-end lyric video creation
- AI music generation working
- SFX library searchable

### Phase 4: Advanced Features (Months 4-6)

**Goals:** Production-scale infrastructure + AI enhancement

**Features:**
- Automated critique loops
- Parallel generation stages
- BullMQ + Redis job queue
- Dedicated export workers
- SSE real-time progress
- Advanced analytics

**Success Criteria:**
- Pipeline time reduced 50% via parallelization
- Export throughput 10x improvement
- Critique loop improving output quality

---

## 10. Appendix A: Complete Type Reference

### ShotMetadata (Expert Mode)

```typescript
interface ShotMetadata {
  id: string;
  sceneNumber: number;
  shotNumber: number;
  description: string;
  dialogue?: string;
  durationEst: number;
  shotType: string;
  cameraAngle: string;
  movement: string;
  equipment?: string;
  focalLength?: string;
  aspectRatio?: string;
  notes?: string;
  imageUrl?: string;
  videoUrl?: string;
  narrationText?: string;
  narrationAudioUrl?: string;
  charactersInShot?: string[];
  critiqueScore?: number;
  critiqueHistory?: CritiqueResult[];
  status: "pending" | "generating" | "complete" | "failed";
}
```

### CritiqueResult

```typescript
interface CritiqueResult {
  overallScore: number;
  breakdown: {
    styleFidelity: number;
    characterConsistency: number;
    pacingAccuracy: number;
    cinematicQuality: number;
  };
  revisionNeeded: boolean;
  revisionInstructions?: string;
  revisedPrompt?: string;
  createdAt: Timestamp;
}
```

### CharacterSeed

```typescript
interface CharacterSeed {
  id: string;
  name: string;
  visualDescription: string;
  portraitPrompt: string;
  voiceDescription?: string;
  personality?: string;
  referenceImages?: string[];
  createdAt: Timestamp;
}
```

### VisualizerProject

```typescript
interface VisualizerProject {
  id: string;
  userId: string;
  title: string;
  audioUrl: string;
  duration: number;
  bpm?: number;
  key?: string;
  segments: LyricSegment[];
  generatedImages: string[];
  generatedVideos?: string[];
  exportSettings?: ExportSettings;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface LyricSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  visualPrompt?: string;
  imageUrl?: string;
  videoUrl?: string;
  status: "pending" | "generating" | "complete" | "failed";
}
```

---

## 11. Appendix B: Cross-Reference to V1

### What V1 Includes

| Feature | V1 Status |
|---------|-----------|
| YouTube narrator format | ✅ Included |
| Sequential pipeline | ✅ Included |
| Gemini as primary provider | ✅ Included |
| Firestore job queue | ✅ Included |
| Scene-level control | ✅ Included |
| User-uploaded audio | ✅ Included |

### What's in This Roadmap

| Feature | Phase |
|---------|-------|
| Additional formats | Phase 2 |
| Expert Mode (shots) | Phase 2 |
| Visualizer | Phase 3 |
| Suno/Freesound | Phase 3 |
| Parallel pipeline | Phase 4 |
| Critique loops | Phase 4 |
| BullMQ/Redis | Phase 4 |
| SSE progress | Phase 4 |

---

**Back to V1:** [AIsoul_Studio_V1_PRD.md](AIsoul_Studio_V1_PRD.md)

---

*This document is a living specification. Update as plans evolve and new ideas emerge.*
