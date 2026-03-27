# FFmpeg Pipeline

**Last Updated:** 2026-03-26
**Entry Points:**
- `packages/shared/src/services/ffmpeg/exporters.ts` — public API for both export paths
- `packages/shared/src/services/ffmpeg/renderPipeline.ts` — shared frame loop
- `packages/shared/src/services/ffmpeg/exportConfig.ts` — configuration types and defaults

---

## Overview: Two Export Modes

The pipeline has two distinct execution paths that share the same canvas rendering core.

```
exportVideoWithFFmpeg (server-side)          exportVideoClientSide (WASM)
        |                                              |
  initExportSession                             FFmpeg.load() (WASM binary)
        |                                              |
  preloadAssets ─────────────────────── preloadAssets
        |                                              |
  runRenderPipeline ─────────────────── runRenderPipeline
  (onFrame: uploadFrameBatch)           (onFrame: ffmpeg.writeFile)
        |                                              |
  finalizeAndDownload                   ffmpeg.exec (libx264 encode)
        |                                              |
  persistExport ──────────────────────── persistExport
```

**Server-side FFmpeg** is the primary path. Rendered frames are batch-uploaded to the Express server (`/api/export`), which runs native FFmpeg to encode the final MP4. Progress reports include a `renderedAt` timestamp for latency tracking.

**Browser WASM** is the fallback. The `@ffmpeg/ffmpeg` WASM binary runs entirely in the browser. It is not available in Capacitor WebViews; use server-side export there. The WASM path also omits COOP/COEP headers in dev to avoid breaking Firebase Auth popups.

**When each is used:** The calling code in `StudioScreen.tsx` decides which function to call. Capacitor builds and environments where the server is reachable use `exportVideoWithFFmpeg`. Offline-capable browser sessions fall back to `exportVideoClientSide`.

---

## ExportConfig

**File:** `packages/shared/src/services/ffmpeg/exportConfig.ts`

All rendering and encoding decisions flow through `ExportConfig`. Call `mergeExportConfig(partial)` before passing config anywhere in the pipeline.

```typescript
interface ExportConfig {
    orientation: "landscape" | "portrait";   // drives resolution and layout zones
    quality?: "draft" | "standard" | "high"; // maps to CRF 28 / 21 / 18
    useModernEffects: boolean;               // Ken Burns, glow, gradient overlay
    syncOffsetMs: number;                    // subtitle timing correction (default: -50)
    fadeOutBeforeCut: boolean;               // fade subtitle opacity 300ms before cut
    wordLevelHighlight: boolean;             // karaoke-style per-word highlight
    contentMode: "music" | "story";          // story = smaller font, no bg box
    transitionType: TransitionType;          // fade | dissolve | zoom | slide | none
    transitionDuration: number;              // seconds (default: 1.5)
    visualizerConfig?: { ... };             // frequency bar config (music mode only)
    textAnimationConfig?: { ... };          // wipe reveal direction and timing
    sfxPlan?: VideoSFXPlan | null;          // sound effects
    formatId?: VideoFormat;                  // drives assembly rules
    assemblyRules?: FormatAssemblyRules;     // pre-built, overrides formatId
}
```

### mergeExportConfig validation

`mergeExportConfig` enforces three fields with hard validation:

- **orientation** — must be exactly `"landscape"` or `"portrait"`; any other value falls back to `"landscape"`.
- **transitionDuration** — must be a finite number `>= 0`; otherwise defaults to `1.5`.
- **syncOffsetMs** — must be a finite number; otherwise defaults to `-50`.

All other fields use a shallow spread over `DEFAULT_EXPORT_CONFIG`, with `visualizerConfig` and `textAnimationConfig` merged one level deep so callers can override individual sub-fields.

### Resolution

`getExportDimensions` returns `{ width, height }`:
- Explicit `config.width` + `config.height` override everything.
- `portrait` → 1080 × 1920.
- `landscape` → 1920 × 1080.

### Quality CRF mapping

| Preset     | CRF |
|------------|-----|
| `"draft"`    | 28  |
| `"standard"` | 21  |
| `"high"`     | 18  |

---

## RenderPipeline

**File:** `packages/shared/src/services/ffmpeg/renderPipeline.ts`

