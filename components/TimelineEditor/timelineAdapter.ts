/**
 * Timeline Adapter Functions
 *
 * Converts between the existing data model (Scene, NarrationSegment, VideoSFXPlan)
 * and the new AudioTimelineEditor's internal data model (Track, AudioClip, VideoClip).
 *
 * This adapter layer enables backward compatibility, allowing the new timeline component
 * to be used as a drop-in replacement without requiring changes to the rest of the application.
 *
 * @see .kiro/specs/timeline-editor-replacement/design.md for architecture details
 * @requirements 9.1, 9.2, 9.3, 9.4, 9.5
 */

import type { Scene, NarrationSegment, VideoSFXPlan } from "@/types";
import type { Track, AudioClip, VideoClip } from "@/types/audio-editor";

/** Track ID constants for consistent referencing */
export const TRACK_IDS = {
  VIDEO: "video-track",
  NARRATOR: "narrator-track",
  SFX: "sfx-track",
  AMBIENT: "ambient-track",
  MUSIC: "music-track",
} as const;

/** Clip ID prefixes for different track types */
export const CLIP_PREFIXES = {
  VIDEO: "video-",
  AUDIO: "audio-",
  SFX: "sfx-",
  AMBIENT: "ambient-",
  MUSIC: "music-",
} as const;

/**
 * Generates placeholder waveform data for audio clips.
 * In a real implementation, this would be extracted from the actual audio.
 *
 * @param duration - Duration in seconds
 * @param samplesPerSecond - Number of waveform samples per second
 * @returns Array of normalized waveform values (0-1)
 */
function generatePlaceholderWaveform(
  duration: number,
  samplesPerSecond: number = 10
): number[] {
  const sampleCount = Math.max(1, Math.floor(duration * samplesPerSecond));
  const waveform: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    // Generate a pseudo-random but deterministic waveform pattern
    const t = i / sampleCount;
    const value = 0.3 + 0.4 * Math.sin(t * Math.PI * 4) + 0.3 * Math.random();
    waveform.push(Math.min(1, Math.max(0, value)));
  }

  return waveform;
}

/**
 * Converts Scene[] to a video Track with VideoClip[].
 *
 * Conversion logic:
 * - Scene.id → VideoClip.id (direct mapping)
 * - Scene.name → VideoClip.name (direct mapping)
 * - Scene.duration → VideoClip.duration (direct mapping)
 * - visuals[scene.id] → VideoClip.thumbnailUrl (lookup from visuals map)
 * - Cumulative scene durations → VideoClip.startTime (sum of previous scene durations)
 *
 * @param scenes - Array of Scene objects from ContentPlan
 * @param visuals - Map of scene IDs to thumbnail URLs
 * @returns Object containing the video track and array of video clips
 *
 * @requirements 9.1, 9.5
 * @validates Requirements 1.1, 1.2, 1.3, 1.4
 */
export function scenesToVideoTrack(
  scenes: Scene[],
  visuals: Record<string, string>
): { track: Track; clips: VideoClip[] } {
  const track: Track = {
    id: TRACK_IDS.VIDEO,
    type: "video",
    name: "Video",
    text: "",
    isGenerated: scenes.length > 0,
  };

  let cumulativeStartTime = 0;
  const clips: VideoClip[] = scenes.map((scene) => {
    const clip: VideoClip = {
      id: scene.id,
      trackId: TRACK_IDS.VIDEO,
      startTime: cumulativeStartTime,
      duration: scene.duration,
      thumbnailUrl: visuals[scene.id] || "",
      name: scene.name,
    };

    cumulativeStartTime += scene.duration;
    return clip;
  });

  return { track, clips };
}

/**
 * Converts NarrationSegment[] to a narrator Track with AudioClip[].
 *
 * Conversion logic:
 * - NarrationSegment.sceneId → AudioClip.id (prefixed with "audio-")
 * - NarrationSegment.audioDuration → AudioClip.duration (direct mapping)
 * - Cumulative narration durations → AudioClip.startTime (sum of previous segment durations)
 *
 * @param segments - Array of NarrationSegment objects
 * @param scenes - Array of Scene objects (used for ordering and fallback durations)
 * @returns Object containing the narrator track and array of audio clips
 *
 * @requirements 9.2, 9.5
 * @validates Requirements 1.5
 */
