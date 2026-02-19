# 🎬 Multi-Format AI Video Production Pipeline — Implementation Specification

> **Purpose:** This document is the single source of truth for implementing the format-based content production system. It describes everything that needs to be built, why, and how each piece connects. Hand this to your AI assistant or development team and they should be able to implement the entire system.

> **Context:** We have an existing story mode pipeline (`storyTools.ts`) that handles a single flow: Story Idea → Breakdown → Screenplay → Characters → Shots → Images → Video. We are replacing this with a **format-first architecture** where the user selects a content format BEFORE writing their idea, and each format triggers a completely different AI pipeline.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Format Definitions](#2-format-definitions)
3. [Shared Infrastructure](#3-shared-infrastructure)
4. [Format 1: YouTube Storyteller Narration](#4-format-1-youtube-storyteller-narration)
5. [Format 2: Advertisement](#5-format-2-advertisement)
6. [Format 3: Movie / Animation](#6-format-3-movie--animation)
7. [Format 4: Educational Tutorial](#7-format-4-educational-tutorial)
8. [Format 5: Shorts / Reels](#8-format-5-shorts--reels)
9. [Format 6: Long-form / Documentary](#9-format-6-long-form--documentary)
10. [Format 7: Music Video](#10-format-7-music-video)
11. [Format 8: News / Events / Politics](#11-format-8-news--events--politics)
12. [Parallel Execution Engine](#12-parallel-execution-engine)
13. [Research Service](#13-research-service)
14. [Narrative Engine](#14-narrative-engine)
15. [Visual Production Service](#15-visual-production-service)
16. [Audio Production Service](#16-audio-production-service)
17. [Assembly & Export Service](#17-assembly--export-service)
18. [UI Flow & State Management](#18-ui-flow--state-management)
19. [Type Definitions](#19-type-definitions)
20. [Migration from Current Pipeline](#20-migration-from-current-pipeline)
21. [File Structure](#21-file-structure)

---

## 1. Architecture Overview

### The Core Principle

**Format determines pipeline.** The user's first decision is not "what's your story?" — it's "what kind of content are you making?" This single choice determines:

- Which AI pipeline runs
- How many parallel calls fire
- What kind of script is generated (screenplay vs narration vs micro-script vs lyrics)
- What visual style is produced
- What audio approach is used
- How long the output is
- What the user approval checkpoints look like

### High-Level Flow

```
User selects FORMAT (8 options)
    ↓
User selects GENRE (per-format genre options)
    ↓
User writes IDEA (text input)
    ↓
User clicks "Begin"
    ↓
FORMAT ROUTER dispatches to the correct pipeline
    ↓
Pipeline runs (format-specific phases, some parallel, some sequential)
    ↓
User reviews/approves at checkpoints
    ↓
Final assembly → export
```

### What Changes from the Current System

| Current System | New System |
|---|---|
| Genre is selected first (Drama, Thriller, etc.) | **Format** is selected first, genre becomes a sub-parameter |
| Single pipeline for all content | **8 distinct pipelines**, one per format |
| Sequential execution (scene by scene) | **Parallel execution engine** with concurrency control |
| Screenplay-only script format | Multiple script formats (narration, screenplay, micro-script, lyrics, news script) |
| 3-step visible UI (Story Idea → Breakdown → Storyboard) | Format-specific step sequences with different checkpoint counts |
| `storyTools.ts` handles everything | **Format router** dispatches to format-specific tool sets |
| `storyModeStore` single state shape | **Format-aware state** with per-format data shapes |
| No research phase | **Research service** with parallel web/knowledge queries |

---

## 2. Format Definitions

### Format Registry

Create a central format registry that defines all 8 formats. This is the single source of truth for what formats exist and what they need.

```
FormatID: "youtube_narrator" | "advertisement" | "movie_animation" | "educational" | "shorts" | "documentary" | "music" | "news_politics"
```

Each format entry must define:

- `id` — unique string identifier
- `label` / `labelAr` — display names (English + Arabic)
- `description` / `descriptionAr` — what this format produces
- `icon` — emoji or icon reference
- `color` — brand color for UI theming
- `duration` — typical output duration range (e.g., "8-25 min")
- `genres` — available genre sub-options for this format (not all formats use the same genres)
- `phases` — ordered list of pipeline phases with metadata
- `scriptType` — what kind of script this format generates
- `visualStyle` — default visual approach
- `audioStyle` — default audio approach
- `aspectRatio` — output aspect ratio ("16:9" | "9:16" | "1:1")
- `maxParallelCalls` — concurrency limit for this format's parallel phases
- `approvalCheckpoints` — which phases require user approval before proceeding

### Genre Sub-Options Per Format

Not all genres apply to all formats. Define per-format genre lists:

| Format | Available Genres |
|---|---|
| YouTube Narrator | Drama, Thriller, Mystery, Horror, True Crime, History, Science, Culture, Conspiracy, Comedy |
| Advertisement | Product, Service, Brand Awareness, Event, App, Food, Fashion, Tech, Automotive |
| Movie/Animation | Drama, Comedy, Thriller, Sci-Fi, Mystery, Action, Horror, Fantasy, Romance, Historical, Animation |
| Educational | Tech, Science, Math, Language, Business, Health, Art, Cooking, DIY, Finance |
| Shorts | Fact, Story, Tutorial, Comedy, Reaction, Trend, Motivation, Challenge |
| Documentary | History, Science, Crime, Nature, Social, Political, Biography, Technology, Culture |
| Music | Pop, Hip-Hop, R&B, Arabic Traditional, Khaleeji, Nasheed, Electronic, Rock, Jazz, Ambient |
| News/Politics | Breaking News, Analysis, Opinion, Investigative, Event Coverage, Interview, Explainer |

---

## 3. Shared Infrastructure

### 3.1 Parallel Execution Engine

This is the most critical new piece of infrastructure. Every format uses it.

**Purpose:** Execute multiple AI calls concurrently with controlled concurrency, progress tracking, error handling, and result aggregation.

**Requirements:**

- Accept an array of async tasks
- Limit concurrency (configurable per format, default 3-4 simultaneous calls)
- Track progress (emit events: `{completed: 3, total: 8, currentPhase: "research"}`)
- Handle partial failures gracefully (use `Promise.allSettled`, not `Promise.all`)
- Return results in original order regardless of completion order
- Support cancellation (user clicks "Stop" during generation)
- Rate limit awareness — if Gemini returns 429, back off and retry with exponential delay
- Logging — every parallel call logs its start, duration, success/failure, and token count

**Interface:**

```
parallelExecute<T>(
  tasks: Array<() => Promise<T>>,
  options: {
    maxConcurrency: number,       // default 3
    onProgress: (progress: ParallelProgress) => void,
    sessionId: string,
    phaseName: string,
    retryOnRateLimit: boolean,    // default true
    maxRetries: number,           // default 2
    signal?: AbortSignal,         // for cancellation
  }
): Promise<Array<ParallelResult<T>>>
```

Where `ParallelResult<T>` is `{ status: "fulfilled", value: T, duration: number } | { status: "rejected", reason: string, duration: number }`.

### 3.2 Format Router

**Purpose:** Takes a format ID and dispatches to the correct pipeline.

**How it works:**

1. User selects format + genre + writes idea → these three values arrive at the router
2. Router looks up the format in the registry
3. Router instantiates the correct pipeline class/function set
4. Router manages the state transitions between phases
5. Router emits UI events for progress display

**The router replaces the current approach** where `generateBreakdownTool`, `createScreenplayTool`, etc. are called directly. Instead, the router orchestrates which tools run in what order.

```
formatRouter(
  formatId: FormatID,
  genre: string,
  topic: string,
  language: "ar" | "en",  // auto-detected from topic
  sessionId: string
): Pipeline
```

### 3.3 Language Detection

Already exists in the current codebase (`/[\u0600-\u06FF]/.test(topic)`). Extract this into a shared utility:

```
detectLanguage(text: string): "ar" | "en"
```

Used by every format to determine:
- Which prompts to use (Arabic or English)
- Which narration style to apply (عامية vs formal English)
- RTL/LTR rendering in UI
- Voice selection for TTS

### 3.4 Session State

Extend the current `storyModeStore` to be format-aware. Every session stores:

```
{
  id: string,
  formatId: FormatID,
  genre: string,
  topic: string,
  language: "ar" | "en",
  currentPhase: string,           // current pipeline phase name
  phases: Record<string, PhaseState>,  // each phase's data
  createdAt: number,
  updatedAt: number,
  status: "active" | "paused" | "completed" | "failed"
}
```

Where `PhaseState` contains the output of each phase (research results, script text, visual URLs, etc.) specific to the format.

---

## 4. Format 1: YouTube Storyteller Narration

### What It Produces

A long-form YouTube video (8-25 minutes) with a single narrator telling a story in conversational Arabic (or English), supported by B-roll visuals, text overlays, sound effects, and background music. Think: Abu Al-Sadiq style, Lemmino, JCS Criminal Psychology, Qissas channels.

### Pipeline Phases

#### Phase 1: Research Fan-out (PARALLEL)

**This phase does not exist in the current pipeline. It must be built new.**

**Purpose:** Transform a one-liner idea into a rich research context document with enough factual detail to power a 2000-3000 word narration script.

**How it works:**

1. Take the user's one-liner (e.g., "الشرطة اليابانية استخدموا 130 الف ضابط...")
2. Generate 5-8 research queries from the one-liner using an LLM call
3. Execute all queries in parallel using the parallel execution engine
4. Each query can be: a Gemini knowledge query, a web search, or a document retrieval from user-uploaded reference material
5. Aggregate all results into a single Research Context Document (structured text, not raw dumps)

**Research query generation prompt:**

```
Given this story idea: "{topic}"
Generate 5-8 specific research queries that would provide the factual backbone for a detailed YouTube narration. Include:
- Main event/topic query
- Key people/characters involved
- Timeline of events
- Statistics and numbers
- Theories or controversies
- Cultural/historical context
- Aftermath or current status
- Related lesser-known facts

Return as JSON array of query strings.
```

**Research Context Document structure:**

```
{
  topic: string,
  mainEvent: string,          // 2-3 paragraph summary of the core story
  characters: Array<{         // real people/entities involved
    name: string,
    role: string,
    keyFacts: string[]
  }>,
  timeline: Array<{           // chronological events
    date: string,
    event: string
  }>,
  statistics: Array<{         // numbers that make the story compelling
    stat: string,
    source: string
  }>,
  theories: Array<{           // competing theories/perspectives
    name: string,
    description: string,
    evidence: string
  }>,
  culturalContext: string,    // background the audience needs
  aftermath: string,          // what happened after / current status
  unusualFacts: string[],     // surprising details that hook viewers
  sourceUrls: string[]        // for attribution
}
```

**If the user uploaded a reference document** (like the القضية 114 text), it should be detected and fed directly into the Research Context Document, reducing the need for external queries. The system should check `/mnt/user-data/uploads` or the session for attached documents and prioritize them as primary sources.

**Approval checkpoint:** Show the user the Research Context Document in a readable format. Let them add/remove facts, correct errors, or upload additional reference material before proceeding.

#### Phase 2: Narrative Arc Structure

**Purpose:** Create the storytelling skeleton — not screenplay acts, but YouTube narrative beats.

**Prompt approach:** Send the Research Context Document to Gemini with instructions to create a YouTube narrative structure:

**Structure template for YouTube narration:**

```
1. THE HOOK (first 15-30 seconds)
   - Start mid-action or with the most shocking fact
   - No intro, no "welcome to my channel" — that comes AFTER the hook
   - Must create a question in the viewer's mind

2. CHANNEL INTRO (5-10 seconds)
   - Brief: "أنا [Name] وبحكي عن كل شيء غريب..."
   - Immediately return to the story

3. CONTEXT BUILDING (1-3 minutes)
   - Background the audience needs to understand why this matters
   - Set the scene: time, place, cultural context
   - Introduce the main characters/entities

4. ESCALATION BEATS (main body, multiple beats)
   - Each beat reveals new information that raises stakes
   - Use mini-cliffhangers between beats: "واحزروا شو صار..."
   - Interweave facts with storytelling ("الرقم اللي بيخوف... 130 ألف ضابط")
   - Include audience-directed asides ("وهون الموضوع بيصير مجنون...")

5. THE CLIMAX
   - The peak moment — biggest revelation, most shocking fact
   - Should be positioned at 70-85% through the video, not at the end

6. THEORIES / OPEN QUESTIONS
   - Present competing theories if applicable
   - Let the viewer decide: "وانتم قرروا مين هو المجرم"

7. OUTRO
   - Brief, no rambling
   - Call to action: like, subscribe, comment with their theory
   - Tease the next video if applicable
```

**Output:** An ordered list of narrative beats with:
- Beat type (hook/intro/context/escalation/climax/theories/outro)
- Summary of what this beat covers
- Key facts/details to include from the Research Context Document
- Estimated duration of this beat
- Emotional target (curiosity, tension, shock, resolution, etc.)

**Approval checkpoint:** Show the narrative arc to the user. Let them reorder beats, add/remove beats, adjust emphasis.

#### Phase 3: Full Narration Script

**Purpose:** Generate the complete spoken narration text (2000-3000 words) that the narrator will read/perform.

**This is NOT a screenplay.** It is a continuous narration script written as if someone is talking to camera or voicing over B-roll. The key differences from a screenplay:

| Screenplay (current) | Narration Script (new) |
|---|---|
| Scene headings, action lines, dialogue | Continuous flowing text |
| Third person, describes camera | First/second person, addresses viewer |
| Formal cinematic language | Conversational عامية or casual English |
| Characters speak dialogue | Narrator quotes characters within narration |
| Visual descriptions for image gen | Visual cues embedded as `[B-ROLL: description]` markers |

**Script generation prompt (Arabic):**

```
أنت راوي قصص محترف على يوتيوب. اكتب سكريبت سردي كامل بناءً على الهيكل السردي والمعلومات التالية.

[Narrative Arc from Phase 2]
[Research Context Document from Phase 1]

قواعد الكتابة:
- اكتب بالعامية العربية المبسطة (مفهومة للجميع)
- خاطب المشاهد مباشرة: "تخيل معي..."، "واللي بيشوفني لأول مرة..."
- ابدأ بالحدث المثير مباشرة — لا مقدمات
- استخدم التشويق: "واحزروا..."، "والمفاجأة..."، "والأغرب من هيك..."
- ادمج الأرقام والحقائق بشكل طبيعي داخل السرد
- لا تكتب بأسلوب أكاديمي أو إخباري — اكتب كأنك تحكي لصاحبك
- ضع علامات للمقاطع البصرية: [B-ROLL: وصف المشهد المطلوب]
- ضع علامات لتوقيت الإلقاء: [pause], [emphasis], [whisper], [rising-tension], [slow]
- الطول: 2000-3000 كلمة
- لا تستخدم أي markdown
```

**Script markers to embed:**

```
[B-ROLL: description of visual to show during this segment]
[TEXT-OVERLAY: text to display on screen]
[SOUND-EFFECT: description of sound to play]
[MUSIC-SHIFT: mood change instruction, e.g., "tension building" or "somber"]
[pause: beat] — dramatic pause
[emphasis]text[/emphasis] — stress this word/phrase
[whisper]text[/whisper] — lower voice
[rising-tension]text[/rising-tension] — build intensity
[slow]text[/slow] — slow down delivery
```

**Approval checkpoint:** Full script review. User can edit text, adjust markers, add/remove B-roll cues.

#### Phase 4: Visual Segment Extraction (PARALLEL)

**Purpose:** Parse the approved script, extract all `[B-ROLL]` markers, and generate visual content for each segment in parallel.

**How it works:**

1. Parse script for `[B-ROLL: ...]` markers
2. Also segment the script into logical chunks (every 30-60 seconds of narration ≈ 100-150 words)
3. For each segment, generate in parallel:
   - An image prompt for the B-roll visual
   - A motion prompt (camera movement + subject physics) for video generation
   - Text overlay graphics if `[TEXT-OVERLAY]` markers exist
4. Generate all images in parallel
5. Generate video clips from images in parallel

**Visual style per genre:**

The genre selected by the user affects the visual treatment:

- **True Crime:** Dark, desaturated, surveillance-style, grain overlay, red accents
- **History:** Sepia tones, archival style, old paper textures, maps
- **Mystery:** High contrast, shadow-heavy, moody blues and greens
- **Comedy:** Bright, saturated, playful compositions, exaggerated expressions
- **Horror:** Extreme contrast, darkness, unsettling angles, cold colors
- **Science:** Clean, bright, diagram-style, data visualization aesthetic

**No approval checkpoint here** — visuals generate after script approval and the user sees them in the final assembly review.

#### Phase 5: Voiceover Generation

**Purpose:** Convert the narration script (minus markers) into spoken audio using TTS.

**Requirements:**

- Strip all markers (`[B-ROLL]`, `[TEXT-OVERLAY]`, etc.) from the script before TTS
- Use delivery markers to control TTS:
  - `[pause: beat]` → insert 0.5-1s silence
  - `[emphasis]` → increase volume/speed slightly
  - `[whisper]` → reduce volume, add breathiness
  - `[slow]` → reduce speech rate
- Language detection determines voice selection
- Arabic: male or female voice with natural Arabic pronunciation
- English: appropriate voice for the genre/tone

**Output:** Audio file (WAV or FLAC) with timestamps for each segment, enabling sync with visuals.

#### Phase 6: Assembly

**Purpose:** Combine voiceover + visuals + text overlays + music + sound effects into final video.

**Assembly rules:**

- B-roll visuals play under the narration, changing at segment boundaries
- Text overlays appear when markers indicate
- Background music plays throughout, shifting mood at `[MUSIC-SHIFT]` markers
- Sound effects trigger at `[SOUND-EFFECT]` markers
- Transitions between visual segments: simple crossfade (0.3-0.5s), no flashy effects
- Output aspect ratio: 16:9 for YouTube
- Output resolution: 1920x1080 minimum

**Approval checkpoint:** Final video review before export.

---

## 5. Format 2: Advertisement

### What It Produces

A short, high-impact advertisement video (15-60 seconds) with a clear call-to-action. Fast-paced, benefit-driven, product-focused.

### Pipeline Phases

#### Phase 1: Brand Brief Extraction

**Purpose:** Extract structured advertising parameters from the user's freeform input.

The user might write something like: "إعلان لتطبيق توصيل طعام سريع بالكويت" — the system needs to extract:

```
{
  product: "food delivery app",
  market: "Kuwait",
  targetAudience: "young professionals, families",
  usp: "speed of delivery",
  tone: "energetic, modern",
  cta: "download the app",
  duration: "30 seconds"
}
```

**Prompt:** Send the user's input to Gemini with instructions to extract these fields. If information is missing, use reasonable defaults and flag them for user review.

**Approval checkpoint:** User confirms/edits the brand brief.

#### Phase 2: Hook Variants (PARALLEL)

**Purpose:** Generate 3-5 different opening hooks for A/B testing.

Each hook is the first 2-5 seconds of the ad. Types of hooks to generate:

1. **Problem hook:** "هل صار لك تطلب أكل ويتأخر عليك ساعة؟"
2. **Benefit hook:** "أكلك يوصلك بـ 15 دقيقة. مضمون."
3. **Shock/stat hook:** "85% من الناس يلغون الطلب إذا تأخر أكثر من 30 دقيقة"
4. **Visual hook:** No text — just a stunning product hero shot
5. **Story hook:** Mini 3-second story: "أحمد طلب أكل الساعة 2... الساعة 2:12 كان ياكل"

Generate all 5 in parallel. User picks 1-3 to produce.

**Approval checkpoint:** User selects which hooks to produce.

#### Phase 3: Ad Script Generation

**Purpose:** Write the complete ad script (50-150 words) following the advertising formula:

```
HOOK (selected from Phase 2) → 2-5 seconds
PROBLEM → 3-5 seconds
SOLUTION (product) → 5-10 seconds  
PROOF (testimonial/stat/demo) → 3-5 seconds
CTA → 3-5 seconds
```

Include visual direction for each segment.

#### Phase 4: Visual Shots (PARALLEL)

Generate all visual frames in parallel:
- Product hero shots
- Lifestyle/usage imagery
- Text overlay frames with key messages
- CTA card with download/buy button design
- Brand logo sting

#### Phase 5: Assembly

Fast-cut editing (0.5-2s per cut), high-energy music, bold text overlays, logo sting at the end.

---

## 6. Format 3: Movie / Animation

### What It Produces

This is the **current pipeline**, preserved and enhanced. Cinematic screenplay with characters, shot breakdowns, visual consistency, and full video assembly.

### Pipeline Phases

**This is largely what `storyTools.ts` already does**, with these enhancements:

1. **Story Breakdown** — existing `generateBreakdownTool` (unchanged)
2. **Screenplay** — existing `createScreenplayTool` (unchanged)
3. **Characters** — existing `generateCharactersTool` (enhanced: parallel reference image generation)
4. **Shot Breakdown** — existing `generateShotlistTool` (enhanced: parallel per-scene, not sequential)
5. **Motion Prompts** — split camera_motion + subject_physics (enhanced: parallel per-shot)
6. **Voiceover Scripts** — delivery markers (unchanged)
7. **Image Generation** — with persona negatives (enhanced: parallel per-shot)
8. **Video + Audio Assembly** — (unchanged)

### Key Enhancement: Parallelize Steps 4-7

The current pipeline processes scenes sequentially. Modify `breakAllScenesIntoShots()` to use the parallel execution engine:

```
// CURRENT (sequential):
for (const scene of scenes) {
  const shots = await breakSceneIntoShots(scene);
}

// NEW (parallel):
const allShots = await parallelExecute(
  scenes.map(scene => () => breakSceneIntoShots(scene)),
  { maxConcurrency: 3, sessionId, phaseName: "shotlist" }
);
```

Similarly, motion prompts and voiceover scripts for all shots should generate in parallel after the shot breakdown completes.

### Genre Threading Fix

Currently in `generateShotlistTool`, genre is hardcoded:

```typescript
const genre = 'Drama'; // Default genre; ideally passed from session state
```

Fix: The genre must be stored in the session state when the user selects it, and passed through to the shotlist generation, persona negatives, and visual style.

---

## 7. Format 4: Educational Tutorial

### What It Produces

A structured educational video (5-20 min) with clear learning objectives, step-by-step demonstrations, visual aids, and knowledge checks.

### Pipeline Phases

#### Phase 1: Knowledge Mapping (PARALLEL)

Parallel research queries to establish:
- Topic scope and boundaries
- Prerequisites the audience needs
- Key concepts to teach (ordered by complexity)
- Common misconceptions to address
- Practical examples and exercises

#### Phase 2: Lesson Structure

Apply instructional design principles:

```
1. LEARNING OBJECTIVE — "By the end of this video, you'll be able to..."
2. HOOK — Why should the viewer care? Real-world application.
3. PREREQUISITES — Brief check: "You should already know X and Y"
4. TEACH (repeat per concept):
   a. EXPLAIN — introduce the concept clearly
   b. DEMONSTRATE — show it in action (screen recording, diagram, example)
   c. PRACTICE — viewer exercise or quiz question
5. SUMMARY — recap all key points
6. NEXT STEPS — what to learn next, resources
```

#### Phase 3: Script + Visual Aid Planning

Script is written in a clear, approachable teaching voice. Not academic, not overly casual.

For each concept, generate:
- Explanation text
- `[DIAGRAM: description]` markers for visual aids
- `[DEMO: description]` markers for screen recordings/demonstrations
- `[QUIZ: question | option A | option B | correct answer]` markers

#### Phase 4: Visual Aid Generation (PARALLEL)

Generate all visual aids in parallel:
- Diagrams and flowcharts (generated as images or SVGs)
- Code snippets with syntax highlighting (if tech tutorial)
- Before/after comparisons
- Annotated screenshots
- Step-by-step numbered graphics

#### Phase 5: Quiz/Recap Generation

Generate end-of-video recap cards and quiz questions.

#### Phase 6: Assembly

Screen-recording style with picture-in-picture narrator, visual aids appearing on cue, clean transitions, subtle background music.

---

## 8. Format 5: Shorts / Reels

### What It Produces

A vertical video (9:16), 15-60 seconds, optimized for scroll-stopping on YouTube Shorts, TikTok, Instagram Reels.

### Pipeline Phases

#### Phase 1: Hook Generation (PARALLEL)

Generate 3 hook variants — the first 1-2 seconds that stop the scroll:

Types:
- **Text hook:** Bold text on screen with shocking statement
- **Visual hook:** Striking image that creates curiosity
- **Voice hook:** Opening line that demands attention

All 3 generated in parallel. User picks one.

#### Phase 2: Micro-Script

The entire script is 30-100 words. No filler. Every word earns its place.

Structure:
```
HOOK (0-2 seconds) → immediate value or shock
CONTENT (2-45 seconds) → deliver the payload, fast cuts
PAYOFF (last 5-10 seconds) → satisfying conclusion or cliffhanger
CTA (last 2-3 seconds) → "Follow for Part 2" or "Comment your answer"
```

#### Phase 3: Vertical Shots (PARALLEL)

All visuals generated at 9:16 aspect ratio (1080x1920).

Requirements:
- Face-centered compositions (for talking-head style)
- Bold text overlays (readable on mobile)
- High contrast, saturated colors (compete with other content in feed)
- Fast cuts: each shot is 0.5-2 seconds max

#### Phase 4: Assembly

Rapid-fire editing, trending audio/music bed, always-on captions (burned in), vertical format, no intro/outro.

---

## 9. Format 6: Long-form / Documentary

### What It Produces

A deeply researched documentary-style video (15-60 min) with authoritative narration, data visualization, interview-style segments, and chapter structure.

### Pipeline Phases

#### Phase 1: Deep Research (HEAVY PARALLEL)

This is the most research-intensive format. Fire 8-15 parallel queries:

- Primary source search (original documents, reports, official statements)
- Statistical data gathering (numbers, percentages, comparisons)
- Timeline construction (detailed chronological events)
- Expert perspectives (published opinions, analysis)
- Counter-arguments and opposing views
- Historical context
- Human interest stories within the topic
- Current status / aftermath
- Related events or patterns
- Geographic/map data if applicable

**Research depth:** Each query result should be validated against multiple sources. Contradictory information should be flagged, not silently discarded.

**Output:** A comprehensive Research Dossier — significantly more detailed than the YouTube Narrator research context. This dossier includes source attribution for every fact.

**Approval checkpoint:** User reviews the Research Dossier, adds sources, corrects facts, adjusts scope.

#### Phase 2: Documentary Arc

Structure the content into chapters:

```
COLD OPEN — most compelling moment, no context
CHAPTER 1: THE BEGINNING — chronological start
CHAPTER 2: ESCALATION — stakes rise
CHAPTER 3: THE TURNING POINT — key event or revelation
CHAPTER 4: CONSEQUENCES — impact and aftermath
CHAPTER 5: ANALYSIS — expert perspectives, theories
CHAPTER 6: WHERE ARE THEY NOW — current status
EPILOGUE — lessons, open questions
```

Each chapter has:
- Estimated duration
- Key facts to cover
- Data points to visualize
- Interview segments to include
- B-roll requirements

#### Phase 3: Narration Script

Written in an authoritative, documentary voice — more formal than YouTube Narrator, but still engaging. Not dry academic tone.

Script markers include:
```
[DATA-VIZ: chart/graph description]
[MAP: geographic visualization description]
[TIMELINE: timeline graphic description]
[ARCHIVE: archival footage/image description]
[INTERVIEW: expert name, quote or paraphrase]
[LOWER-THIRD: name | title]
[CHAPTER-CARD: "Chapter 2: The Escalation"]
```

#### Phase 4: Data Visualization Generation (PARALLEL)

For every `[DATA-VIZ]`, `[MAP]`, `[TIMELINE]` marker, generate:
- Chart/graph images
- Animated data reveals
- Map overlays with highlighted regions
- Stat cards with large numbers

All generated in parallel.

#### Phase 5: B-Roll + Scene Generation (PARALLEL)

For every `[ARCHIVE]` and B-roll requirement:
- Generate atmospheric visuals matching the documentary tone
- Create location-establishing shots
- Generate re-enactment style imagery (if applicable)

#### Phase 6: Interview Segment Generation (PARALLEL)

For every `[INTERVIEW]` marker:
- Generate an AI "expert commentary" audio clip
- Create a lower-third graphic with the expert's name and title
- This is AI-synthesized commentary, not real interviews — make this clear in the UI

#### Phase 7: Assembly

Chapter-based structure with:
- Chapter title cards between sections
- Lower thirds for interview segments
- Data visualization animations
- Smooth transitions (crossfade, not flashy)
- Orchestral or ambient background music
- Professional narrator voiceover

---

## 10. Format 7: Music Video

### What It Produces

A music video (2-5 min) with AI-generated lyrics, music, and beat-synced visuals.

### Pipeline Phases

#### Phase 1: Mood + Genre Extraction

From the user's input, extract:
- Musical genre/style
- Emotional tone
- Tempo (BPM range)
- Language
- Cultural context (Arabic poetry style? Western pop? Khaleeji?)
- Theme/subject matter

#### Phase 2: Lyrics Generation (PARALLEL — variants)

Generate 2-3 lyric variants in parallel, each with:
- Verse/Chorus/Bridge structure
- Rhyme scheme appropriate to the genre
- Syllable count per line (for singability)
- If Arabic: proper prosody and metric patterns (بحور الشعر if applicable)

User selects their preferred lyrics.

#### Phase 3: Visual Mood Board (PARALLEL)

For each section of the song (verse 1, chorus, verse 2, bridge, final chorus), generate:
- Color palette
- Visual mood/aesthetic
- Scene concepts and metaphors
- Lighting style

All sections generated in parallel.

#### Phase 4: Scene Generation (PARALLEL)

Generate images for each lyrical section, synced to themes:
- Each verse gets distinct visual treatment
- Chorus gets a recurring visual motif
- Bridge gets a visual "break" (different setting/mood)

#### Phase 5: Audio Generation

Generate:
- Melody/instrumental track
- Vocal synthesis (match to lyrics and melody)
- Mixing and mastering

#### Phase 6: Beat-Sync Assembly

This is unique to music video format:
- Visual cuts sync to musical beats
- Transitions happen on downbeats
- Lyrics overlay with beat-matched timing
- Visual intensity follows musical dynamics (verse = calmer, chorus = more dynamic)

---

## 11. Format 8: News / Events / Politics

### What It Produces

A news-style report (3-15 min) with factual reporting, data graphics, balanced perspectives, and professional presentation.

### Pipeline Phases

#### Phase 1: Live Research (PARALLEL + WEB SEARCH)

**Critical requirement:** This format MUST use real-time web search, not just Gemini's training data.

Parallel queries:
- Web search for the topic (latest articles, reports)
- Official statements and press releases
- Multiple news source perspectives (aim for 3+ sources)
- Statistical data relevant to the story
- Expert opinions and analysis
- Counter-perspectives and criticism
- Historical context and precedent

**Fact-checking:** Every claim must be attributed to a source. Unverified claims must be marked as such.

#### Phase 2: Angle + Balance Check

**Purpose:** Ensure the report is balanced and not one-sided.

The system must:
1. Identify all stakeholder perspectives
2. Ensure each major perspective is represented
3. Flag if the script leans too heavily in one direction
4. Separate facts from analysis/opinion
5. Mark opinion sections clearly

#### Phase 3: News Script

Written in professional news anchor style:

```
LEAD — Most important facts first (who, what, when, where)
CONTEXT — Background needed to understand the story
PERSPECTIVE 1 — First stakeholder's view, with attribution
PERSPECTIVE 2 — Counter-view, with attribution
DATA — Statistics and evidence
ANALYSIS — Expert commentary (clearly marked as analysis)
WHAT'S NEXT — Expected developments, upcoming events
SIGN-OFF — Brief conclusion
```

Script markers:
```
[GRAPHIC: stat card or data visualization description]
[MAP: geographic context]
[QUOTE-CARD: "Quote text" — Attribution]
[LOWER-THIRD: Reporter Name | Title]
[TICKER: scrolling text for key facts]
[SPLIT-SCREEN: description of side-by-side comparison]
```

#### Phase 4: Graphics Generation (PARALLEL)

Generate:
- Stat cards with large numbers
- Quote cards with attribution
- Maps with highlighted regions
- Timeline graphics
- Comparison charts

#### Phase 5: Presentation Generation

Generate a news anchor avatar or voiceover with:
- Professional, authoritative tone
- Neutral delivery (no emotional bias)
- Clear pronunciation
- Appropriate pacing (slower for important facts, no rushing)

#### Phase 6: Assembly

Clean, professional news production:
- Lower thirds throughout
- News ticker for key facts
- Split-screen for comparisons
- Clean transitions (cuts, not fancy effects)
- News-style music bed (subtle, not distracting)

---

## 12. Parallel Execution Engine

### Implementation Details

Create a new file: `parallelExecutionEngine.ts`

**Core function:**

```
async function parallelExecute<T>(
  tasks: Array<() => Promise<T>>,
  options: ParallelOptions
): Promise<ParallelResult<T>[]>
```

**Concurrency control:** Use a semaphore pattern. Maintain a pool of N concurrent slots. As one task completes, the next in queue starts.

**Rate limit handling:** If a task fails with a 429 status (Gemini rate limit), pause ALL tasks for the backoff period, then resume. Don't just retry the failed task — the rate limit applies globally.

**Progress reporting:** After each task completes (success or failure), call `onProgress` with:
```
{
  completed: number,    // tasks finished so far
  total: number,        // total tasks
  failed: number,       // tasks that failed
  currentlyRunning: number, // active concurrent tasks
  phaseName: string,
  estimatedTimeRemaining: number // in seconds, based on average task duration
}
```

**Cancellation:** Accept an `AbortSignal`. When aborted, stop starting new tasks, but let currently running tasks complete. Return partial results for completed tasks.

**Logging:** Every task logs:
- Start time
- End time
- Duration in ms
- Success/failure
- If Gemini call: model used, prompt token count, response token count
- Session ID and phase name for traceability

### Concurrency Limits Per Format

| Format | Max Concurrent Calls | Reason |
|---|---|---|
| YouTube Narrator | 4 | Research phase needs breadth, moderate concurrency |
| Advertisement | 5 | Hook variants are fast, can handle more |
| Movie/Animation | 3 | Shot generation is heavy, limit to avoid rate limits |
| Educational | 4 | Visual aid generation is image-heavy |
| Shorts | 5 | Few total calls, can be aggressive |
| Documentary | 3 | Many calls total, keep steady throughput |
| Music | 4 | Moderate load |
| News | 5 | Research needs to be fast for timely content |

---

## 13. Research Service

### Create: `researchService.ts`

This is a new service that does not exist in the current codebase.

**Purpose:** Take a topic string, generate research queries, execute them in parallel, and return a structured Research Context Document.

**Functions:**

```
generateResearchQueries(topic: string, format: FormatID, language: "ar" | "en"): Promise<string[]>
```

Generate format-appropriate research queries. A YouTube Narrator needs different research than a News report or a Documentary.

```
executeResearchQuery(query: string, method: "gemini" | "web_search" | "document"): Promise<ResearchResult>
```

Execute a single research query using the appropriate method.

```
buildResearchContext(results: ResearchResult[], format: FormatID): Promise<ResearchContextDocument>
```

Aggregate raw results into a structured document. De-duplicate information, resolve contradictions, organize chronologically.

```
enrichFromUserDocuments(context: ResearchContextDocument, uploads: string[]): Promise<ResearchContextDocument>
```

Check if the user uploaded reference documents. If so, extract relevant information and merge into the research context. This handles the case where the user uploads a document like the القضية 114 reference — the system should recognize it as a primary source and prioritize it over web search results.

**Query generation varies by format:**

| Format | Research Focus |
|---|---|
| YouTube Narrator | Dramatic story beats, shocking facts, character details, audience hooks |
| Advertisement | Product/market data, competitor analysis, audience pain points |
| Educational | Concept breakdowns, examples, common mistakes, exercises |
| Documentary | Primary sources, statistics, expert opinions, counter-arguments, archival |
| News | Latest developments, official statements, multiple perspectives, fact-checking |

---

## 14. Narrative Engine

### Create: `narrativeEngine.ts`

This replaces the one-size-fits-all approach of `createScreenplayTool`.

**Purpose:** Generate the script/narration for any format, using the correct writing style, structure, and markers.

**Core function:**

```
generateScript(
  format: FormatID,
  genre: string,
  language: "ar" | "en",
  researchContext: ResearchContextDocument,  // or null for formats that don't research
  narrativeArc: NarrativeArc,               // structured beats from arc generation
  sessionId: string
): Promise<FormatScript>
```

Where `FormatScript` is a union type — each format has its own script shape:

```
type FormatScript =
  | YouTubeNarrationScript    // continuous narration with B-ROLL markers
  | AdvertisementScript       // hook + problem + solution + proof + CTA
  | ScreenplayScript          // existing: scenes with headings, action, dialogue
  | EducationalScript         // lessons with DIAGRAM and DEMO markers
  | ShortsScript              // micro-script with hook + content + payoff
  | DocumentaryScript         // chapters with DATA-VIZ and INTERVIEW markers
  | MusicLyricsScript         // verse/chorus/bridge with rhythm annotations
  | NewsScript                // lead + context + perspectives + analysis
```

**Each format has its own prompt template** stored in a prompts directory. The narrative engine selects the correct prompt based on format + language.

**Prompt templates directory:**

```
prompts/
  youtube_narrator/
    research_queries.ar.txt
    research_queries.en.txt
    narrative_arc.ar.txt
    narrative_arc.en.txt
    full_script.ar.txt
    full_script.en.txt
  advertisement/
    brand_brief.ar.txt
    brand_brief.en.txt
    hooks.ar.txt
    hooks.en.txt
    ad_script.ar.txt
    ad_script.en.txt
  ... (one folder per format)
```

---

## 15. Visual Production Service

### Enhance: existing visual generation + new capabilities

**Purpose:** Handle all visual content generation across all formats.

**New capabilities needed:**

1. **Aspect ratio support:** Currently only generates landscape (16:9). Must support:
   - 16:9 for YouTube, Documentary, Movie, Educational, News, Music
   - 9:16 for Shorts
   - 1:1 for some Ads (platform-dependent)

2. **Text overlay generation:** Many formats need text burned into visuals. Generate text overlay images with:
   - Bold, readable fonts
   - Arabic text support (RTL, proper shaping)
   - Genre-appropriate styling (news ticker style, YouTube text style, etc.)

3. **Data visualization generation:** Documentary and News formats need:
   - Stat cards (large number + label + source)
   - Simple bar/line charts
   - Timeline graphics
   - Map highlights
   - Quote cards (text + attribution)

4. **Visual style per format:**

| Format | Default Visual Style |
|---|---|
| YouTube Narrator | Atmospheric B-roll, dramatic lighting, text overlays |
| Advertisement | Product hero shots, lifestyle imagery, bold graphics |
| Movie/Animation | Consistent character designs, cinematic lighting |
| Educational | Clean diagrams, annotated screenshots, split-screen |
| Shorts | Vertical, face-centered, bold text, high saturation |
| Documentary | Cinematic B-roll, archival style, data viz, lower thirds |
| Music | Mood-driven, abstract or narrative, beat-synced |
| News | Clean graphics, maps, quote cards, split-screen |

5. **Persona negatives per format+genre:** Expand the current genre-based persona negative system to also account for format:

```
// Current: genre negatives only
getNegatives(genre: "Thriller") → ["bright cheerful lighting", ...]

// New: format + genre negatives
getNegatives(format: "youtube_narrator", genre: "True Crime") → [
  "bright cheerful lighting",
  "comedic expressions",
  "static symmetrical compositions",
  "cartoon/anime style",     // format-specific: narration should feel real
  "text-heavy compositions"  // format-specific: text overlays are separate
]
```

---

## 16. Audio Production Service

### Enhance: existing TTS + new capabilities

**Purpose:** Handle all audio production across formats.

**New capabilities needed:**

1. **Multiple voice profiles:**
   - YouTube Narrator: warm, conversational, personality-driven
   - News Anchor: professional, authoritative, neutral
   - Documentary Narrator: measured, authoritative, slightly warmer than news
   - Educational Instructor: clear, patient, encouraging
   - Ad Voiceover: energetic, confident, persuasive

2. **Music generation/selection per format:**
   - YouTube Narrator: atmospheric, tension-building, mood-matching
   - Advertisement: high-energy, upbeat, brand-appropriate
   - Movie/Animation: scored, emotional, genre-matched
   - Educational: subtle, non-distracting, focus-enabling
   - Documentary: orchestral, ambient, chapter-transitional
   - News: professional news music bed
   - Music Video: the music IS the content

3. **Sound effect markers:** Parse `[SOUND-EFFECT: description]` markers from scripts and generate or select appropriate effects.

4. **Audio mixing:** Layer voice + music + sound effects with proper levels:
   - Voice always dominant (music ducks during narration)
   - Sound effects peak at appropriate moments
   - Music swells during non-narration segments

---

## 17. Assembly & Export Service

### Create: `assemblyService.ts`

**Purpose:** Take all generated assets (visuals, audio, text overlays) and assemble them into the final video.

**Per-format assembly rules:**

| Format | Aspect Ratio | Typical Length | Cut Pace | Transitions | Captions |
|---|---|---|---|---|---|
| YouTube Narrator | 16:9 | 8-25 min | 3-8s per visual | Crossfade | Optional |
| Advertisement | 16:9 or 9:16 | 15-60 sec | 0.5-2s cuts | Cut or motion | Bold text overlay |
| Movie/Animation | 16:9 | 2-30 min | Scene-dependent | Cinematic | Subtitles |
| Educational | 16:9 | 5-20 min | Concept-paced | Clean cuts | Optional |
| Shorts | 9:16 | 15-60 sec | 0.5-2s cuts | Jump cuts | Always-on |
| Documentary | 16:9 | 15-60 min | 5-15s per visual | Crossfade | Subtitles |
| Music | 16:9 | 2-5 min | Beat-synced | Beat-matched | Lyrics overlay |
| News | 16:9 | 3-15 min | 3-8s per graphic | Cut | Lower thirds |

---

## 18. UI Flow & State Management

### Step 1: Format Selection Screen (NEW)

**Replaces** the current direct "What's your story?" screen.

**Layout:** 8 format cards in a 4x2 grid. Each card shows icon, label (EN+AR), typical duration. Clicking a card selects it and reveals its genre options below.

**When user selects a format:**
1. Genre chips update to show only genres relevant to that format
2. A brief description of what this format produces appears
3. The text input area appears with a format-appropriate placeholder:
   - YouTube Narrator: "اكتب فكرة قصة أو موضوع تريد أن تحكيه..."
   - Advertisement: "صف المنتج أو الخدمة اللي تبي تعلن عنها..."
   - Movie/Animation: "اكتب فكرة فيلم أو مشهد تريد إنتاجه..."
   - Educational: "ما الموضوع اللي تبي تعلّمه للناس؟"
   - Shorts: "اكتب فكرة شورت قصير ومؤثر..."
   - Documentary: "ما الموضوع اللي تبي توثّقه بعمق؟"
   - Music: "صف الأغنية أو الكليب اللي تبي تنتجه..."
   - News: "ما الخبر أو الحدث اللي تبي تغطّيه؟"

### Step 2: Stepper (Format-Specific)

Each format has its own stepper steps. The visible steps are simplified — they don't show every pipeline phase, just the major user-facing checkpoints.

| Format | Visible Steps |
|---|---|
| YouTube Narrator | Idea → Research Review → Script → Preview |
| Advertisement | Brief → Hooks → Script → Preview |
| Movie/Animation | Idea → Breakdown → Screenplay → Storyboard |
| Educational | Topic → Lesson Plan → Script → Preview |
| Shorts | Idea → Hook Select → Preview |
| Documentary | Topic → Research → Chapters → Preview |
| Music | Concept → Lyrics → Music → Preview |
| News | Topic → Sources → Script → Preview |

### State Management

Extend the store to handle format-specific state:

```
interface SessionState {
  id: string;
  formatId: FormatID;
  genre: string;
  topic: string;
  language: "ar" | "en";
  
  // Phase-specific data (only relevant phases are populated)
  researchContext?: ResearchContextDocument;
  narrativeArc?: NarrativeArc;
  script?: FormatScript;
  brandBrief?: BrandBrief;         // advertisement only
  hookVariants?: HookVariant[];    // advertisement + shorts
  selectedHooks?: string[];        // user's hook selections
  lyrics?: LyricsVariant[];        // music only
  selectedLyrics?: string;         // user's lyric selection
  lessonPlan?: LessonPlan;         // educational only
  
  // Visual assets
  visuals: Array<{
    id: string;
    segmentId: string;
    imageUrl: string;
    videoUrl?: string;
    type: "broll" | "product" | "diagram" | "data_viz" | "map" | "character" | "scene";
  }>;
  
  // Audio assets
  voiceover?: { url: string; duration: number; timestamps: SegmentTimestamp[] };
  music?: { url: string; duration: number; mood: string };
  soundEffects?: Array<{ id: string; url: string; triggerTime: number }>;
  
  // Assembly
  finalVideo?: { url: string; duration: number; resolution: string };
  
  // Meta
  currentPhase: string;
  status: "active" | "paused" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
}
```

### Progress Display During Parallel Phases

When the parallel execution engine is running (e.g., 5 research queries simultaneously), show the user:

- A progress bar with `completed/total` count
- Current phase name
- Individual task status indicators (spinning = running, check = done, X = failed)
- Estimated time remaining
- "Cancel" button that triggers AbortSignal

---

## 19. Type Definitions

### Create: `formatTypes.ts`

All type definitions for the format system. Key types:

```typescript
// Format IDs
type FormatID = 
  | "youtube_narrator" 
  | "advertisement" 
  | "movie_animation" 
  | "educational" 
  | "shorts" 
  | "documentary" 
  | "music" 
  | "news_politics";

// Format registry entry
interface FormatDefinition {
  id: FormatID;
  label: string;
  labelAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  color: string;
  duration: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  genres: string[];
  phases: PhaseDefinition[];
  maxParallelCalls: number;
  approvalCheckpoints: string[];
  scriptType: ScriptType;
}

// Pipeline phase definition
interface PhaseDefinition {
  name: string;
  nameAr: string;
  icon: string;
  isParallel: boolean;
  requiresApproval: boolean;
  description: string;
}

// Script type union
type ScriptType = 
  | "narration"      // YouTube Narrator, Documentary
  | "screenplay"     // Movie/Animation
  | "micro_script"   // Shorts, Advertisement
  | "lesson_script"  // Educational
  | "lyrics"         // Music
  | "news_script";   // News

// Research context (shared across research-heavy formats)
interface ResearchContextDocument {
  topic: string;
  mainEvent: string;
  characters: Array<{ name: string; role: string; keyFacts: string[] }>;
  timeline: Array<{ date: string; event: string }>;
  statistics: Array<{ stat: string; source: string }>;
  theories: Array<{ name: string; description: string; evidence: string }>;
  culturalContext: string;
  aftermath: string;
  unusualFacts: string[];
  sourceUrls: string[];
  userUploadedSources: string[];
}

// Narrative arc beat
interface NarrativeBeat {
  type: "hook" | "intro" | "context" | "escalation" | "climax" | "theories" | "outro" | "chapter";
  title: string;
  titleAr: string;
  summary: string;
  keyFacts: string[];
  estimatedDuration: number;  // seconds
  emotionalTarget: string;
  visualRequirements: string[];
}

// Parallel execution types
interface ParallelOptions {
  maxConcurrency: number;
  onProgress: (progress: ParallelProgress) => void;
  sessionId: string;
  phaseName: string;
  retryOnRateLimit: boolean;
  maxRetries: number;
  signal?: AbortSignal;
}

interface ParallelProgress {
  completed: number;
  total: number;
  failed: number;
  currentlyRunning: number;
  phaseName: string;
  estimatedTimeRemaining: number;
}

interface ParallelResult<T> {
  status: "fulfilled" | "rejected";
  value?: T;
  reason?: string;
  duration: number;
}
```

---

## 20. Migration from Current Pipeline

### What to Keep

- `storyTools.ts` — the existing tools (`generateBreakdownTool`, `createScreenplayTool`, `generateCharactersTool`, `generateShotlistTool`, `verifyCharacterConsistencyTool`) remain as the Movie/Animation format pipeline. Do not delete them.
- `storyModeStore` — extend it, don't replace it. Add a `formatId` field to existing sessions.
- `characterService.ts` — keep as-is, used by Movie/Animation format
- `shotBreakdownAgent.ts` — keep as-is, enhance with parallelism
- `visualConsistencyService.ts` — keep as-is
- `stripMarkdown()` and `sanitizeDialogue()` utilities — keep as-is
- Language detection logic — extract to shared utility

### What to Add

1. `formatRegistry.ts` — central format definition registry
2. `formatRouter.ts` — dispatches to correct pipeline based on format
3. `parallelExecutionEngine.ts` — shared parallel execution infrastructure
4. `researchService.ts` — research fan-out for content-heavy formats
5. `narrativeEngine.ts` — format-specific script generation
6. `assemblyService.ts` — final video assembly per format
7. `formatTypes.ts` — all type definitions
8. `prompts/` directory — per-format, per-language prompt templates
9. Per-format pipeline files:
   - `pipelines/youtubeNarrator.ts`
   - `pipelines/advertisement.ts`
   - `pipelines/movieAnimation.ts` (wraps existing storyTools)
   - `pipelines/educational.ts`
   - `pipelines/shorts.ts`
   - `pipelines/documentary.ts`
   - `pipelines/music.ts`
   - `pipelines/newsPolitics.ts`

### What to Modify

1. **UI:** Replace the current Story Idea screen with Format Selection → Genre → Idea flow
2. **Store:** Extend `storyModeStore` with format-aware session state
3. **Genre handling:** Remove hardcoded `const genre = 'Drama'` from `generateShotlistTool`, thread genre from session state
4. **Shot breakdown:** Wrap `breakAllScenesIntoShots()` in parallel execution engine for Movie/Animation format
5. **Persona negatives:** Extend to accept format + genre, not just genre

### What to Deprecate

- The old `runStoryPipelineTool` (already deprecated per the docs) — remove entirely
- Direct tool invocation from UI — all tool calls should go through the format router

---

## 21. File Structure

```
src/
  services/
    formats/
      formatRegistry.ts          # Central format definitions
      formatRouter.ts            # Dispatches to correct pipeline
      formatTypes.ts             # All type definitions
      parallelExecutionEngine.ts # Shared parallel infrastructure
      researchService.ts         # Research fan-out service
      narrativeEngine.ts         # Format-specific script generation
      assemblyService.ts         # Final video assembly
      
      pipelines/
        youtubeNarrator.ts       # YouTube Storyteller pipeline
        advertisement.ts         # Advertisement pipeline
        movieAnimation.ts        # Movie/Animation pipeline (wraps existing)
        educational.ts           # Educational Tutorial pipeline
        shorts.ts                # Shorts/Reels pipeline
        documentary.ts           # Documentary pipeline
        music.ts                 # Music Video pipeline
        newsPolitics.ts          # News/Events/Politics pipeline
      
      prompts/
        youtube_narrator/
          research_queries.ar.txt
          research_queries.en.txt
          narrative_arc.ar.txt
          narrative_arc.en.txt
          full_script.ar.txt
          full_script.en.txt
        advertisement/
          brand_brief.ar.txt
          brand_brief.en.txt
          hooks.ar.txt
          hooks.en.txt
          ad_script.ar.txt
          ad_script.en.txt
        movie_animation/
          breakdown.ar.txt
          breakdown.en.txt
          screenplay.ar.txt
          screenplay.en.txt
        educational/
          knowledge_map.ar.txt
          knowledge_map.en.txt
          lesson_structure.ar.txt
          lesson_structure.en.txt
          script.ar.txt
          script.en.txt
        shorts/
          hooks.ar.txt
          hooks.en.txt
          micro_script.ar.txt
          micro_script.en.txt
        documentary/
          research_queries.ar.txt
          research_queries.en.txt
          documentary_arc.ar.txt
          documentary_arc.en.txt
          narration.ar.txt
          narration.en.txt
        music/
          mood_extraction.ar.txt
          mood_extraction.en.txt
          lyrics.ar.txt
          lyrics.en.txt
        news_politics/
          research_queries.ar.txt
          research_queries.en.txt
          angle_balance.ar.txt
          angle_balance.en.txt
          news_script.ar.txt
          news_script.en.txt
  
  components/
    FormatSelector/
      FormatSelector.tsx         # Format selection UI
      FormatCard.tsx             # Individual format card
      GenreChips.tsx             # Genre selection per format
      FormatStepper.tsx          # Format-specific stepper
      
    Pipeline/
      PipelineProgress.tsx       # Parallel execution progress display
      PhaseApproval.tsx          # Approval checkpoint UI
      ResearchReview.tsx         # Research context review screen
      ScriptEditor.tsx           # Script review/edit screen
      VisualPreview.tsx          # Generated visuals preview
      FinalPreview.tsx           # Final video preview

  agents/
    production/
      storyTools.ts              # EXISTING — becomes Movie/Animation format
      store.ts                   # EXTEND — add format-aware state
      types.ts                   # EXTEND — add format types
```

---

## Implementation Priority Order

Build in this order — each step unlocks the next:

1. **`formatTypes.ts`** — Define all types first. Everything depends on types.
2. **`formatRegistry.ts`** — Define all 8 formats with their metadata.
3. **`parallelExecutionEngine.ts`** — Build the parallel infrastructure. Test it independently.
4. **`FormatSelector` UI** — Replace the entry screen. Wire format selection to state.
5. **`formatRouter.ts`** — Build the dispatcher. For now, only Movie/Animation route works (existing pipeline).
6. **`researchService.ts`** — Build the research fan-out. Test with YouTube Narrator format.
7. **`narrativeEngine.ts`** — Build script generation for YouTube Narrator first (biggest departure from current).
8. **`pipelines/youtubeNarrator.ts`** — Wire research + narrative + visuals for the first new format.
9. **Remaining pipelines** — Build each one, starting with the most different from what exists.
10. **`assemblyService.ts`** — Build last, as it depends on all other services being functional.

---

## Key Design Decisions to Remember

1. **Format determines pipeline.** Not genre, not user preference — the format ID is the primary routing key for everything.

2. **Parallel by default, sequential by exception.** Any phase that processes multiple independent items (scenes, segments, shots, research queries) should use the parallel execution engine.

3. **Prompts are data, not code.** Store prompt templates as text files, not hardcoded strings in TypeScript. This allows editing prompts without recompiling.

4. **Arabic-first but bilingual.** Every prompt, label, and UI element must support both Arabic and English. Language detection happens once at input and propagates through the entire session.

5. **User approval at meaningful checkpoints only.** Don't ask the user to approve every micro-step. Each format has 2-4 checkpoints where the user's judgment actually matters.

6. **Graceful degradation.** If a parallel task fails, the pipeline should continue with partial results and flag the gap, not crash entirely.

7. **The genre is a style modifier, not an architecture change.** All Thrillers within YouTube Narrator use the same pipeline — genre only affects prompt tone, visual style, and persona negatives. Format changes the pipeline itself.

8. **Reference documents are gold.** If the user uploads a document, it should be treated as the primary source. Research queries supplement it, not replace it.

---

*End of specification. This document should be sufficient for an AI assistant or development team to implement the complete multi-format production system.*
