# Media Generation

**Last Updated:** 2026-03-26
**Entry Points:**
- `packages/shared/src/services/imageService.ts` — Imagen/Gemini image generation
- `packages/shared/src/services/videoService.ts` — Veo 3.1 video generation

---

## Overview

Generated media flows through three stages before reaching the export pipeline:

```
Prompt text
    |
    v
imageService / videoService     (AI generation)
    |
    v
SongData.generatedImages[]      (stored as base64 data URLs or remote URIs)
    |
    v
assetLoader.preloadAssets()     (decoded into HTMLImageElement / HTMLVideoElement)
    |
    v
renderPipeline / frameRenderer  (composited onto canvas frames)
```

Each stage is decoupled: the generation services return URLs or data URLs, the asset loader converts them to drawable DOM elements, and the render pipeline never calls the generation services directly.

---

## ImageService

**File:** `packages/shared/src/services/imageService.ts`
**Model:** `MODELS.IMAGE` = `imagen-4.0-fast-generate-001` (defined in `apiClient.ts`)

### generateImageFromPrompt

The primary entry point for all scene image generation. It is wrapped with `traceAsync` for LangSmith tracing.

```typescript
generateImageFromPrompt(
    promptText: string,
    style: string = "Cinematic",
    globalSubject: string = "",
    aspectRatio: string = "16:9",
    skipRefine: boolean = false,
    seed?: number,
    sessionId?: string,
    sceneIndex?: number,
    prebuiltGuide?: ImageStyleGuide,
): Promise<string>   // returns data:image/png;base64,... or equivalent
```

**Processing sequence (no prebuiltGuide):**

1. `refineImagePrompt` — lightweight lint + optional AI refinement. Pass `skipRefine: true` when the caller has already refined the prompt upstream (e.g., bulk generation that handles cross-scene context).
2. `buildImageStyleGuide` — wraps the refined prompt in a structured style guide object.
3. `serializeStyleGuideAsText` — converts the guide to a natural-language prompt string.
4. `compressPromptForGeneration` — trims the prompt if it would cause instruction dilution (story-mode scene descriptions can exceed 200 words).
5. Character seed resolution (see below).
6. Dispatches to `generateWithImagenAPI` or `generateWithGeminiAPI` based on `MODELS.IMAGE`.

When `prebuiltGuide` is provided the refinement and guide-building steps are skipped entirely, preventing double-wrapping when the caller has already constructed a guide with cross-scene context.

The whole function body runs inside `withRetry`, which retries on HTTP 500/503/429 and on error messages containing `"INTERNAL"` or `"fetch failed"`.

### Style guide integration

`buildImageStyleGuide({ scene, style, globalSubject })` returns an `ImageStyleGuide` object that encodes:
- Art direction (style preset, lighting, color palette)
- Subject description (`globalSubject` for character consistency)
- Scene composition instructions

`serializeStyleGuideAsText` converts this object to a single natural-language string sent to the model. Using the serialized guide as the prompt ensures consistent framing across all scenes in a project.

### Imagen API gotchas

**The `seed` parameter is not supported for `imagen-4.0` via the `@google/genai` SDK.**

The `generateWithImagenAPI` function accepts a `_seed` parameter for signature compatibility but never includes it in the API config object. Attempts to pass `seed` cause an SDK validation error. Character consistency is achieved instead by embedding detailed physical descriptions in the prompt text.

```typescript
// WRONG — will throw
const config = { numberOfImages: 1, aspectRatio, seed: 12345 };

// CORRECT — seed is omitted entirely
const config = { numberOfImages: 1, aspectRatio, personGeneration: "allow_adult" };
```

**Safety filtering:** If the API returns `img.raiFilteredReason`, `generateWithImagenAPI` throws with the filter reason rather than returning a placeholder. Callers should handle this error and either retry with a modified prompt or use a fallback.

### Character seed registry

