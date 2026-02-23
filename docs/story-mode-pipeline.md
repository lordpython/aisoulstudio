# Story Mode Pipeline

> What happens from the moment you type an idea to the final exported video.

---

## Overview

Story mode is a **10-step sequential pipeline**. Each step unlocks the next. You can pause at any step and edit the output before continuing. All state is saved to localStorage and optionally synced to Firebase so you can resume across sessions.

```
Idea → Breakdown → Screenplay → Characters → [LOCK] → Shot List → Style → Storyboard → Narration → Animation → Export
```

---

## Step 0 — Entry Point

**File:** `screens/StudioScreen.tsx`
**Route:** `/studio?mode=story`

When you open Story Mode, `useStoryGeneration(projectId?)` initialises. If a `projectId` is in the URL, it restores that project's state from localStorage (key: `ai_soul_studio_story_state`). If the project ID changed since last time, the state resets — preventing cross-project leakage.

You see the `IdeaView` tab with a text field and a genre selector.

---

## Step 1 — Idea → Breakdown

**Trigger:** You type your idea and click **Generate**
**Hook action:** `storyHook.generateBreakdown(topic, genre)`
**Service:** `storyPipeline.ts` → `generateBreakdown()`
**Model:** `gemini-2.5-flash-preview` (`MODELS.TEXT`)

### What happens

1. Language is **auto-detected** from the topic text (`/[\u0600-\u06FF]/` → Arabic, else English).
2. A **format-aware prompt template** is loaded from `services/prompt/templates/movie-animation/breakdown.txt` and variables are substituted (`{idea}`, `{genre}`, `{language_instruction}`, etc.).
3. Gemini is called with **structured output** (Zod schema) and returns **3–5 acts**, each with:
   - `title` — a specific act title referencing a story moment
   - `emotionalHook` — the dominant emotion for that act (e.g., "mounting dread")
   - `narrativeBeat` — the specific event or revelation that drives the act forward
4. Result is saved to `storyState.breakdown` and the UI moves to the **Breakdown** tab.

### What you can change
- Edit any act's title, hook, or beat directly in the breakdown table.
- Add or remove acts.
- Change the genre and regenerate.

---

## Step 2 — Breakdown → Screenplay

**Trigger:** Click **Continue** on the Breakdown tab
**Hook action:** `storyHook.generateScreenplay()`
**Service:** `storyPipeline.ts` → `generateScreenplay()`
**Model:** `gemini-2.5-flash-preview` (structured output)

### What happens

1. Only the **breakdown acts** are sent to the LLM — the original topic is NOT included. This keeps context minimal and the output focused.
2. Gemini expands each act into **3–8 screenplay scenes**, each with:
   - `heading` — location/time slug (e.g., `INT. SPACESHIP - DAY`)
   - `action` — visual description of what happens
   - `dialogue` — list of `{speaker, text}` lines
3. **Speaker repair logic** runs: if the LLM mistakenly puts a long description in the `speaker` field, it's automatically recovered as a `"Narrator"` line.
4. Each dialogue line is sanitised via `cleanForTTS()` (strips markdown, emoji, special chars).
5. Result is saved to `storyState.script`.

### What you can change
- Edit any scene's heading, action description, or dialogue.
- Reorder scenes.
- Add new scenes or delete ones.

---

## Step 3 — Screenplay → Characters

**Trigger:** Click **Continue** on the Script tab
**Hook action:** `storyHook.generateCharacters()`
**Service:** `storyPipeline.ts` → `extractCharactersFromScreenplay()` → `generateCharacterReferences()`
**Models:** `gemini-2.5-flash-preview` (text), `imagen-4.0-fast-generate-001` (images)

### What happens

**Part A — Text extraction:**
1. Only the screenplay is sent to the LLM (not the breakdown or topic).
2. The model identifies characters from dialogue speakers and action text.
3. For each character it returns:
   - `name`, `role` (protagonist / antagonist / supporting)
   - `visualDescription` — detailed appearance for image generation (age, build, skin tone, hair, clothing)
   - `facialTags` — exactly 5 comma-separated visual keywords (e.g., `"sharp jawline, dark curly hair, olive skin, worn leather jacket, silver earring"`)
