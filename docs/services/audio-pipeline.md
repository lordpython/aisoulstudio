# Audio Pipeline Services

**Last Updated:** 2026-03-26
**Entry Points:**
- `packages/shared/src/services/narratorService.ts`
- `packages/shared/src/services/audioMixerService.ts`
- `packages/shared/src/services/audioConcatService.ts`

---

## Overview: Three-Layer Pipeline

Audio production flows through three sequential stages:

```
Scene narrationScript
        |
        v
[ NarratorService ]  — TTS (Gemini / DeAPI Qwen3) → WAV blobs per scene
        |
        v
[ AudioConcatService ] — Concatenate per-scene WAV blobs → single narration WAV
        |
        v
[ AudioMixerService ]  — Mix narration + SFX + background music → final WAV
```

Each layer is independently callable. Pipelines run all three in sequence during
Phase 4 (audio) and Phase 5 (assembly). The export flow in `exportConfig.ts` /
`exportUpload.ts` receives the final WAV from the mixer and passes it to FFmpeg.

---

## NarratorService

**File:** `packages/shared/src/services/narratorService.ts`

Converts scene narration scripts to speech audio using the Gemini 3.1 Flash TTS
model (`gemini-3.1-flash-tts-preview`) or the DeAPI Qwen3 TTS model as an
alternative provider.

### TTS Rate-Limit Gate (Slot / Mutex)

Gemini TTS is rate-limited. A module-level promise chain serializes all callers
globally so only one TTS call runs at a time with a mandatory 2-second cooldown
between calls.

```typescript
// Simplified implementation in narratorService.ts
let _ttsGate: Promise<void> = Promise.resolve();
const TTS_INTER_CALL_DELAY_MS = 2000;

async function acquireTtsSlot(): Promise<() => void> {
    let releaseCallback!: () => void;
    const thisSlot = new Promise<void>(resolve => { releaseCallback = resolve; });
    const prevGate = _ttsGate;
    _ttsGate = prevGate.then(() => thisSlot);
    await prevGate;
    return () => { setTimeout(releaseCallback, TTS_INTER_CALL_DELAY_MS); };
}
```

**Critical usage rule:** The returned release function MUST be called in a
`finally` block. Failing to do so blocks all subsequent TTS calls forever.

```typescript
const releaseSlot = await acquireTtsSlot();
try {
    audioBlob = await callGeminiTTS(text, voiceConfig);
} finally {
    releaseSlot(); // starts 2s cooldown; next caller proceeds after it elapses
}
```

The old TOCTOU pattern (`read lastCallTime → check → set`) was replaced with
this mutex because concurrent callers could both pass the time check
simultaneously and collide. This gate prevents that race condition.

### NarratorConfig Interface

```typescript
export interface NarratorConfig {
    model?: string;           // Default: MODELS.TTS (gemini-3.1-flash-tts-preview)
    defaultVoice?: TTSVoice;  // Default: "Kore"
    videoPurpose?: VideoPurpose; // Drives auto-style selection
    styleOverride?: StylePrompt; // Takes precedence over auto-selected style
    language?: LanguageCode;  // Triggers language-specific voice selection
    provider?: TTSProvider;   // 'gemini' (default) | 'deapi_qwen'
    deapiModel?: DeApiTtsModel; // Model when using deapi_qwen provider
}
```

### Voice Selection

Voice selection follows a priority chain from most to least specific:

1. **Language override** — if `config.language` is set and is not `'en'` or
   `'auto'`, `LANGUAGE_VOICE_MAP` selects a language-appropriate voice (e.g.
   Arabic → `Aoede`, German → `Orus`).
2. **Emotional tone** — `TONE_VOICE_MAP` maps `EmotionalTone` values to a
   base `ExtendedVoiceConfig` with voice name and style prompt (e.g.
   `'dramatic'` → `Fenrir`, `'calm'` → `Aoede`).