`runRenderPipeline` is the shared frame loop used by both export paths. It creates its own canvas and drives frame rendering at 24 FPS. Frame blobs are emitted via the `onFrame` callback — the caller decides whether to upload them to the server or write them to the WASM virtual filesystem.

### Key design decisions

**Double-buffering:** Two canvas surfaces alternate on each frame (`surfaceIndex = frame % 2`). While frame N is being rendered onto surface A, frame N-1 is being encoded to JPEG from surface B. This overlaps render and encode work.

```typescript
// Simplified loop structure
for (let frame = 0; frame < totalFrames; frame++) {
    const surfaceIndex = frame % 2;
    // Kick off JPEG encoding of the previous surface
    pendingEncode = canvasToBlob(surfaces[1 - surfaceIndex].canvas);

    // Render current frame to the current surface
    await renderFrameToCanvas(surfaces[surfaceIndex].ctx, ...);

    // Await the previously kicked-off encode and emit to caller
    if (pendingEncode) {
        const blob = await pendingEncode;
        await onFrame(blob, pendingFrameIndex, pendingFrameName);
    }
}
```

**Progress reporting:** `onProgress` fires once per second of rendered video (`frame % FPS === 0`). It receives the current active asset, enabling the UI to display which scene is currently rendering.

**Frame naming:** Frame files follow the pattern `frame000000.jpg` (6-digit zero-padded index), which FFmpeg's glob input (`frame%06d.jpg`) requires.

**Canvas surface:** Uses `OffscreenCanvas` when available (workers, Chrome, Firefox) and falls back to a DOM canvas. Both produce the same output. JPEG quality is fixed at 0.98.

**findActiveAsset:** Exported helper that locates the current asset with an early-break linear scan over a time-sorted array. The render pipeline passes this result to `renderFrameToCanvas`.

---

## FrameRenderer

**File:** `packages/shared/src/services/ffmpeg/frameRenderer.ts`

`renderFrameToCanvas` composes a single frame in five layers:

```
1. Black background fill
2. Visual layer (image/video + Ken Burns + transition)
3. Visualizer bars (music mode only)
4. Gradient overlay
5. Subtitles (karaoke highlight + optional translation)
```

### Asset index lookup

`findActiveAssetIndex` uses a **bi-directional cursor scan** starting from the previous frame's `state.assetIndex`. Because assets are sorted ascending by time and playback is sequential, the cursor almost never moves more than one position per frame, making this effectively O(1) in normal playback. The state object is mutated in-place across frames:

```typescript
export interface RenderFrameState {
    assetIndex: number;
    subtitleIndex: number;
    preseekedAssetIndex?: number;
}
```

The same pattern applies to `findActiveSubtitleIndex`, which walks the subtitle array forward and backward relative to `adjustedTime = currentTime + config.syncOffsetMs / 1000`.

### Video pre-seek

When a video asset is `TRANSITION_DURATION + 1.5s` away from becoming active, `renderFrameToCanvas` pre-seeks the video element to its start time. This hides seek latency behind the current scene's remaining display time. The pre-seek fires only once per asset (tracked via `state.preseekedAssetIndex`).

### Subtitle rendering

Subtitle layout differs by `contentMode`:

| Property | `"music"` | `"story"` |
|----------|-----------|-----------|
| Font size (landscape) | 42 px | 28 px |
| Background | Rounded opaque box | None |
| Text style | Modern glow or simple | Netflix outline + shadow |
| Max lines | Unlimited wrap | 2 lines, ellipsis truncation |
| Vertical position | Zone center | 82% of canvas height |

Word-level karaoke highlighting: each word's progress is calculated from `activeSub.words[i].startTime/endTime` when word timing is available, or proportionally from character offsets as a fallback. The active word gets a glow effect; already-spoken words render fully white; unspoken words render at 70% opacity.

RTL text (Arabic) is detected via `isRTL()` and reshaped via `reshapeArabicText()` before layout. Word positions are mirrored and advance right-to-left.

---

## AssetLoader

**File:** `packages/shared/src/services/ffmpeg/assetLoader.ts`

### Image loading