4. `charactersPresent` is populated on each scene by matching character names against dialogue speakers and action text.

**Part B — Reference image generation (one at a time):**
1. For each character, a structured style guide is built (`buildImageStyleGuide`) requesting a character design sheet (front + three-quarter view, neutral background, studio lighting).
2. Imagen generates the reference image.
3. Image is uploaded to cloud storage if Firebase auth is active.
4. `referenceImageUrl` is stored on the character profile.

### What you can change
- Edit character names, roles, or visual descriptions.
- Regenerate the reference image for a specific character (pencil icon in the character card).

---

## Checkpoint — Lock the Story

**Trigger:** Click **Lock Story** on the Script or Characters tab
**Hook action:** `storyHook.lockStory()`

Once locked, `storyState.isLocked = true`. The story text and characters become read-only. This prevents the shot list and storyboard from going out of sync with the screenplay. A `LockWarningDialog` warns you before locking.

> You can't proceed to shot generation without locking.

---

## Step 4 — Characters → Shot List

**Trigger:** Click **Generate Shots** on the Characters tab
**Hook action:** `storyHook.generateShots(sceneIndex?)`
**Service:** `shotBreakdownAgent.ts` → `breakAllScenesIntoShots()`
**Model:** `gemini-2.5-flash-preview` (via LangChain `ChatGoogleGenerativeAI`)

### What happens

For each screenplay scene (sequentially):
1. The full shot breakdown prompt (`SHOT_BREAKDOWN_PROMPT`) is built, injecting:
   - Scene heading, action text, dialogue
   - Genre conventions
   - Character appearance anchors (compact facial tags)
   - Emotional mood from the breakdown
2. Gemini returns **4–6 shots** per scene as a JSON array.
3. Each shot is normalised and validated:
   - `shotType` — Wide / Medium / Close-up / Extreme Close-up / POV / Over-the-shoulder
   - `cameraAngle` — Eye-level / High / Low / Dutch / Bird's-eye / Worm's-eye
   - `movement` — Static / Pan / Tilt / Zoom / Dolly / Tracking / Handheld
   - `duration` — 3–8 seconds (clamped)
   - `description` — narrative-focused, describes character action and camera reveal
   - `emotion`, `lighting`, `scriptSegment` (voiceover text for that shot)
4. Shots are merged across all scenes and stored in `storyState.shotlist`.

**A progress callback fires for each scene** so you see `"Scene 2 / 5 shots generated"`.

### What you can change
- Open the **Shot Editor Modal** (pencil icon or press `E` in storyboard view) to edit any shot's:
  - ERT (duration estimate), shot type, camera angle, movement, equipment, focal length, aspect ratio, notes, description, dialogue
- Save edits via **Save** — the `updateShot()` action merges changes into the shotlist with undo/redo history.
- Retry image generation for a specific shot.

---

## Step 5 — Style Selection

**Trigger:** Click **Continue** on the Shots tab
**Hook action:** `storyHook.setStep('style')`

The `StyleSelector` UI lets you pick:
- **Visual style** (Cinematic, Anime, Oil Painting, Watercolour, Photorealistic, etc.)
- **Aspect ratio** (16:9, 9:16, 1:1, 4:3)
- **Image provider** (Gemini Imagen or DeAPI)

These selections are stored in `storyState.visualStyle`, `storyState.aspectRatio`, `storyState.imageProvider` and are used in every image generation call that follows.

---

## Step 6 — Shot List → Storyboard Visuals

**Trigger:** Click **Generate Storyboard** on the Style tab
**Hook action:** `storyHook.generateVisuals(sceneIndex?)`
**Service:** `storyPipeline.ts` → `generateSceneVisuals()` OR `deapiService.ts`
**Model:** `imagen-4.0-fast-generate-001` (Gemini Imagen) or DeAPI

### What happens (per shot, one at a time)