`getCharacterSeed(characterDescription)` maintains a module-level `Map<key, CharacterSeed>` that assigns a consistent random integer to each unique character description. The key is derived by normalizing the description to lowercase, stripping punctuation, and joining the first 10 meaningful words with underscores — word order is preserved intentionally (sorted keys were removed to avoid conflating `"young woman"` and `"woman young"`).

The seed value is passed to `generateImageFromPrompt` but, as noted above, the Imagen API ignores it. The registry primarily serves as a record of which seed was intended; character consistency in practice relies on the prompt text carrying the physical description.

Clear the registry between projects with `clearCharacterSeeds()`.

### Model dispatch

```typescript
if (isImagenModel(MODELS.IMAGE)) {
    // uses ai.models.generateImages({ model, prompt, config })
    // returns generatedImages[0].image.imageBytes as base64
} else {
    // uses ai.models.generateContent({ model, contents, config })
    // returns candidates[0].content.parts[inlineData].data as base64
}
```

Both paths return a `data:image/png;base64,...` string. The caller stores this in `SongData.generatedImages[].imageUrl`.

### Additional generation modes

| Function | Purpose |
|----------|---------|
| `sketchToImage(sketchBase64, promptText, style, aspectRatio)` | Transforms a sketch into a detailed image while preserving composition. Uses the Gemini API (not Imagen). |
| `generateWithStyleReference(styleReferenceBase64, promptText, aspectRatio)` | Generates a new scene matching the art style, palette, and texture of a reference image. |

Both functions build a style guide internally and call `ai.models.generateContent` with an `inlineData` part carrying the reference image.

### Cloud autosave

After a successful generation, `cloudAutosave.saveImage(sessionId, imageUrl, sceneIndex)` is called as a fire-and-forget non-blocking side effect. Failures are logged as warnings and do not propagate.

---

## VideoService

**File:** `packages/shared/src/services/videoService.ts`
**Models:** `veo-3.1-fast-generate-preview` (default) and `veo-3.1-generate-preview` (standard quality)

### generateVideoFromPrompt

```typescript
generateVideoFromPrompt(
    promptText: string,
    style: string = "Cinematic",
    globalSubject: string = "",
    aspectRatio: "16:9" | "9:16" = "16:9",
    durationSeconds: 4 | 6 | 8 = 8,
    useFastModel: boolean = true,
    outputGcsUri?: string,
    sessionId?: string,
    sceneIndex?: number,
): Promise<string>   // returns URI with API key appended, or data:video/mp4;base64,...
```

**Processing sequence:**

1. Prepends the style modifier from `VIDEO_STYLE_MODIFIERS[style]` to the prompt.
2. Validates `durationSeconds` is one of `[4, 6, 8]`; clamps to 8 otherwise.
3. Calls `ai.models.generateVideos` which returns a long-running operation object.
4. Polls `ai.operations.getVideosOperation` every 15 seconds for up to 60 attempts (15 minutes total timeout).
5. Extracts the video from the completed operation — handles three response formats for API version compatibility (see note below).
6. Returns a URI with `?key=<API_KEY>` appended, or a `data:video/mp4;base64,...` string for inline responses.
7. Triggers cloud autosave and thumbnail extraction as fire-and-forget side effects.

**Veo API quirks:**

The service handles three response shapes because the Veo API has varied its structure across SDK versions:
- `{ generatedVideos: [{ video: {...} }] }` — current format
- `{ video: {...} }` — older direct format
- `{ generateVideoResponse: { generatedSamples: [...] } }` — REST API format

Polling uses `getVideosOperation` with a fallback to the generic `get` method for backward compatibility.

**Duration constraint:** Veo 3.1 only accepts 4, 6, or 8 seconds. Any other value is coerced to 8 with a warning.

**Access requirements:** Veo 3.1 requires a paid Gemini API plan and accepted terms of service. The service surfaces helpful error messages for `404` (model not found), `403` (permission denied), and `429` (rate limit) responses.

### generateProfessionalVideo

Wraps `generateVideoFromPrompt` with an AI-powered prompt enhancement step. Calls `generateProfessionalVideoPrompt(sceneDescription, style, mood, globalSubject, videoPurpose, durationSeconds)` from `promptService.ts` to expand a short scene description into a cinematographer-grade prompt before passing it to Veo.