3. **Default** — `Kore` (warm English female voice).

For format-aware selection, pipelines call `getFormatVoiceForLanguage`:

```typescript
const voiceConfig = getFormatVoiceForLanguage(FORMAT_ID, language);
// Returns ExtendedVoiceConfig merging format profile + language override
```

Available Gemini voices (`TTS_VOICES`):

| Constant  | Name     | Character                          |
|-----------|----------|------------------------------------|
| `KORE`    | Kore     | Warm, friendly female (EN default) |
| `CHARON`  | Charon   | Deep, authoritative male           |
| `PUCK`    | Puck     | Energetic, youthful                |
| `FENRIR`  | Fenrir   | Strong, dramatic                   |
| `AOEDE`   | Aoede    | Calm, soothing female              |
| `LEDA`    | Leda     | Professional, clear female         |
| `ORUS`    | Orus     | Balanced, neutral male             |
| `ZEPHYR`  | Zephyr   | Light, airy                        |

### Director's Notes (Style Prompts)

Gemini 2.5 TTS accepts natural-language delivery instructions prepended to the
text. `StylePrompt` encodes this:

```typescript
export interface StylePrompt {
    persona?: string;            // "A wise old storyteller"
    emotion?: string;            // "warm and reassuring"
    pacing?: string;             // "slow and deliberate"
    accent?: string;             // "British narrator"
    customDirectorNote?: string; // Overrides all other fields
}
```

The formatted text sent to the API is:
```
"Speak as A professional documentary narrator, with a informative tone, at a measured pace": "Your narration text here"
```

When a scene has an `instructionTriplet`, the service builds a richer
triplet-based note via `buildTripletDirectorNote()` instead of the legacy
`getAutoStylePrompt()` path.

### Key Exported Functions

| Function | Signature | Purpose |
|---|---|---|
| `narrateScene` | `(scene, config?, sessionId?) → Promise<NarrationSegment>` | Narrate one scene |
| `narrateAllScenes` | `(scenes, config?, onProgress?, sessionId?) → Promise<NarrationSegment[]>` | Narrate all scenes sequentially |
| `narrateAllShots` | `(shots, screenplayScenes, config, ...) → Promise<ShotResult[]>` | Per-shot narration with resume support |
| `synthesizeSpeech` | `(text, voiceConfig, config?) → Promise<Blob>` | Raw TTS call, returns WAV blob |
| `calculateAudioDuration` | `(audioBlob) → number` | Precise duration from WAV header math |
| `getFormatVoiceForLanguage` | `(formatId, language) → ExtendedVoiceConfig` | Format+language merged voice config |
| `detectDialogue` | `(script) → DialogueSegment[]` | Parse quoted dialogue for multi-voice |
| `getAutoStylePrompt` | `(tone, purpose?, override?) → StylePrompt` | Build layered style prompt |
| `buildTripletDirectorNote` | `(triplet) → string` | Triplet-based director note |

### Key Exported Types

```typescript
export type TTSProvider = 'gemini' | 'deapi_qwen';
export type TTSVoice = 'Kore' | 'Charon' | 'Puck' | 'Fenrir' | 'Aoede' | 'Leda' | 'Orus' | 'Zephyr';
export interface VoiceConfig { voiceName: TTSVoice; pitch?: number; speakingRate?: number; }
export interface ExtendedVoiceConfig extends VoiceConfig { stylePrompt?: StylePrompt; }
export interface StylePrompt { persona?; emotion?; pacing?; accent?; customDirectorNote?; }
export interface NarratorConfig { model?; defaultVoice?; videoPurpose?; styleOverride?; language?; provider?; deapiModel?; }
export interface DialogueSegment { speaker: 'narrator'|'male'|'female'|'elder'|'youth'|'mysterious'; text: string; isDialogue: boolean; }
export class NarratorError extends Error { code: "API_FAILURE"|"INVALID_INPUT"|"AUDIO_ERROR"|"NOT_CONFIGURED"; }
```