1. The shot's description, character anchors (compact facial tags), emotional vibe, and visual style are assembled into a `buildImageStyleGuide()` structured object.
2. An image generation request fires to:
   - **Gemini Imagen** (default): `generateImageFromPrompt()` via the server proxy at `/api/gemini`
   - **DeAPI**: `generateImageWithAspectRatio()` → direct API call
3. The returned URL is stored on the `ShotlistEntry` as `imageUrl`.
4. If cloud autosave is active, the image is uploaded to Firebase Storage and the cloud URL replaces the temporary one.

The `StoryboardProgress` component shows three sub-stages: *Generating Shot List → Preparing Cast → Rendering Storyboard*.

### What you can change
- View shots in the full-screen `StoryboardView` (cinematic viewer with floating info panel).
- Press `E` or click **Edit Shot** to open the Shot Editor Modal and regenerate with a custom prompt.
- Click **Retry** in the Shot Editor to regenerate the image for that shot only (`regenerateShotVisual(shotId, customPrompt?)`).

---

## Step 7 — Narration Generation

**Trigger:** Click **Generate Narration** on the Storyboard or Narration tab
**Hook action:** `storyHook.generateNarration()`
**Service:** `storyPipeline.ts` → `generateVoiceoverScripts()` → `narratorService.ts` → `narrateScene()`
**Models:** `gemini-2.5-flash-preview` (voiceover scripts), `gemini-2.5-flash-preview-tts` (audio)

### What happens

**Part A — Voiceover script rewriting:**
1. All scenes are sent to the LLM in a single call (but only action text + emotional mood — not images).
2. The LLM rewrites camera-facing action descriptions into **spoken narrator prose**, inserting delivery markers:
   - `[pause: beat]`, `[pause: long]` — for timing
   - `[emphasis]word[/emphasis]` — for key moments
   - `[rising-tension]...[/rising-tension]`, `[slow]...`, `[whisper]...` — for emotion
   - `[breath]` — before long passages
3. A `Map<sceneId, voiceoverScript>` is returned. If the LLM call fails, raw action text is used as fallback.

**Part B — TTS audio generation (one scene at a time):**
1. The voiceover script for each scene is sent to `narrateScene()`.
2. Language-aware voice selection happens here: `"Kore"` for English, `"Charon"` for Arabic.
3. Gemini 2.5 Flash TTS generates a WAV audio blob.
4. Duration is measured, a subtitle-safe transcript is extracted, and both are stored in `narrationSegments`.

### What you can change
- Individual scene narration can be regenerated with `storyHook.regenerateShotVisual()`.

---

## Step 8 — Animation

**Trigger:** Click **Animate** on the Animation tab (or per-shot play button)
**Hook action:** `storyHook.animateShots(shotIndex?)`
**Service:** `deapiService.ts` → `animateImageWithDeApi()` or `videoService.ts` → `generateVideoFromPrompt()`

### What happens

For each storyboard frame:
1. The still image (data URL) is sent to:
   - **DeAPI** (default): `animateImageWithDeApi()` — image-to-video, returns a short MP4 clip.
   - **Gemini Veo** (if configured): `generateVideoFromPrompt()` — text+image-to-video.
2. The resulting video URL is stored in `storyState.animatedShots`.
3. Per-shot progress is tracked with `animatingShotIds` (a `Set<string>`) — a spinner overlays each card while its shot is animating.

### What you can change
- Animate individual shots by clicking the play button on any unanimated frame.
- Unanimated shots fall back to their still image in the final export.

---

## Step 9 — Export

**Trigger:** Click **Export Video** on the Export tab
**Hook action:** `storyHook.exportFinalVideo()` → `exportVideoWithFFmpeg()`
**Service:** `services/ffmpeg/exporters.ts` → Express server at `/api/export`

### What happens (server-side FFmpeg)

1. All assets are assembled into the export payload:
   - Animated video clips (or still images if not animated)
   - Narration WAV blobs merged in scene order
   - Subtitle cues (from narration transcripts, paginated to ~120 chars each)
   - Optional background music
2. The payload is sent to the Express server in three HTTP calls:
   - `POST /api/export/init` — initialise job, upload audio
   - `POST /api/export/chunk` — upload each visual frame
   - `POST /api/export/finalize` — trigger FFmpeg render