### generateVideoWithEnhancement

Auto-detects whether the input prompt is already professional-grade by checking:
- Word count > 80
- Presence of camera motion keywords (`dolly`, `tracking`, `pan`, etc.)
- Presence of lighting keywords (`golden hour`, `backlight`, etc.)
- Presence of technical keywords (`35mm`, `bokeh`, `shallow depth`, etc.)

If the prompt is not professional, it calls `generateProfessionalVideo`. Otherwise it calls `generateVideoFromPrompt` directly.

### fetchAndCacheAsBlob

Veo returns temporary signed URIs that can expire before re-export. `fetchAndCacheAsBlob(videoUrl)` fetches the video and returns a `blob:` URL that persists until the page is closed. Skip this for URLs already starting with `blob:` or `data:`.

```typescript
// Before storing in SongData for long-lived projects:
const blobUrl = await fetchAndCacheAsBlob(videoUri);
generatedImage.cachedBlobUrl = blobUrl;
```

`preloadAssets` in `assetLoader.ts` already prefers `cachedBlobUrl` over `imageUrl` when building `RenderAsset` entries.

### Thumbnail extraction

After video generation succeeds, `extractVideoThumbnail` runs in the browser to capture the first frame as a PNG and saves it via `cloudAutosave.saveAsset`. This provides a visual fallback for scenes where the video URL is not yet loaded. The function is a no-op in server/Node.js environments.

---

## Image Flow: Generation to Rendered Frame

```
1. Pipeline calls generateImageFromPrompt(prompt, style, ...)
   └── returns "data:image/png;base64,..."

2. Pipeline stores result in SongData.generatedImages:
   { promptId, imageUrl: "data:image/png;base64,...", type: "image" }

3. exportVideoWithFFmpeg calls preloadAssets(songData, { width, height })
   └── builds Map<promptId, generatedImage> for O(1) lookup
   └── calls loadImageAsset(imageUrl) for each prompt
       └── validates naturalWidth/naturalHeight > 0
       └── pre-computes baseScale = max(W/naturalW, H/naturalH)
   └── returns RenderAsset[] sorted by timestampSeconds

4. runRenderPipeline calls renderFrameToCanvas on each frame
   └── findActiveAssetIndex → cursor scan → currentAsset
   └── drawAsset(ctx, currentAsset, ...)
       └── ctx.drawImage(element, x, y, drawWidth, drawHeight)
           with Ken Burns transform applied via canvas transform
```

## Video Flow: Generation to Rendered Frame

```
1. Pipeline calls generateVideoFromPrompt(prompt, ...)
   └── returns "https://...?key=..." or "data:video/mp4;base64,..."

2. fetchAndCacheAsBlob converts to blob URL (prevents expiry during long exports)
   generatedImage.cachedBlobUrl = blobUrl
   generatedImage.type = "video"

3. preloadAssets calls loadVideoAsset(blobUrl)
   └── onloadedmetadata: validates dimensions + duration
   └── play/pause cycle to prime decoder
   └── stores element, nativeDuration, baseScale in RenderAsset

4. renderFrameToCanvas detects asset.type === "video"
   └── pre-seeks video element TRANSITION_DURATION + 1.5s before cut
   └── drawAsset calls seekVideoToTime(vid, relativeTime)
       └── caches frame as ImageBitmap via getVideoFrameAtTime
   └── ctx.drawImage(videoElement, x, y, drawWidth, drawHeight)
```

---

## Related Areas

- `docs/services/ffmpeg-pipeline.md` — render pipeline, asset loader, exporters
- `packages/shared/src/services/prompt/imageStyleGuide.ts` — style guide builder and serializer
- `packages/shared/src/services/promptService.ts` — prompt refinement, compression, video prompt enhancement
- `packages/shared/src/services/shared/apiClient.ts` — `MODELS` constants, `withRetry`, `ai` instance