### Audio Format

Gemini TTS returns raw PCM (L16, 24 kHz, 16-bit mono). The service wraps this
in a standard 44-byte WAV header before returning. Duration can therefore be
computed without decoding:

```typescript
// 24000 samples/sec * 2 bytes/sample * 1 channel = 48000 bytes/sec
const pcmDataSize = audioBlob.size - 44; // subtract WAV header
const duration = pcmDataSize / 48000;    // seconds
```

---

## AudioMixerService

**File:** `packages/shared/src/services/audioMixerService.ts`

Mixes up to three audio tracks into a single mono WAV using the Web Audio API's
`OfflineAudioContext` for non-real-time rendering.

### Three-Track Architecture

| Track | Source | Behavior |
|---|---|---|
| Track 1 — Narration | `MixConfig.narrationUrl` | Always present, played at volume 1.0 |
| Track 2 — Scene SFX | `sfxPlan.scenes[i].ambientTrack.audioUrl` | Per-scene ambient, loops with 500ms fade in/out |
| Track 3 — Background Music | `sfxPlan.backgroundMusic.audioUrl` | Loops for full duration with 2s fade in/out and optional ducking |

### SceneAudioInfo Type

```typescript
export interface SceneAudioInfo {
    sceneId: string;
    startTime: number;  // seconds from start of combined narration
    duration: number;   // seconds this scene occupies
}
```

This is used to align per-scene SFX with the correct time offset in the final
mixed audio. The caller (typically `exportConfig.ts` or a pipeline's assembly
step) must compute `startTime` by accumulating `NarrationSegment.audioDuration`
values.

### MixConfig Interface

```typescript
export interface MixConfig {
    narrationUrl: string;          // URL or object URL of combined narration WAV
    sfxPlan: VideoSFXPlan | null;  // SFX plan from sfxService (may be null)
    scenes: SceneAudioInfo[];      // Per-scene timing for SFX placement
    sfxMasterVolume?: number;      // Default 1.0
    musicMasterVolume?: number;    // Default 0.5
    sampleRate?: number;           // Default 44100
    enableDucking?: boolean;       // Default true
    duckingAmount?: number;        // Default 0.7 (reduces music 70% during speech)
}
```

### Dynamic Audio Ducking

When `enableDucking` is true (default), the mixer analyzes the narration waveform
in 100ms RMS blocks to detect speech activity. Music gain is reduced proportionally
during detected speech segments. The envelope is smoothed over a 300ms window to
avoid abrupt gain jumps.

Ducking threshold: RMS below 0.05 = no speech (no duck). Full duck at RMS 0.3.
The `duckingAmount` of 0.7 means music is reduced to 30% of its base volume
during peak speech.

### Key Exported Functions

| Function | Signature | Purpose |
|---|---|---|
| `mixAudioWithSFX` | `(config: MixConfig) → Promise<Blob>` | Full three-track mix, returns WAV blob |
| `canMixSFX` | `(sfxPlan: VideoSFXPlan \| null) → boolean` | Check if sfxPlan has any audio URLs to mix |
| `mergeConsecutiveAudioBlobs` | `(blobs: Blob[], sampleRate?) → Promise<Blob>` | Concatenate narration blobs by decoding and re-encoding |

### Key Exported Types

```typescript
export interface AudioTrack { source: string|Blob; startTime: number; duration?: number; volume: number; loop?: boolean; fadeIn?: number; fadeOut?: number; }
export interface SceneAudioInfo { sceneId: string; startTime: number; duration: number; }
export interface MixConfig { narrationUrl; sfxPlan; scenes; sfxMasterVolume?; musicMasterVolume?; sampleRate?; enableDucking?; duckingAmount?; }
```

### Integration with Export