export function narrationToAudioTrack(
  segments: NarrationSegment[],
  scenes: Scene[]
): { track: Track; clips: AudioClip[] } {
  const track: Track = {
    id: TRACK_IDS.NARRATOR,
    type: "narrator",
    name: "Narrator",
    text: segments.map((s) => s.transcript).join(" "),
    isGenerated: segments.length > 0,
  };

  // Order segments by scene order
  const orderedSegments = [...segments].sort((a, b) => {
    const aIndex = scenes.findIndex((s) => s.id === a.sceneId);
    const bIndex = scenes.findIndex((s) => s.id === b.sceneId);
    return aIndex - bIndex;
  });

  let cumulativeStartTime = 0;
  const clips: AudioClip[] = orderedSegments.map((segment) => {
    const clip: AudioClip = {
      id: `${CLIP_PREFIXES.AUDIO}${segment.sceneId}`,
      trackId: TRACK_IDS.NARRATOR,
      startTime: cumulativeStartTime,
      duration: segment.audioDuration,
      waveformData: generatePlaceholderWaveform(segment.audioDuration),
    };

    cumulativeStartTime += segment.audioDuration;
    return clip;
  });

  return { track, clips };
}

/**
 * Converts VideoSFXPlan to SFX Track(s) with AudioClip[].
 *
 * Creates clips for:
 * - Ambient tracks from each scene's SFX plan
 * - Background music if present
 * - Generated music if present
 *
 * @param sfxPlan - VideoSFXPlan object or null
 * @param scenes - Array of Scene objects (used for timing reference)
 * @param narrationSegments - Array of NarrationSegment objects (used for timing alignment)
 * @returns Object containing the SFX tracks and array of audio clips
 *
 * @requirements 9.3, 9.5
 * @validates Requirements 1.6
 */
export function sfxPlanToTracks(
  sfxPlan: VideoSFXPlan | null,
  scenes: Scene[],
  _narrationSegments: NarrationSegment[]
): { tracks: Track[]; clips: AudioClip[] } {
  const tracks: Track[] = [];
  const clips: AudioClip[] = [];

  // Create SFX track
  const sfxTrack: Track = {
    id: TRACK_IDS.SFX,
    type: "sfx",
    name: "Sound Effects",
    text: "",
    isGenerated: sfxPlan !== null && sfxPlan.scenes.length > 0,
  };
  tracks.push(sfxTrack);

  if (!sfxPlan) {
    return { tracks, clips };
  }

  // Calculate scene start times for positioning SFX clips
  const sceneStartTimes = new Map<string, number>();
  let cumulativeTime = 0;
  for (const scene of scenes) {
    sceneStartTimes.set(scene.id, cumulativeTime);
    cumulativeTime += scene.duration;
  }

  // Process ambient tracks from each scene
  for (const sceneSfx of sfxPlan.scenes) {
    const startTime = sceneStartTimes.get(sceneSfx.sceneId) ?? 0;
    const scene = scenes.find((s) => s.id === sceneSfx.sceneId);
    const sceneDuration = scene?.duration ?? 0;

    if (sceneSfx.ambientTrack) {
      const ambientClip: AudioClip = {
        id: `${CLIP_PREFIXES.AMBIENT}${sceneSfx.sceneId}`,
        trackId: TRACK_IDS.SFX,
        startTime,
        duration:
          sceneSfx.ambientTrack.duration > 0
            ? sceneSfx.ambientTrack.duration
            : sceneDuration,
        waveformData: generatePlaceholderWaveform(sceneDuration),
      };
      clips.push(ambientClip);
    }
  }

  // Add background music track if present
  if (sfxPlan.backgroundMusic || sfxPlan.generatedMusic) {
    const musicTrack: Track = {
      id: TRACK_IDS.MUSIC,
      type: "sfx",
      name: "Music",
      text: sfxPlan.generatedMusic?.title || sfxPlan.backgroundMusic?.name || "",
      isGenerated: true,
    };
    tracks.push(musicTrack);

    // Calculate total duration
    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

    if (sfxPlan.generatedMusic) {
      const musicClip: AudioClip = {
        id: `${CLIP_PREFIXES.MUSIC}generated`,
        trackId: TRACK_IDS.MUSIC,
        startTime: 0,
        duration: sfxPlan.generatedMusic.duration || totalDuration,
        waveformData: generatePlaceholderWaveform(
          sfxPlan.generatedMusic.duration || totalDuration
        ),
      };
      clips.push(musicClip);
    } else if (sfxPlan.backgroundMusic) {
      const musicClip: AudioClip = {
        id: `${CLIP_PREFIXES.MUSIC}background`,
        trackId: TRACK_IDS.MUSIC,
        startTime: 0,
        duration:
          sfxPlan.backgroundMusic.duration > 0
            ? sfxPlan.backgroundMusic.duration
            : totalDuration,
        waveformData: generatePlaceholderWaveform(totalDuration),
      };
      clips.push(musicClip);
    }
  }

  return { tracks, clips };
}