`loadImageAsset(url, timeoutMs)` creates an `<img>` element and waits for `onload`. It validates that `naturalWidth > 0` and `naturalHeight > 0` before resolving — a zero-dimension image would silently corrupt rendered frames. Default timeout is 60 seconds (raised from 15s to handle large Veo video blobs).

### Video loading

`loadVideoAsset(url, timeoutMs)` loads via `onloadedmetadata`, validates both dimensions and duration, then primes the decoder with a play/pause cycle before returning. This ensures seeking works reliably during export. The video element is muted (audio is handled separately by the audio preparation stage).

`loadVideoAssetWithMetadata` wraps `loadVideoAsset` and additionally detects audio tracks via browser-specific properties (`mozHasAudio`, `webkitAudioDecodedByteCount`).

### Parallel preloading

`preloadAssets(songData, renderDimensions, onProgress)` builds the `RenderAsset[]` array used by the render loop:

1. Sorts prompts by `timestampSeconds` ascending.
2. Pre-indexes `generatedImages` by `promptId` in a `Map` for O(1) lookup per prompt (avoids an O(n²) scan over the generated images array).
3. Runs up to 4 concurrent loads (`PRELOAD_CONCURRENCY = 4`).
4. On load failure, inserts a placeholder canvas image so the render loop always has something to draw.
5. Logs a `BUG:` warning if all assets end up with the same timestamp — this causes only the last image to display.

`baseScale` is pre-computed for each asset: `Math.max(width / naturalWidth, height / naturalHeight)`, which is the minimum scale needed to cover the canvas without letterboxing.

### LRU video frame cache

`videoFrameCache` is a module-level `Map<string, CachedFrameEntry>` that stores `ImageBitmap` objects extracted from video elements.

| Parameter | Value |
|-----------|-------|
| Budget | 384 MB |
| TTL | 30 seconds |
| Eviction | LRU (Map insertion order), expired entries purged first |
| Key | `${videoSrc}:${frameIndex}` where `frameIndex = Math.floor(time * 24)` |

Cache entries store estimated byte size as `width * height * 4` (RGBA). On every insertion, expired entries are evicted first, then LRU entries are removed until the new entry fits within the 384 MB budget. Frames larger than the entire budget are not cached. Call `clearFrameCache()` after export to close all `ImageBitmap` handles and prevent memory leaks.

`getCachedFrame` re-inserts on hit (delete + set) to maintain LRU order in the Map.

---

## Exporters

**File:** `packages/shared/src/services/ffmpeg/exporters.ts`

### exportVideoWithFFmpeg (server path)

Stages and their progress ranges:

| Stage | Progress |
|-------|---------|
| Audio analysis + session init | 0–20% |
| Asset preloading | 20–30% |
| Frame rendering | 0–90% of `rendering` stage |
| Encoding (server-side) | 90% |
| Complete | 100% |

Frames are buffered in memory and flushed to the server in batches of 96 (`BATCH_SIZE = 96`). Upload and rendering run concurrently: while the next batch is being rendered, the previous batch is uploading. If an upload error occurs it is stored and re-thrown after `runRenderPipeline` completes (the render loop checks `uploadError` on each batch boundary).

### exportVideoClientSide (WASM path)

Loads the WASM binary from `unpkg.com/@ffmpeg/core@0.12.10`. Each rendered frame blob is written directly to the WASM virtual filesystem via `ffmpeg.writeFile(name, ...)`. After all frames are written, encoding runs with:

```
ffmpeg -framerate 24 -i frame%06d.jpg -i audio.wav
       -c:v libx264 -c:a aac -b:a 256k
       -pix_fmt yuv420p
       -vf scale=W:H:flags=lanczos,setsar=1
       -shortest -preset medium -crf <qualityValue>
       output.mp4
```

FFmpeg WASM log lines matching `frame=\s*(\d+)` drive the encoding progress callback (80–100%). All written files are deleted in a `finally` block.

**Both paths** call `clearFrameCache()` and `audioContext.close()` in their `finally` blocks regardless of success or failure.

---

## Transitions

**File:** `packages/shared/src/services/ffmpeg/transitions.ts`

### drawAsset

`drawAsset` draws a single image or video frame onto the canvas with optional Ken Burns motion. For video assets it calls `seekVideoToTime` before drawing.

