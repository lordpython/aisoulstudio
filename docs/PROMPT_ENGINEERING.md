# Prompt Engineering — AI Soul Studio

> **Document Version:** 1.0  
> **Last Updated:** February 2026  
> **Scope:** All AI prompt construction, refinement, and orchestration patterns used across the video production pipeline.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture — The Prompt Pipeline](#2-architecture--the-prompt-pipeline)
3. [Core Principles](#3-core-principles)
4. [The Persona System](#4-the-persona-system)
5. [Style Enhancement Engine](#5-style-enhancement-engine)
6. [The Vibe Library & Instruction Triplets](#6-the-vibe-library--instruction-triplets)
7. [Image Style Guide (JSON Prompts)](#7-image-style-guide-json-prompts)
8. [Prompt Linting & Quality Control](#8-prompt-linting--quality-control)
9. [Master Style Injection](#9-master-style-injection)
10. [Visual Consistency Engine](#10-visual-consistency-engine)
11. [Content Planner Prompts](#11-content-planner-prompts)
12. [Director Service — Two-Stage Pipeline](#12-director-service--two-stage-pipeline)
13. [Shot Breakdown Agent](#13-shot-breakdown-agent)
14. [Video Prompt Generation (Veo 3.1)](#14-video-prompt-generation-veo-31)
15. [Motion Prompt Generation](#15-motion-prompt-generation)
16. [Narrator — TTS Director's Notes](#16-narrator--tts-directors-notes)
17. [Production Agent System Prompt](#17-production-agent-system-prompt)
18. [NLP Intent Parsing](#18-nlp-intent-parsing)
19. [Anti-Patterns & Lessons Learned](#19-anti-patterns--lessons-learned)
20. [Quick Reference — File Map](#20-quick-reference--file-map)

---

## 1. Overview

AI Soul Studio is an autonomous video production platform that converts text topics, lyrics, or stories into complete narrated videos. Every stage of the pipeline — from content planning to image generation, video synthesis, narration, and export — relies on carefully engineered prompts to produce broadcast-quality results.

This document catalogs every prompt engineering technique used in the codebase, explains the reasoning behind each design decision, and provides guidance for extending the system.

### Key Terminology

| Term | Meaning |
|---|---|
| **Persona** | A named AI role with specific creative rules, visual principles, and avoidances. |
| **Style Enhancement** | A set of technique keywords and a medium description for a visual art style. |
| **Instruction Triplet** | A 3-axis creative direction system: emotion × cinematic × atmosphere. |
| **Vibe Term** | A single entry in the Vibe Library with a human label and a prompt fragment. |
| **Image Style Guide** | A structured JSON object that encodes every visual dimension of a shot. |
| **Master Style** | A "glue" suffix appended to all image prompts for cross-shot visual coherence. |
| **Director's Notes** | Natural-language delivery instructions for the TTS voice actor. |

---

## 2. Architecture — The Prompt Pipeline

Prompts are not written as static strings. They are **assembled dynamically** from composable layers:

```
User Input (topic/lyrics/story)
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│  1. CONTENT PLANNER                                       │
│     Persona + Style + Vibe Library + Scenario Templates   │
│     → Structured ContentPlan (scenes, narration, SFX)     │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│  2. DIRECTOR SERVICE (Two-Stage)                          │
│     Stage A: Analyzer Agent → emotional arc, themes       │
│     Stage B: Storyboarder Agent → visual prompts per      │
│              scene, guided by persona + style + analysis   │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│  3. PROMPT REFINEMENT                                     │
│     Linting (too short? repetitive? missing subject?)     │
│     Master Style injection (color grading, film grain)    │
│     AI-powered rewrite → ImageStyleGuide JSON             │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│  4. IMAGE STYLE GUIDE BUILDER                             │
│     Merges: style defaults + enhancement keywords +       │
│     negative constraints + shot breakdown data            │
│     → Serialized as JSON or natural-language paragraph    │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│  5. GENERATION                                            │
│     Image → Imagen / DeAPI Flux / Gemini                  │
│     Video → Veo 3.1 (professional video prompt)           │
│     Motion → Animation from still (motion prompt)         │
│     Voice → Gemini TTS (Director's Notes style prompt)    │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│  6. VISUAL CONSISTENCY ENGINE                             │
│     Extracts palette/lighting/texture from first shot     │
│     Injects into all subsequent shot prompts              │
│     Character consistency verification via Vision AI      │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Core Principles

These principles are enforced across every prompt in the system.

### 3.1 Positive Framing

**Never tell the AI what NOT to do — tell it what TO do.**

Negative constraints like "no text, no watermark" are relegated to a separate `avoid` field. The main prompt body focuses entirely on what the AI *should* produce.

```
❌  "A landscape, no people, no text, don't make it blurry"
✅  "A sweeping desert vista, untouched sand dunes, golden hour backlight, 
     sharp focus on the horizon line, 35mm film grain"
```

> **Why:** Negative instructions occupy attention tokens without guiding the model toward the desired output. Positive instructions give the model a clear target.

**Source:** `directorService.ts` — the Storyboarder prompt explicitly states:  
*"Focus ONLY on what TO include. NEVER use 'no' or 'without' or 'avoid'."*

### 3.2 Concrete Over Abstract

Every prompt must contain **tangible, observable details** — never abstract concepts.

```
❌  "A scene showing sadness"
✅  "Close-up of weathered hands gripping a crumpled photograph, 
     a single tear catching light on skin texture"
```

The system enforces this through a **mandatory checklist** baked into the prompt generation instruction:

| Element | Example |
|---|---|
| **Subject** | WHO or WHAT — concrete noun, not abstract |
| **Action/Pose** | What the subject is doing |
| **Setting** | WHERE the scene takes place |
| **Lighting** | Type and quality (e.g., "golden hour backlighting") |
| **Texture** | At least one tactile detail (e.g., "rain-slicked asphalt") |
| **Camera** | Shot type and angle (e.g., "extreme close-up at eye level") |
| **Atmosphere** | Mood and ambient details |

**Source:** `promptService.ts` → `getPromptGenerationInstruction()`

### 3.3 Show, Don't Tell

This extends both to **visual descriptions** and **narration scripts**.

| Type | ❌ Bad | ✅ Good |
|---|---|---|
| Visual | "He was nervous" | "Close-up of hands fidgeting with coffee cup, eyes darting to door" |
| Visual | "The town was abandoned" | "Wide shot of empty street, broken windows, weeds through cracked pavement" |
| Narration | "He felt overwhelming fear" | "His breath caught. The corridor stretched into shadow, and something moved." |
| Narration | "The village had been abandoned for years" | "Dust coated every surface. A child's shoe lay in the doorway, sun-bleached and cracked." |

**Source:** `contentPlannerService.ts` — explicit "SHOW DON'T TELL ENFORCEMENT" section

### 3.4 Subject-First Prompts

Every image prompt **must begin with a concrete subject noun**. This prevents the model from generating unfocused ambient scenes.

```
✅  "A lone figure standing in a neon rainstorm..."       (subject leads)
❌  "Neon rain falls on the subject..."                    (passive — subject buried)
❌  "A beautiful scene of something happening..."          (no concrete subject)
```

When a **Global Subject** is defined (e.g., a recurring character), every prompt must start with that exact phrase to prevent "subject drift."

**Source:** `promptService.ts` → `getPromptGenerationInstruction()`, Rule #2

### 3.5 Structured Output with Schema Enforcement

All AI calls that require structured data use one of:
- **Zod schemas** (Content Planner via LangChain)
- **`responseMimeType: "application/json"` + `responseSchema`** (direct Gemini API calls)
- **Post-parse normalization** (fallback enum mapping, truncation)

This triple-layer approach ensures:
1. The model is *instructed* to output JSON
2. The API *enforces* the schema at generation time
3. The code *validates and normalizes* the result before use

**Source:** `contentPlannerService.ts`, `promptService.ts`, `promptFormatService.ts`

---

## 4. The Persona System

Personas are named AI identities that shape the creative direction based on the video's **purpose**.

### 4.1 Structure

```typescript
interface Persona {
  type: PersonaType;       // e.g., "visual_poet", "brand_specialist"
  name: string;            // e.g., "Visual Poet"
  role: string;            // e.g., "Music Video Director"
  coreRule: string;        // The non-negotiable creative mandate
  visualPrinciples: string[];  // Guiding aesthetics
  avoidList: string[];     // What this persona must never do
}
```

### 4.2 Available Personas

| Purpose | Persona Name | Core Rule (excerpt) |
|---|---|---|
| `commercial` | Brand Specialist | Product always center stage. Visual hierarchy serves the CTA. |
| `music_video` | Visual Poet | ATMOSPHERIC RESONANCE: Prioritize the EMOTION of the lyric over the object. If lyrics say 'candle', visualize 'loneliness' using lighting and shadows. |
| `documentary` | Historian | Let subjects breathe in their environments. Truth is in the unposed details. |
| `social_short` | Scroll Stopper | Hook within 0.5 seconds. Every frame earns the next frame. |
| `storytelling` | Story Weaver | Every visual choice serves the dramatic arc. Characters are the lens. |
| `horror_mystery` | Shadow Walker | Withhold more than you reveal. Let absence create the tension. |
| `educational` | Clarity Architect | Complex ideas deserve elegant simplicity. Every visual teaches. |
| `motivational` | Fire Starter | Visceral energy. The viewer should feel the urge to act. |
| `travel` | Wanderlust Lens | Transport the viewer. You're not showing a place — you're giving them a memory. |
| `news_report` | Wire Anchor | Authority through restraint. Facts carry the weight. |

### 4.3 How Personas are Injected

Personas are injected at prompt assembly time as a clearly labeled section:

```
VISUAL DIRECTOR PERSONA: Visual Poet (Music Video Director)
CORE RULE: ATMOSPHERIC RESONANCE: Prioritize the EMOTION...

VISUAL PRINCIPLES:
- Emotional interpretation of mentioned objects through atmosphere
- Emotional resonance through cinematography
- ...

AVOID:
- Replacing concrete objects with generic scenes
- Showing 'sad person' when lyrics mention 'candle'
- ...
```

**Source:** `services/prompt/personaData.ts`

### 4.4 Design Rationale

The persona system solves the "one-size-fits-all" problem. A documentary should not be shot like a horror film, and a commercial should not look like a music video. By assigning a distinct creative identity to each purpose, the system produces purpose-appropriate results without purpose-specific fine-tuning.

---

## 5. Style Enhancement Engine

Style enhancements inject **art-style DNA** into every prompt.

### 5.1 Structure

```typescript
interface StyleEnhancement {
  keywords: string[];          // Technique-specific visual terms
  mediumDescription: string;   // A sentence describing this style's look
}
```

### 5.2 Example: Cinematic

```typescript
{
  keywords: [
    "cinematic composition", "dramatic lighting", "film grain texture",
    "anamorphic lens flare", "shallow depth of field", "color graded",
    "wide aspect ratio", "volumetric lighting",
    "professional cinematography", "moody atmosphere",
    "golden hour", "blue hour", "practical lighting",
    "rack focus", "silhouette shots", "chiaroscuro"
  ],
  mediumDescription: "Professional cinematic footage shot on 35mm film with 
    dramatic lighting, rich color grading, and masterful composition."
}
```

### 5.3 Example: Cyberpunk

```typescript
{
  keywords: [
    "neon-soaked streets", "holographic advertisements",
    "rain-slicked asphalt reflecting neon", "dense urban sprawl",
    "cybernetic augmentations", "dystopian megacity",
    "flying vehicles in smog", "underground hacker dens",
    "glitch art effects", "chromatic aberration",
    "teal and magenta color scheme", "foggy alleyways",
    "corporate tower silhouettes", "data streams"
  ],
  mediumDescription: "Cyberpunk dystopian aesthetic with neon lighting, 
    rain-soaked urban environments, and high-tech decay."
}
```

### 5.4 Available Styles

The system includes enhancements for: **Cinematic**, **Anime / Manga**, **Watercolor**, **Oil Painting**, **Cyberpunk**, **Film Noir**, **Pixel Art**, **Surrealist**, **Dark Fantasy**, **Pop Art**, **Steampunk**, **Minimalist**, **Gothic**, **Impressionist**, **Vaporwave**, **Photorealistic**, **Comic Book**, **Art Deco**, **Isometric 3D**, **Retro 80s**, **Stained Glass**, **Ukiyo-e**, **Baroque**, and **Synthwave**.

### 5.5 Integration Points

Style keywords are merged into prompts at multiple stages:
1. **Content Planner** — top 5 keywords injected into the system prompt
2. **Image Style Guide Builder** — full keyword list merged with `IMAGE_STYLE_MODIFIERS`
3. **Master Style Injection** — style-specific prefix applied to all image prompts
4. **Director Service** — style block included in Storyboarder instructions

**Source:** `services/prompt/styleEnhancements.ts`

---

## 6. The Vibe Library & Instruction Triplets

The Vibe Library is a **categorized vocabulary of 100+ creative terms** that enables fine-grained control over the mood, camera work, and atmosphere of each scene.

### 6.1 Instruction Triplets

Instead of a single "emotional tone" word, each scene can be directed along three independent axes:

```typescript
interface InstructionTriplet {
  primaryEmotion: string;           // Core emotional vibe
  cinematicDirection: string;       // Camera/visual style
  environmentalAtmosphere: string;  // Ambient texture/soundscape
}
```

**Example:**
```json
{
  "primaryEmotion": "visceral-dread",
  "cinematicDirection": "slow-push-in",
  "environmentalAtmosphere": "foggy-ruins"
}
```

### 6.2 Vibe Categories

| Category | Axis | Examples |
|---|---|---|
| **2026-tech** | atmosphere | liquid-glass, neural-lace, holographic-decay, data-rain |
| **emotional-states** | emotion | visceral-dread, nostalgic-warmth, feral-joy, sacred-awe |
| **cinematic-styles** | cinematic | dutch-angle, anamorphic-flare, dolly-zoom, rack-focus |
| **environmental-textures** | atmosphere | foggy-ruins, neon-rain, desert-silence, burning-embers |
| **cultural-moods** | atmosphere | middle-eastern-dusk, tokyo-neon-night, nordic-frost |
| **temporal-aesthetics** | cinematic | golden-hour-decay, midnight-blue, twilight-liminal |
| **sonic-landscapes** | atmosphere | tension-drone, whisper-static, heartbeat-pulse, choir-swell |

### 6.3 Prompt Fragments

Each vibe term maps to a **prompt fragment** — a short, evocative phrase that can be injected directly into any prompt:

```typescript
{ 
  id: "visceral-dread", 
  promptFragment: "a gut-punch of visceral dread, breath caught in the throat"
}

{ 
  id: "slow-push-in", 
  promptFragment: "gradual slow push-in building focus and intensity"
}

{ 
  id: "foggy-ruins", 
  promptFragment: "thick fog rolling through crumbling ancient ruins"
}
```

The function `tripletToPromptFragments()` resolves an Instruction Triplet into its three prompt fragments for direct injection.

### 6.4 Scenario Templates

Pre-designed narrative arc templates tie triplets to story beats:

| Scenario | Beats |
|---|---|
| **The Ghost Protocol** | Setup → Discovery → Confrontation → Revelation |
| **The Silent Signal** | Intercept → Decode → Chase → Transmission |
| **The Desert Crossing** | Departure → Ordeal → Oasis → Arrival |
| **Neon Descent** | Surface → Descent → Underworld → Emergence |

Each beat has a **suggested triplet**, giving the AI a pre-designed emotional arc to follow.

**Source:** `services/prompt/vibeLibrary.ts`

---

## 7. Image Style Guide (JSON Prompts)

The Image Style Guide replaces ad-hoc string concatenation with a **typed JSON schema** that encodes every visual dimension of a shot.

### 7.1 Schema

```typescript
interface ImageStyleGuide {
  scene: string;                    // Scene/action description
  subjects: ImageStyleGuideSubject[];  // Who/what is in frame
  style: {
    preset: string;                 // "Cinematic", "Anime", etc.
    keywords: string[];             // Merged from enhancements + modifiers
    medium: string;                 // Medium description
  };
  color_palette: string[];          // e.g., ["warm amber", "deep shadow"]
  lighting: {
    source: string;                 // "golden hour", "neon tube"
    quality: string;                // "soft diffused", "harsh directional"
    direction?: string;             // "backlit", "side-lit"
  };
  mood: string;                     // "dramatic cinematic"
  background: string;               // Background description
  composition: {
    shot_type: string;              // "medium shot", "close-up"
    camera_angle: string;           // "eye-level", "low angle"
    framing?: string;               // "rule of thirds", "center framing"
  };
  camera: {
    lens?: string;                  // "35mm", "85mm"
    depth_of_field?: string;        // "shallow", "deep"
    focus?: string;                 // "subject", "product"
  };
  textures?: string[];              // ["35mm film grain"]
  effects?: string[];               // ["anamorphic lens flare", "bokeh"]
  avoid: string[];                  // Negative constraints
}
```

### 7.2 Per-Style Defaults

Each art style has a default table that pre-fills lighting, palette, textures, effects, camera, and composition:

| Style | Lighting | Palette | Textures | Mood |
|---|---|---|---|---|
| Cinematic | Golden hour, soft diffused, backlit | Warm amber, deep shadow, desaturated teal | 35mm film grain | Dramatic cinematic |
| Cyberpunk | Neon tube, harsh directional, side-lit | Teal, magenta, electric blue, deep black | Rain-slicked asphalt, holographic sheen | Dystopian neon |
| Watercolor | Natural daylight, soft diffused | Transparent washes, bleeding edges | Cold-pressed paper, pigment granulation | Dreamy ethereal |
| Dark Fantasy | Flickering torchlight, volumetric, backlit | Deep crimson, charcoal black, sickly green | Weathered stone, rusted metal | Ominous gothic |

### 7.3 Dual Serialization

The guide can be serialized two ways:

1. **`serializeStyleGuide()`** — raw JSON for models that handle structured input
2. **`serializeStyleGuideAsText()`** — natural-language paragraph for models like Imagen or DeAPI Flux

The text serializer outputs prompts in this order (optimized for model attention):
1. Subjects (most important)
2. Scene/action
3. Background
4. Style medium
5. Lighting
6. Composition + camera
7. Mood
8. Color palette
9. Textures + effects
10. Style keywords (top 5)
11. Avoid (prefixed with "no")

### 7.4 Shot Breakdown Factory

For the Story Mode pipeline, `fromShotBreakdown()` converts shot breakdown data + character profiles into a complete `ImageStyleGuide`:

- Characters are matched to shots by name mention
- Poses and interactions are inferred from the shot description using regex
- Lighting direction is inferred from lighting keywords
- Extracted style overrides (from the Visual Consistency Engine) are applied for cross-shot coherence

**Source:** `services/prompt/imageStyleGuide.ts`

---

## 8. Prompt Linting & Quality Control

Before any prompt reaches a generation model, it passes through the **Prompt Linter**.

### 8.1 Lint Rules

| Issue | Detection | Severity |
|---|---|---|
| `too_short` | Word count < 10 | `warning` |
| `too_long` | Word count > 150 | `info` |
| `repetitive` | >30% of words are duplicates | `warning` |
| `missing_subject` | First 5 words don't contain a noun-like word | `error` |
| `generic_descriptors` | Contains "beautiful", "stunning", "amazing" | `warning` |
| `negative_instructions` | Contains "no", "not", "without", "don't" | `info` |

### 8.2 Lint Response

```typescript
interface PromptLintIssue {
  type: string;
  message: string;
  severity: "error" | "warning" | "info";
}
```

The linter returns issues that can be used to:
- **Auto-fix**: Automatically refine the prompt before generation
- **Report**: Surface issues to the user in the UI
- **Block**: Prevent generation of clearly broken prompts

### 8.3 AI-Powered Refinement

If the linter flags issues, the prompt is sent to an AI model for structured refinement via `refineImagePromptAsGuide()`. The AI rewrites the prompt into an `ImageStyleGuide` with fields for scene, mood, lighting, composition, camera, color palette, textures, and effects.

**Source:** `services/promptService.ts` → `lintPrompt()`, `refineImagePromptAsGuide()`

---

## 9. Master Style Injection

The `injectMasterStyle()` function is the **"visual glue"** that prevents "Style Soup" — the problem where different scenes in the same video look like they were generated by different models.

### 9.1 How It Works

```typescript
function injectMasterStyle(basePrompt: string, stylePreset: string): string {
  // 1. CLEAN: Remove conflicting style words
  let cleanPrompt = basePrompt
    .replace(/photorealistic|cartoon|3d render|sketch/gi, "")
    .trim();

  // 2. PREFIX: Add style-specific opener
  const prefix = stylePrefixes[stylePreset] || `${stylePreset} aesthetic`;

  // 3. GLUE: Append the Master Style suffix
  const MASTER_STYLE = `${prefix}, ${stylePreset} aesthetic, 
    consistent color grading, soft volumetric lighting, 
    35mm film grain, high coherence, highly detailed, 8k resolution.
    Negative prompt: text, watermark, bad quality, distorted, 
    cgi artifacts, cartoon.`;

  // 4. COMBINE
  return `${cleanPrompt}. ${MASTER_STYLE}`;
}
```

### 9.2 Design Decisions

- **Cleaning first**: Removes any style keywords in the base prompt that conflict with the chosen style
- **Consistent suffix**: Every image in the video gets the same lighting quality, film grain, and resolution targets
- **Negative prompt**: Appended as a separate clause rather than mixed into the main prompt (following the positive framing principle)

**Source:** `services/promptService.ts` → `injectMasterStyle()`

---

## 10. Visual Consistency Engine

While the Master Style handles *prompt-level* consistency, the Visual Consistency Engine handles *pixel-level* consistency.

### 10.1 Style Extraction

After the first scene's image is generated, the engine uses **Gemini Vision** to analyze it and extract:

```typescript
interface VisualStyle {
  colorPalette: string[];   // ["deep navy", "warm amber", "soft cream"]
  lighting: string;         // "golden hour with dramatic shadows"
  texture: string;          // "subtle film grain, 35mm look"
  moodKeywords: string[];   // ["atmospheric", "cinematic"]
  stylePrompt: string;      // Complete style description for appending
}
```

### 10.2 Style Injection

The extracted style is then injected into **every subsequent scene prompt** via `injectStyleIntoPrompt()`:

```typescript
function injectStyleIntoPrompt(prompt: string, style: VisualStyle): string {
  const colorDesc = style.colorPalette.slice(0, 3).join(" and ") + " color palette";
  const styleElements = [colorDesc, style.lighting, style.texture, ...style.moodKeywords];
  return `${prompt}. Style: ${styleElements.join(", ")}`;
}
```

### 10.3 Character Consistency Verification

For videos with recurring characters, the engine uses Gemini Vision to **compare character appearance across multiple shots**:

1. Takes up to 5 images as input
2. Compares against a `CharacterProfile` (name, role, visual description)
3. Returns a `ConsistencyReport` with:
   - Score (0–100)
   - Specific issues (e.g., "Hair color changed from blonde to brown")
   - Suggestions for fixing prompts

### 10.4 Character Bible

The Content Planner can generate a **Character Bible** — a structured definition of each recurring character:

```typescript
{
  name: "Faisal",
  appearance: "Mid-30s, olive skin, strong jawline, dark brown eyes",
  clothing: "Worn leather jacket, white cotton shirt, silver ring",
  distinguishingFeatures: "Scar above left eyebrow",
  consistencyKey: "mid-30s olive-skinned man, dark brown eyes, leather jacket, scar above left eyebrow"
}
```

The `consistencyKey` — exactly 5 comma-separated keywords — is **prepended to every image prompt** where the character appears, acting as a visual anchor.

**Source:** `services/visualConsistencyService.ts`, `services/contentPlannerService.ts`

---

## 11. Content Planner Prompts

The Content Planner is the most complex prompt in the system. It takes a topic and produces a complete video production plan.

### 11.1 Prompt Assembly

The system prompt is assembled from **eight layered blocks**:

| Block | Purpose |
|---|---|
| **Language Directive** | Forces output in the same language as input (or a specified language) |
| **Persona Guidance** | Injects the selected persona's rules and principles |
| **Style Guidance** | Injects style keywords and medium description |
| **Triplet Guidance** | Explains the 3-axis creative direction system with available terms |
| **Scenario Hint** | Suggests a narrative arc template if one matches the purpose |
| **TTS Style Guidance** | Teaches AI to write TTS-optimized narration with delivery markers |
| **Narration Purity Rules** | Hard prohibition on metadata labels bleeding into narration |
| **Hybrid Language Note** | Clarifies which fields use which language |

### 11.2 TTS Delivery Markers

The Content Planner teaches the AI to embed **delivery markers** in narration scripts:

```
[pause: long]                          — dramatic beat before a reveal
[emphasis]key phrase[/emphasis]        — vocal stress on important words
[low-tone]dark content[/low-tone]      — drop to lower register
[whisper]secret or intimate[/whisper]  — hushed delivery
[breath]                               — natural breath for realism
```

### 11.3 Pacing Rules

Strict duration rules prevent boring static images:

| Scene Type | Duration | Words |
|---|---|---|
| Standard | 8–12 seconds | 20–30 words |
| Fast (montage) | 3–5 seconds | 5–10 words |
| Slow (contemplative) | 12–15 seconds max | 30–37 words |

**Critical:** If narration exceeds 30 words, the scene MUST be split into two parts.

### 11.4 Smart Duration Calculation

After the AI returns its plan, the system recalculates scene durations using multiplicative factors:

- **Base:** 2.5 words per second
- **Complexity multiplier:** +5% per technical/complex term found
- **Emotional multiplier:** dramatic = +25%, calm = +15%, urgent = −15%
- **Action multiplier:** −20% if action verbs detected in visual description
- **Clamp:** 5s minimum, 15s maximum

### 11.5 Cinematography Vocabulary

The prompt includes an extensive vocabulary guide covering:
- **Shot types:** Extreme close-up, close-up, medium, wide, extreme wide
- **Camera angles:** Low angle, high angle, dutch angle
- **Camera movement:** Slow push-in, pull-back, tracking, pan, tilt, static tripod, handheld float
- **Composition:** Rule of thirds, center framing, leading lines, depth of field
- **Lighting:** Golden hour, blue hour, volumetric, cinematic rim light, neon noir

### 11.6 Ambient SFX Selection

Each scene gets a suggested ambient sound effect from a curated list of 19 categories (desert-wind, ocean-waves, eerie-ambience, etc.). The AI selects based on scene mood and setting.

**Source:** `services/contentPlannerService.ts`

---

## 12. Director Service — Two-Stage Pipeline

The Director Service uses a **two-agent pipeline** via LangChain for the lyrics/story mode.

### 12.1 Stage A: Analyzer Agent

**Role:** Interpret the content's emotional and thematic structure.

**Output Schema (Zod-validated):**

```typescript
{
  overallMood: string,           // "melancholic yearning"
  themes: string[],              // ["loss", "memory", "hope"]
  emotionalArc: string,          // "builds from sorrow to acceptance"
  visualSuggestions: string[],   // ["rain on a window", "empty chair"]
  keyMoments: string[],          // ["the pivotal chorus", "the quiet bridge"]
  pacing: string                 // "start slow, crescendo, then fade"
}
```

This analysis is then **fed into Stage B** as context.

### 12.2 Stage B: Storyboarder Agent

**Role:** Generate 8–12 visual prompts for image generation.

Receives:
- The original content (lyrics/story)
- The Analyzer's output
- Persona data
- Style enhancements
- Global subject (if defined)
- Purpose-specific guidance

**Enforced Rules:**
1. Every prompt starts with a concrete subject noun
2. 40–120 words per prompt
3. Must include: subject, action, setting, lighting, texture, camera, atmosphere
4. No generic phrases ("beautiful", "stunning")
5. Vary compositions across scenes
6. Follow the emotional arc from the Analyzer

### 12.3 Emotional Arc Template

The Storyboarder follows a pre-defined emotional progression:

```
Scene 1-2:  Establish mood and setting (wide shots, context)
Scene 3-5:  Build intensity (medium shots, character focus)
Scene 6-8:  Peak emotion (dynamic angles, close-ups, action)
Scene 9-12: Resolution/reflection (pull back, contemplative)
```

**Source:** `services/directorService.ts`

---

## 13. Shot Breakdown Agent

For the Story Mode pipeline, scenes from a screenplay are broken into **4–6 individual camera shots** by the Shot Breakdown Agent.

### 13.1 Key Instruction Principles

The prompt explicitly addresses three common failure modes:

1. **"Don't describe the set"** — The agent is told to describe dramatic action, not static environments.

   ```
   ❌ "A market with spices"
   ✅ "The camera pushes in on Faisal's hand as he hesitates to 
       touch the jar, his fingers trembling"
   ```

2. **"Every shot must have a SUBJECT performing an ACTION with a specific EMOTION"** — Forces narrative content in every shot.

3. **"Characters are ACTORS in a drama, not mannequins in a diorama"** — Prevents lifeless poses.

### 13.2 Character Consistency

The prompt receives **character appearance references** (from the Character Bible) and enforces:

> "If any character from 'Character Appearance Reference' appears in a shot, you MUST include their specific physical traits. NEVER just say 'the protagonist.'"

### 13.3 Genre-Specific Style Recommendations

The agent includes genre-aware defaults:

| Genre | Preferred Shots | Preferred Movements | Lighting |
|---|---|---|---|
| Thriller/Horror | Close-up, Extreme CU, POV | Handheld, Tracking, Zoom | Dramatic/Chiaroscuro |
| Action | Wide, Medium, POV | Tracking, Pan, Handheld | Hard/Dynamic |
| Drama | Medium, Close-up, OTS | Static, Dolly, Pan | Soft/Natural |
| Sci-Fi | Wide, Extreme CU, POV | Tracking, Dolly, Pan | Neon/Cold |

### 13.4 Normalization & Validation

AI output is normalized through enum matching to ensure valid values for shot types, camera angles, and movements. Duration is clamped to 3–8 seconds.

**Source:** `services/ai/shotBreakdownAgent.ts`

---

## 14. Video Prompt Generation (Veo 3.1)

The `generateProfessionalVideoPrompt()` function transforms a scene description into a **150–250 word professional video direction** for Google Veo 3.1.

### 14.1 Mandatory Elements

Each video prompt must include:

| Element | Details |
|---|---|
| **Camera Work** | Movement type, speed, framing progression |
| **Lighting Design** | Key light, mood lighting, contrast ratio, motivation |
| **Motion Choreography** | Subject movement, environmental motion, parallax/depth |
| **Atmosphere & Environment** | Volumetric effects, environmental storytelling, weather |
| **Temporal Pacing** | Mini-arc within the clip duration (establish → focus → conclude) |

### 14.2 Temporal Pacing Formula

For a 6-second clip:
```
Seconds 0-2: Establish (wide or reveal)
Seconds 2-4: Focus (move to subject)
Seconds 4-6: Conclude (emotional beat or pullback)
```

### 14.3 Style-Specific Addenda

When the style is "Cinematic," the prompt adds:
```
- 35mm film grain, anamorphic lens flares, 2.39:1 cinematic feel
- Deep shadows, rich highlights, film color science
- Motivated camera movement, deliberate pacing
- Production design worthy of major motion pictures
```

### 14.4 Output Rules

- Start directly with scene action (no "A video of...")
- Write in present tense, active voice
- Be specific about timing within the clip duration

**Source:** `services/promptService.ts` → `generateProfessionalVideoPrompt()`

---

## 15. Motion Prompt Generation

The `generateMotionPrompt()` function creates prompts for **animating still images** into video clips.

### 15.1 Design Philosophy

Motion prompts describe *subtle, organic movement* rather than dramatic action — the goal is to bring a still image to life without changing its composition.

Typical elements:
- Gentle camera drift or slow zoom
- Environmental motion (wind, particles, water)
- Subtle subject motion (breathing, blinking, swaying)
- Atmospheric effects (fog, light shifts)

**Source:** `services/promptService.ts` → `generateMotionPrompt()`

---

## 16. Narrator — TTS Director's Notes

The Narrator Service uses Gemini 2.5 TTS with **"Director's Notes"** — natural-language style prompts that steer voice performance.

### 16.1 Style Prompt Structure

```typescript
interface StylePrompt {
  persona?: string;         // "A gentle guide leading a moonlit meditation"
  emotion?: string;         // "serene, soothing, peaceful, like a warm breeze"
  pacing?: string;          // "slow and flowing with long restful pauses"
  accent?: string;          // Regional accent guidance
  customDirectorNote?: string;  // Free-form delivery instructions
}
```

### 16.2 Tone-to-Voice Mapping

| Emotional Tone | Voice | Persona | Emotion | Pacing |
|---|---|---|---|---|
| **professional** | Leda | A polished corporate presenter | confident, authoritative | measured and crisp |
| **dramatic** | Charon | A gravelly war correspondent | intense, weighty | deliberate, with power pauses |
| **friendly** | Puck | An enthusiastic tour guide | warm, energetic, encouraging | upbeat, conversational |
| **urgent** | Fenrir | A field correspondent in a crisis zone | alert, compelling, serious | rapid and purposeful |
| **calm** | Aoede | A gentle guide leading a moonlit meditation | serene, soothing, peaceful | slow and flowing |

### 16.3 Multi-Voice Dialogue

The system supports **multiple voices** for dialogue scenes:

| Character Type | Voice | Description |
|---|---|---|
| narrator | Kore | Default narrator |
| male | Charon | Deep male voice |
| female | Aoede | Soft female voice |
| elder | Fenrir | Authoritative elder voice |
| youth | Puck | Energetic young voice |
| mysterious | Fenrir | Dramatic mysterious voice |

Dialogue detection uses regex patterns to identify quoted speech and speaker attributions, splitting narration into segments with appropriate voice assignments.

### 16.4 Purpose-Specific Delivery

Video purpose further refines the delivery style:
- **Documentary:** Authoritative, measured cadence
- **Horror/Mystery:** Hushed, tense, with dramatic pauses
- **Commercial:** Energetic, persuasive tone
- **Storytelling:** Narrative immersion, character voices

**Source:** `services/narratorService.ts`

---

## 17. Production Agent System Prompt

The Production Agent is the **autonomous orchestrator** that chains all tools together. Its system prompt is a comprehensive instruction manual.

### 17.1 Tool Group Dependencies

```
IMPORT → CONTENT → MEDIA → ENHANCEMENT → EXPORT
```

The prompt enforces strict ordering — media generation cannot begin before content planning, and export cannot begin before enhancement.

### 17.2 Decision Tree

The prompt includes explicit decision trees for different workflows:

```
IF user provides lyrics/music:
  → IMPORT audio → CONTENT (lyrics mode) → MEDIA → ENHANCE → EXPORT

IF user provides topic only:
  → CONTENT (topic mode) → MEDIA → ENHANCE → EXPORT

IF user provides story/screenplay:
  → CONTENT (story mode) → CHARACTER GENERATION → SHOT BREAKDOWN 
  → MEDIA → ENHANCE → EXPORT
```

### 17.3 Critical Rules

| Rule | Rationale |
|---|---|
| **Never provide auto-fetched parameters** | Session state handles asset URLs automatically |
| **Never call the same tool twice for the same step** | Prevents duplicate generation and quota waste |
| **Use the session ID for every tool call** | Ensures all assets are grouped correctly |
| **Follow the dependency chain** | Previous step's outputs are required inputs for the next step |

### 17.4 Error Recovery

```
IF tool returns error:
  → Check if the error is retryable
  → If yes: retry with exponential backoff (max 3 retries)
  → If no: log the error and skip that step
  → Continue with remaining steps
```

### 17.5 Quality Control Loop

The agent includes a self-evaluation loop:
1. Verify all assets were generated
2. Check narration coverage (every scene has audio)
3. Verify visual consistency across scenes
4. Validate export readiness

**Source:** `services/ai/production/prompts.ts`

---

## 18. NLP Intent Parsing

The NLP Intent Parser is a **local, non-AI pattern matcher** that identifies user intent from natural language input.

### 18.1 Intent Detection

Uses regex pattern matching against 10 intent categories:

| Intent | Example Triggers |
|---|---|
| `create_video` | "create a video", "make a video about", "I want to generate" |
| `generate_music` | "create a song", "compose music", "make a beat" |
| `edit_content` | "edit my", "modify this", "enhance my" |
| `export_video` | "export my", "download the", "render my" |
| `get_help` | "help me with", "how to", "can you explain" |
| `greeting` | "hi", "hello", "what's up" |

### 18.2 Entity Extraction

Extracts structured data from natural language:

| Entity | Patterns |
|---|---|
| `topic` | "about [topic]", "for [topic]" |
| `duration` | "30 seconds", "2 minutes", "short video" |
| `aspectRatio` | "16:9", "portrait", "square" |
| `style` | "cinematic", "anime", "watercolor" |
| `mood` | "happy", "dramatic", "mysterious" |

### 18.3 Confidence Modifiers

Linguistic cues adjust the confidence score:

| Pattern | Modifier |
|---|---|
| "please" | +10% |
| "I want" / "I need" | +15% |
| "could you" | −5% |
| "maybe" | −10% |
| "not sure" | −15% |

### 18.4 Context-Aware Clarification

If intent is unclear, the system generates targeted clarification questions based on missing entities:

```
Intent: create_video (missing topic, duration, style)
→ "What would you like your video to be about?"
→ "How long should the video be?"
→ "What visual style appeals to you (cinematic, anime, etc.)?"
```

**Source:** `services/ai/nlpIntentParser.ts`

---

## 19. Anti-Patterns & Lessons Learned

### 19.1 Style Soup

**Problem:** When each scene prompt uses different style keywords, the resulting video looks like a collage instead of a coherent film.

**Solution:** Master Style Injection + Visual Consistency Engine. Every prompt gets the same style suffix, and the first scene's actual pixel style is extracted and propagated.

### 19.2 Subject Drift

**Problem:** Across 10+ scenes, the AI gradually changes the described subject — "A young woman" becomes "A mysterious figure" becomes "A shadow."

**Solution:** Global Subject enforcement. If a subject is defined, every prompt must start with the exact same subject phrase. The Character Bible's `consistencyKey` provides a 5-keyword anchor.

### 19.3 Narration Label Leakage

**Problem:** The AI includes metadata labels in narration scripts — "Emotional Hook: The desert wind..." — which then get spoken by TTS or burnt into subtitles.

**Solution:** Multi-layer defense:
1. Explicit prohibition in the prompt (with examples in both English and Arabic)
2. Post-processing via `cleanForTTS()` to strip any remaining labels
3. Zod schema validation to catch structural issues

### 19.4 Generic Descriptors

**Problem:** Prompts containing "beautiful sunset" or "stunning landscape" produce generic, unmemorable images.

**Solution:** The prompt linter flags generic adjectives. The generation instruction explicitly bans "beautiful", "stunning", "amazing" and requires specific descriptors instead.

### 19.5 Empty Scene Syndrome

**Problem:** Visual descriptions like "a tense atmosphere" or "feelings of dread" produce blank or random images.

**Solution:** "Show Don't Tell" enforcement — every visual description must contain observable, camera-capturable details. Abstract concepts must be expressed through concrete visual cues.

### 19.6 Monotonous Pacing

**Problem:** All scenes default to the same 10-second duration with similar shot types.

**Solution:** 
- Smart Duration Calculator with complexity/emotion/action multipliers
- Visual Variety Checklist (at least one extreme close-up, one wide shot, mix of angles)
- Explicit instruction to vary pacing

### 19.7 Static Camera Syndrome

**Problem:** Shot breakdown agent generating all "static" camera movements, creating lifeless video.

**Solution:** The prompt explicitly states:  
*"MANDATORY: Assign a camera movement to every shot. Never leave the camera static for emotional scenes. Use Static only for contemplative pauses."*

---

## 20. Quick Reference — File Map

| File | Role | Key Exports |
|---|---|---|
| `services/promptService.ts` | Prompt generation, refinement, linting, Master Style injection | `injectMasterStyle()`, `lintPrompt()`, `getPromptGenerationInstruction()`, `refineImagePromptAsGuide()`, `generateProfessionalVideoPrompt()`, `generateMotionPrompt()` |
| `services/prompt/personaData.ts` | Persona definitions for all video purposes | `getSystemPersona()`, `Persona` |
| `services/prompt/styleEnhancements.ts` | Style-specific keywords and medium descriptions | `getStyleEnhancement()`, `StyleEnhancement` |
| `services/prompt/vibeLibrary.ts` | 100+ categorized vibe terms + scenario templates | `VIBE_LIBRARY`, `SCENARIO_TEMPLATES`, `getVibeTerms()`, `tripletToPromptFragments()` |
| `services/prompt/imageStyleGuide.ts` | Typed JSON prompt builder with per-style defaults | `buildImageStyleGuide()`, `serializeStyleGuide()`, `serializeStyleGuideAsText()`, `fromShotBreakdown()` |
| `services/contentPlannerService.ts` | LangChain-based content planning with Zod schemas | `generateContentPlan()`, `ContentPlanSchema` |
| `services/directorService.ts` | Two-stage Analyzer + Storyboarder pipeline | `runDirectorPipeline()` |
| `services/ai/shotBreakdownAgent.ts` | Screenplay scene → camera shots | `breakSceneIntoShots()`, `getGenreStyleRecommendation()` |
| `services/visualConsistencyService.ts` | Vision-based style extraction + character verification | `extractVisualStyle()`, `injectStyleIntoPrompt()`, `verifyCharacterConsistency()` |
| `services/narratorService.ts` | TTS with Director's Notes style prompts | `generateNarration()`, `CHARACTER_VOICE_MAP`, `TONE_VOICE_MAP` |
| `services/ai/production/prompts.ts` | Production Agent system instructions | `PRODUCTION_AGENT_PROMPT` |
| `services/ai/nlpIntentParser.ts` | Regex-based intent + entity extraction | `parseIntent()`, `handleAmbiguousInput()` |
| `services/promptFormatService.ts` | JSON format specs + format correction | `getFormatSpec()`, `correctFormat()` |

---

## Appendix A: Prompt Template Anatomy

A typical system prompt in this codebase follows this structure:

```
┌─────────────────────────────────────────┐
│ 1. ROLE ASSIGNMENT                       │
│    "You are a [specific professional]"   │
├─────────────────────────────────────────┤
│ 2. PERSONA BLOCK                         │
│    Name, Core Rule, Principles, Avoids   │
├─────────────────────────────────────────┤
│ 3. STYLE BLOCK                           │
│    Medium description, Top keywords      │
├─────────────────────────────────────────┤
│ 4. TASK DESCRIPTION                      │
│    What the AI must produce              │
├─────────────────────────────────────────┤
│ 5. RULES & CONSTRAINTS                   │
│    Numbered rules, mandatory checklists  │
├─────────────────────────────────────────┤
│ 6. EXAMPLES (Good/Bad)                   │
│    Concrete ✅/❌ pairs                   │
├─────────────────────────────────────────┤
│ 7. OUTPUT FORMAT                         │
│    JSON schema or text format spec       │
├─────────────────────────────────────────┤
│ 8. INPUT                                 │
│    The actual user content               │
└─────────────────────────────────────────┘
```

---

## Appendix B: Adding a New Persona

1. Open `services/prompt/personaData.ts`
2. Add a new entry to the `PERSONAS` object:

```typescript
my_new_purpose: {
  type: "my_type",
  name: "My Persona Name",
  role: "Role Description",
  coreRule: "The single most important creative rule",
  visualPrinciples: [
    "Principle 1",
    "Principle 2",
  ],
  avoidList: [
    "What this persona must never do",
  ],
},
```

3. Add the purpose to the `VideoPurpose` type in `constants.ts`
4. The persona will automatically be injected into Content Planner and Director prompts

## Appendix C: Adding a New Art Style

1. Open `services/prompt/styleEnhancements.ts`
2. Add a new entry to the `STYLE_ENHANCEMENTS` map:

```typescript
"my style": {
  keywords: ["keyword1", "keyword2", ...],
  mediumDescription: "Description of this style's visual characteristics."
},
```

3. Open `services/prompt/imageStyleGuide.ts`
4. Add defaults to `STYLE_DEFAULTS`:

```typescript
"my style": {
  lighting: { source: "...", quality: "..." },
  color_palette: ["...", "..."],
  textures: ["..."],
  effects: ["..."],
  camera: { lens: "...", depth_of_field: "..." },
  composition: { shot_type: "...", camera_angle: "...", framing: "..." },
  mood: "...",
},
```

5. Optionally add to `IMAGE_STYLE_MODIFIERS` in `constants.ts` for supplemental keywords

---

*This document is auto-maintained alongside the codebase. For contributions or corrections, update the source files and regenerate.*