/**
 * Extracts the scene ID from a clip ID.
 *
 * Handles various clip ID patterns:
 * - "audio-{sceneId}" → sceneId
 * - "sfx-{sceneId}" → sceneId
 * - "ambient-{sceneId}" → sceneId
 * - "video-{sceneId}" → sceneId
 * - "{sceneId}" (no prefix) → sceneId
 *
 * @param clipId - The clip ID to extract scene ID from
 * @returns The extracted scene ID
 *
 * @requirements 9.4
 * @validates Requirements 3.2, 3.5, 10.4
 */
export function clipIdToSceneId(clipId: string): string {
  // Check for known prefixes and remove them
  for (const prefix of Object.values(CLIP_PREFIXES)) {
    if (clipId.startsWith(prefix)) {
      return clipId.slice(prefix.length);
    }
  }

  // No prefix found, return as-is (video clips use scene ID directly)
  return clipId;
}

/**
 * Converts a scene ID to a clip ID for a specific track type.
 *
 * @param sceneId - The scene ID to convert
 * @param trackType - The type of track ("video", "narrator", "sfx", "ambient", "music")
 * @returns The clip ID for the specified track type
 *
 * @requirements 9.4
 * @validates Requirements 3.2, 3.5, 10.4
 */
export function sceneIdToClipId(
  sceneId: string,
  trackType: "video" | "narrator" | "sfx" | "ambient" | "music"
): string {
  switch (trackType) {
    case "video":
      // Video clips use scene ID directly (no prefix)
      return sceneId;
    case "narrator":
      return `${CLIP_PREFIXES.AUDIO}${sceneId}`;
    case "sfx":
      return `${CLIP_PREFIXES.SFX}${sceneId}`;
    case "ambient":
      return `${CLIP_PREFIXES.AMBIENT}${sceneId}`;
    case "music":
      return `${CLIP_PREFIXES.MUSIC}${sceneId}`;
    default:
      return sceneId;
  }
}

/**
 * Converts all data sources to the timeline editor's internal format.
 * This is a convenience function that combines all adapter functions.
 *
 * @param scenes - Array of Scene objects from ContentPlan
 * @param visuals - Map of scene IDs to thumbnail URLs
 * @param narrationSegments - Array of NarrationSegment objects
 * @param sfxPlan - VideoSFXPlan object or null
 * @returns Object containing all tracks and clips
 */
export function convertToTimelineData(
  scenes: Scene[],
  visuals: Record<string, string>,
  narrationSegments: NarrationSegment[],
  sfxPlan: VideoSFXPlan | null
): {
  tracks: Track[];
  videoClips: VideoClip[];
  audioClips: AudioClip[];
} {
  const { track: videoTrack, clips: videoClips } = scenesToVideoTrack(
    scenes,
    visuals
  );
  const { track: narratorTrack, clips: narratorClips } = narrationToAudioTrack(
    narrationSegments,
    scenes
  );
  const { tracks: sfxTracks, clips: sfxClips } = sfxPlanToTracks(
    sfxPlan,
    scenes,
    narrationSegments
  );

  return {
    tracks: [videoTrack, narratorTrack, ...sfxTracks],
    videoClips,
    audioClips: [...narratorClips, ...sfxClips],
  };
}