3. Progress flows back via **SSE** (`/api/export/events/:jobId`) — the UI shows a progress bar with stages: `loading → preparing → rendering → encoding → complete`.
4. The finished MP4 blob is downloaded to the user's device.

**Export config options** (set in `ExportOptionsPanel` or `QuickExport`):
- Orientation (landscape / portrait)
- Transition type (dissolve, cut, fade)
- Transition duration
- Content mode (`story` — uses 34px subtitle font vs. 42px for music)

> **Mobile note:** On real iOS/Android devices, set `VITE_SERVER_URL=http://<your-pc-ip>:3001` in `.env.local` before building — the device needs the LAN address to reach the server.

---

## Supplementary Actions

### Undo / Redo
Every state mutation goes through `pushState()` which appends to a `past[]` stack. `undo()` and `redo()` navigate this stack. The toolbar shows ← / → buttons whenever `canUndo` or `canRedo` is true.

### Version History
`VersionHistoryPanel` shows a timeline of all `pushState` snapshots for the current session. You can click any entry to restore that exact state.

### Templates Gallery
`TemplatesGallery` lets you start from a pre-built story template (applies a partial `StoryState` via `applyTemplate()`).

### Import / Export Project
The `ExportOptionsPanel` lets you:
- **Export JSON** — full project state as a portable file.
- **Import JSON** — restore a previously exported project.
- **Export SRT / VTT** — subtitle files from the shot narration segments.
- **Export MP4** — the full rendered video.

### Open in Editor
The **Open in Editor** button in `StudioScreen` populates the `VideoEditor` Zustand store with the story's scenes (video track) and narrations (audio track) then switches to `studioMode = 'editor'` — the full multi-track timeline editor.

---

## State & Persistence Summary

| Storage | Key / Location | What's stored |
|---------|---------------|---------------|
| localStorage | `ai_soul_studio_story_state` | Full `StoryState` (all steps) |
| localStorage | `ai_soul_studio_story_project_id` | Active project ID for isolation |
| Zustand (IndexedDB) | `storyModeStore` | Session-level state shared across components |
| Firebase Firestore | `storySync.ts` | Cloud autosave of story state |
| Firebase Storage | Cloud URLs on `ShotlistEntry.imageUrl` | Generated images |

---

## AI Models Used

| Step | Model | Purpose |
|------|-------|---------|
| Breakdown, Screenplay, Characters, Voiceover, Shots | `gemini-2.5-flash-preview` | All text generation |
| Storyboard images | `imagen-4.0-fast-generate-001` | Still image generation |
| Narration audio | `gemini-2.5-flash-preview-tts` | Text-to-speech |
| Animation | DeAPI or `veo-3.1-fast-generate-preview` | Image-to-video / text-to-video |
| Export rendering | FFmpeg (server-side) | Video assembly |

---

## Common Modification Points

If you want to change the pipeline behaviour, here are the key locations:

| What to change | Where |
|----------------|-------|
| Number of acts (3–5) | `BreakdownSchema` min/max in `storyPipeline.ts:38` |
| Number of scenes (3–8) | `ScreenplaySchema` min/max in `storyPipeline.ts:59` |
| Shots per scene (4–6) | `SHOT_BREAKDOWN_PROMPT` instruction in `shotBreakdownAgent.ts:136` |
| Shot duration range (3–8s) | `normalizeShot()` in `shotBreakdownAgent.ts:205` |
| TTS voice selection | `narrateScene()` in `narratorService.ts` |
| Subtitle max length (~120 chars) | `useStoryGeneration.ts` narration handler |
| Visual style options | `StyleSelector.tsx` |
| Export transitions | `DEFAULT_EXPORT_CONFIG` in `exportConfig.ts` |
| Image generation model | `MODELS.IMAGE` in `shared/apiClient.ts` |
| Text generation model | `MODELS.TEXT` in `shared/apiClient.ts` |
| Prompt templates | `services/prompt/templates/movie-animation/*.txt` |