**Video seek behavior:** `seekVideoToTime` resolves on the `seeked` event. If the seek times out (2 seconds) or fires an error event, it **resolves rather than rejects** — export continues with whatever frame the video is currently showing. This can produce a blank or stale frame if the browser's video decoder is overloaded, but it prevents the entire export from failing.

**Freeze on video end:** If `asset.nativeDuration` is set and the relative playback time exceeds it, the video is frozen at `nativeDuration - 0.05s` instead of looping. This prevents desync for Veo-generated clips that are shorter than their assigned scene duration.

### Ken Burns

Ten movement types are available: `zoom_in`, `zoom_out`, `pan_left`, `pan_right`, `pan_up`, `pan_down`, and four compound moves. The movement assigned to an asset is deterministic — derived from an FNV-1a hash of `asset.id`. Progress is eased through a 1024-entry lookup table (`EASING_LUT`) that precomputes `easeInOutCubic` values at module load time.

### applyTransition

`applyTransition` dispatches on `config.transitionType`:

| Type | Behavior |
|------|---------|
| `fade` | First half: current fades to black. Second half: next fades from black. |
| `dissolve` | Both assets drawn simultaneously; next opacity ramps 0→1. |
| `zoom` | Current scales to 1.5x while fading out; next fades in underneath. |
| `slide` | Current translates left; next enters from right. |
| `none` | Handled upstream in `frameRenderer.ts` — `applyTransition` never called. |

`transitionProgress` (`t`) is computed as `1 - timeUntilNext / TRANSITION_DURATION` in `renderFrameToCanvas` and ranges 0→1 over the transition window.

**Known gotcha — blank frame on seek failure:** When `applyTransition` draws the `nextAsset` for the first time during a transition, it calls `drawAsset` which seeks the video. If the seek times out (resolved silently), the video element may still be at frame 0 or wherever it last landed. This can produce a visible flash for one or two frames at the transition boundary.

---

## FormatAssembly

**File:** `packages/shared/src/services/ffmpeg/formatAssembly.ts`

Pure utility functions for format-aware export configuration. These are called by format-specific pipelines before constructing `ExportConfig`.

### buildAssemblyRules

Looks up format metadata from `formatRegistry` and returns a `FormatAssemblyRules` object. Conditionally attaches:

- `ctaMarker` for `advertisement` — CTA positioned in the final 5 seconds via `buildCTAMarker`.
- `chapters` + `useChapterStructure` for `documentary` — one chapter per `ScreenplayScene`.
- `beatMetadata` + `useBeatSync` for `music-video`.

Default transitions by format:

| Format | Transition | Duration |
|--------|-----------|---------|
| advertisement, shorts | none | 0.3s |
| documentary, youtube-narrator | dissolve | 1.5s |
| music-video | fade | 0.5s |
| news-politics | slide | 1.0s |
| others | dissolve | 1.0s |

### buildChapterMarkers

Converts `ScreenplayScene[]` + `sceneDurations[]` into `ChapterMarker[]` with cumulative `startTime`/`endTime`. Scenes with zero duration are skipped. `validateChapterSequence` checks that markers are non-overlapping and have positive duration.

### generateBeatMetadata

Synthesizes evenly-spaced `BeatEvent[]` from BPM and duration when no real beat detection data is available. Beat intensity pattern: downbeats (every 4th) = 1.0, half-beats = 0.6, quarter-beats = 0.3.

### alignTransitionsToBeat

Snaps an array of transition timestamps to the nearest beat within a 100ms tolerance. Transitions outside the tolerance window are left at their original position.

```typescript
// Snap all scene boundaries to the nearest beat
const snapped = alignTransitionsToBeat(sceneStartTimes, beatMetadata.beats, 100);
```

---

## Related Areas

- `docs/services/media-generation.md` — image and video generation upstream of the pipeline
- `packages/shared/src/services/ffmpeg/audioPreparation.ts` — audio fetch, SFX mixing, frequency extraction
- `packages/shared/src/services/ffmpeg/exportUpload.ts` — server session init, batch upload, finalize/download
- `packages/server/workers/ffmpegWorker.ts` — server-side worker that receives uploaded frames and runs native FFmpeg