The mixer is called after concatenation. The result blob is passed to
`exportConfig.ts` which writes it as the audio track for FFmpeg. Because
`OfflineAudioContext` outputs a mono 44.1 kHz WAV, FFmpeg receives a consistent
format regardless of the number of input tracks.

---

## AudioConcatService

**File:** `packages/shared/src/services/audioConcatService.ts`

Concatenates multiple per-scene audio URLs or blobs into a single linear WAV
file. This sits between `NarratorService` (which produces one blob per scene)
and `AudioMixerService` (which requires a single narration URL).

### AudioSegment Type

```typescript
export interface AudioSegment {
    url: string;
    duration: number; // seconds (used for caller bookkeeping; not used internally)
}
```

### Key Exported Functions

| Function | Signature | Purpose |
|---|---|---|
| `concatenateAudioSegments` | `(segments: AudioSegment[], onProgress?) → Promise<Blob>` | Low-level: fetch, decode, concatenate, return WAV |
| `createCombinedNarrationAudio` | `(segments: Array<{audioUrl?; duration}>, onProgress?) → Promise<string>` | High-level: filters null URLs, returns object URL string |

`createCombinedNarrationAudio` is the entry point for pipelines. It:
1. Filters segments where `audioUrl` is falsy (failed TTS scenes).
2. Short-circuits and returns the single URL directly if only one segment remains
   (avoids unnecessary decode/encode).
3. Calls `concatenateAudioSegments`, creates an object URL, and returns it.

### Progress Reporting

`concatenateAudioSegments` reports progress in two phases via `onProgress(percent)`:
- 0–50%: fetching and decoding each segment.
- 50–80%: copying decoded frames into the output buffer.
- 85%: encoding WAV.
- 100%: done.

`createCombinedNarrationAudio` wraps these values into 10–30% of the caller's
overall progress range.

### Multi-Channel Handling

If segments have different channel counts (e.g., mixing mono and stereo sources),
the output buffer uses `Math.max(...buffers.map(b => b.numberOfChannels))`. Mono
sources are upmixed by reading from channel 0 for both output channels.

---

## Common Usage Patterns

### Full Pipeline Invocation (as used in all format pipelines)

```typescript
import { narrateScene, getFormatVoiceForLanguage, type NarratorConfig } from '../narratorService';
import { createCombinedNarrationAudio } from '../audioConcatService';
import { mixAudioWithSFX, canMixSFX, type SceneAudioInfo } from '../audioMixerService';

// 1. Build narrator config (format + language aware)
const voiceConfig = getFormatVoiceForLanguage(FORMAT_ID, language);
const narratorConfig: NarratorConfig = {
    defaultVoice: voiceConfig.voiceName,
    videoPurpose: 'documentary',
    language: language as LanguageCode,
    styleOverride: voiceConfig.stylePrompt,
};

// 2. Narrate each scene sequentially (TTS gate serializes internally)
const narrationSegments: NarrationSegment[] = [];
for (const scene of scenes) {
    try {
        const segment = await narrateScene(scene, narratorConfig, sessionId);
        narrationSegments.push(segment);
    } catch (err) {
        log.warn(`Narration failed for scene ${scene.id}:`, err);
        // Pipeline continues — failed scenes produce no segment
    }
}

// 3. Concatenate per-scene blobs into one narration file
const sceneAudioData = narrationSegments.map(s => ({
    audioUrl: URL.createObjectURL(s.audioBlob),
    duration: s.audioDuration,
}));
const narrationUrl = await createCombinedNarrationAudio(sceneAudioData);

// 4. Build scene timing for SFX alignment
let cursor = 0;
const sceneTimings: SceneAudioInfo[] = narrationSegments.map(s => {
    const entry = { sceneId: s.sceneId, startTime: cursor, duration: s.audioDuration };
    cursor += s.audioDuration;
    return entry;
});

// 5. Mix narration + SFX (if available)
let finalAudioUrl = narrationUrl;
if (sfxPlan && canMixSFX(sfxPlan)) {
    const mixedBlob = await mixAudioWithSFX({
        narrationUrl,
        sfxPlan,
        scenes: sceneTimings,
        musicMasterVolume: 0.4,
        enableDucking: true,
    });
    finalAudioUrl = URL.createObjectURL(mixedBlob);
}
```

### Narrating Shots (resume-safe)

`narrateAllShots` is used by story-mode pipelines that operate on a shotlist
rather than scenes. It supports resuming a partial run:

```typescript
const shotResults = await narrateAllShots(
    shots,
    screenplayScenes,
    narratorConfig,
    (completed, total) => onProgress(completed, total),
    sessionId,
    existingStatus,       // per-shot 'success'|'pending'|'failed' from store
    existingShotNarrations // already-completed narrations to skip
);
```

The function filters out shots already marked `'success'` with a stored
`audioUrl`, then runs remaining shots through `ParallelExecutionEngine` with
`concurrencyLimit: 2`. In practice only one call runs at a time because
`acquireTtsSlot` serializes them.

---

## Gotchas

**releaseSlot must be in finally**
If `releaseSlot()` is not called after a TTS error, `_ttsGate` never resolves
and the entire application's TTS is silently deadlocked. Always wrap:

```typescript
const releaseSlot = await acquireTtsSlot();
try {
    // ... TTS call ...
} finally {
    releaseSlot();
}
```

**Do not wrap errors before passing to withRetry**
`withRetry` inspects `error.status` for 429/500/503 and checks
`error.message` for `"INTERNAL"` / `"fetch failed"`. Wrapping the error in a
`NarratorError` before passing it to `withRetry` hides these properties and
disables retries. The `NarratorError` wrapper is applied in the catch block
after `withRetry` has already run.

**OfflineAudioContext is browser-only**
`AudioMixerService` and `AudioConcatService` both use the Web Audio API
(`OfflineAudioContext`, `AudioContext`). They cannot run in a Node.js
environment. Server-side export goes through the FFmpeg worker path, which
bypasses these services.

**Short-circuit on single segment**
Both `concatenateAudioSegments` and `createCombinedNarrationAudio` return early
when given a single segment, avoiding a decode/encode roundtrip. This is
intentional — do not add processing logic that depends on the output always
being a fresh WAV encode.

**Gemini TTS outputs 24 kHz mono PCM**
The raw API response is PCM (L16), not WAV. `pcmToWav` adds a 44-byte header.
`calculateAudioDuration` relies on this known format (48000 bytes/sec). If the
model or sample rate ever changes, both functions must be updated together.

**SFX URLs must be CORS-accessible**
`fetchAndDecodeAudio` in `AudioMixerService` uses `fetch` with `mode: 'cors'`.
SFX or music URLs from third-party services must have appropriate CORS headers.
Fetch failures are caught and logged but do not abort the mix — the track is
silently skipped.

**Object URLs must be revoked by the caller**
`createCombinedNarrationAudio` returns a `URL.createObjectURL(blob)` string.
The caller owns this URL and is responsible for calling `URL.revokeObjectURL()`
when the audio is no longer needed to avoid memory leaks.

---

## Related Areas

- `packages/shared/src/services/sfxService.ts` — generates `VideoSFXPlan` (consumed by `AudioMixerService`)
- `packages/shared/src/services/deapiService.ts` — DeAPI Qwen3 TTS implementation called by `NarratorService`
- `packages/shared/src/services/textSanitizer.ts` — `cleanForTTS()` strips markdown before TTS input
- `packages/shared/src/services/tts/deliveryMarkers.ts` — converts inline `[PAUSE]`/`[EMPHASIS]` markers to director notes
- `packages/shared/src/services/ffmpeg/exportConfig.ts` — consumes final audio URL for FFmpeg assembly
- `packages/shared/src/services/pipelines/` — all format pipelines call this audio stack in Phase 4
