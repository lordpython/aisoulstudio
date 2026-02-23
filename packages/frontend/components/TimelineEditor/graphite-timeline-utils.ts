/**
 * Graphite Timeline Utility Functions
 * 
 * Core utility functions for the Graphite Timeline component including:
 * - Timecode formatting
 * - Tick interval calculation
 * - Track data transformation
 * - Selection state management
 */

import { Scene, NarrationSegment, VideoSFXPlan } from "@/types";

// --- Types ---

export interface TimelineClip {
  id: string;
  trackId: string;
  startTime: number;
  duration: number;
  name: string;
  thumbnail?: string;
  type: "video" | "audio" | "fx" | "music";
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: "video" | "audio" | "fx" | "music";
  clips: TimelineClip[];
}

// ... existing interfaces ...

export interface TickInterval {
  major: number;
  minor: number;
}

// --- Timecode Formatting ---

/**
 * Formats a time value in seconds to HH:MM:SS:FF timecode format.
 * 
 * @param seconds - Time value in seconds (non-negative)
 * @param fps - Frames per second (default: 24)
 * @returns Zero-padded timecode string in HH:MM:SS:FF format
 * 
 * @example
 * formatTimecode(3661.5) // "01:01:01:12"
 * formatTimecode(0) // "00:00:00:00"
 * formatTimecode(59.99, 30) // "00:00:59:29"
 */
export function formatTimecode(seconds: number, fps: number = 24): string {
  // Ensure non-negative
  const time = Math.max(0, seconds);

  const hrs = Math.floor(time / 3600);
  const mins = Math.floor((time % 3600) / 60);
  const secs = Math.floor(time % 60);
  const frames = Math.floor((time % 1) * fps);

  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
}


// --- Tick Interval Calculation ---

/**
 * Calculates major and minor tick intervals based on zoom level.
 * Higher zoom levels result in finer granularity (smaller intervals).
 * 
 * The relationship is monotonic: as zoom increases, intervals decrease or stay the same.
 * 
 * @param zoom - Current zoom level (pixels per second)
 * @returns Object with major and minor tick intervals in seconds
 * 
 * @example
 * getTickInterval(100) // { major: 1, minor: 0.2 }
 * getTickInterval(50)  // { major: 5, minor: 1 }
 * getTickInterval(20)  // { major: 10, minor: 2 }
 * getTickInterval(10)  // { major: 30, minor: 5 }
 */
export function getTickInterval(zoom: number): TickInterval {
  if (zoom >= 100) return { major: 1, minor: 0.2 };   // Every second
  if (zoom >= 50) return { major: 5, minor: 1 };     // Every 5 seconds
  if (zoom >= 20) return { major: 10, minor: 2 };    // Every 10 seconds
  return { major: 30, minor: 5 };                     // Every 30 seconds
}

// ... existing code ...

export function buildTracks(
  scenes: Scene[],
  visuals: Record<string, string>,
  narrationSegments: NarrationSegment[],
  sfxPlan: VideoSFXPlan | null = null
): TimelineTrack[] {
  // Video track from scenes - calculate cumulative start times
  let videoStartTime = 0;
  const videoClips: TimelineClip[] = scenes.map((scene) => {
    const clip: TimelineClip = {
      id: scene.id,
      trackId: "video",
      startTime: videoStartTime,
      duration: scene.duration,
      name: scene.name,
      thumbnail: visuals[scene.id],
      type: "video",
    };
    videoStartTime += scene.duration;
    return clip;
  });

  // Audio track from narration segments - calculate cumulative start times
  let audioStartTime = 0;
  const audioClips: TimelineClip[] = narrationSegments.map((segment, i) => {
    const scene = scenes.find((s) => s.id === segment.sceneId);
    const clip: TimelineClip = {
      id: `audio-${segment.sceneId}`,
      trackId: "audio",
      startTime: audioStartTime,
      duration: segment.audioDuration,
      name: scene?.name || `Narration ${i + 1}`,
      type: "audio",
    };
    audioStartTime += segment.audioDuration;
    return clip;
  });

  // FX / Ambient track from SFX plan
  let fxStartTime = 0;
  const fxClips: TimelineClip[] = [];

  if (sfxPlan) {
    sfxPlan.scenes.forEach((scenePlan) => {
      // Find the narration segment or scene duration for timing
      const narration = narrationSegments.find(n => n.sceneId === scenePlan.sceneId);
      const scene = scenes.find(s => s.id === scenePlan.sceneId);
      const duration = narration?.audioDuration || scene?.duration || 0;

      if (scenePlan.ambientTrack) {
        fxClips.push({
          id: `fx-${scenePlan.sceneId}`,
          trackId: "fx",
          startTime: fxStartTime,
          duration: duration,
          name: scenePlan.ambientTrack.name,
          type: "fx",
        });
      }
      fxStartTime += duration;
    });
  }

  // Music track from generated music (Suno AI)
  const musicClips: TimelineClip[] = [];

  if (sfxPlan?.generatedMusic) {
    // Calculate total video duration for the music track
    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

    musicClips.push({
      id: `music-${sfxPlan.generatedMusic.trackId}`,
      trackId: "music",
      startTime: 0,
      // Use the shorter of music duration or video duration
      duration: Math.min(sfxPlan.generatedMusic.duration, totalDuration),
      name: sfxPlan.generatedMusic.title,
      type: "music",
    });
  }

  // Build tracks array - include music track only if there's generated music
  const tracks: TimelineTrack[] = [
    { id: "video", name: "Video 01", type: "video", clips: videoClips },
    { id: "audio", name: "Narration", type: "audio", clips: audioClips },
    { id: "fx", name: "FX / Ambient", type: "fx", clips: fxClips },
  ];

  // Add music track if there's generated music
  if (musicClips.length > 0) {
    tracks.push({ id: "music", name: "Music", type: "music", clips: musicClips });
  }

  return tracks;
}


// --- Selection State Management ---

/**
 * Selection state for the timeline.
 * Supports single-selection only (Requirement 10.4).
 */
export interface SelectionState {
  /** ID of the currently selected clip, or null if none selected */
  selectedClipId: string | null;
}

/**
 * Extracts the scene ID from a clip ID.
 * Audio clips use the pattern "audio-{sceneId}", video clips use the scene ID directly.
 * 
 * @param clipId - The clip ID to extract scene ID from
 * @returns The scene ID
 * 
 * @example
 * extractSceneId("scene-1") // "scene-1"
 * extractSceneId("audio-scene-1") // "scene-1"
 */
export function extractSceneId(clipId: string): string {
  if (clipId.startsWith("audio-")) {
    return clipId.replace("audio-", "");
  }
  return clipId;
}

/**
 * Creates the initial selection state.
 * 
 * @param initialSelectedId - Optional initial selected clip ID
 * @returns Initial selection state
 */
export function createInitialSelectionState(initialSelectedId?: string | null): SelectionState {
  return {
    selectedClipId: initialSelectedId ?? null,
  };
}

/**
 * Selects a clip by ID.
 * Implements single-selection: selecting a new clip deselects the previous one.
 * (Requirement 10.1, 10.4)
 * 
 * @param state - Current selection state
 * @param clipId - ID of the clip to select
 * @returns New selection state with the clip selected
 */
export function selectClip(state: SelectionState, clipId: string): SelectionState {
  return {
    selectedClipId: clipId,
  };
}

/**
 * Clears the current selection.
 * (Requirement 10.2)
 * 
 * @param state - Current selection state
 * @returns New selection state with no clip selected
 */
export function clearSelection(state: SelectionState): SelectionState {
  return {
    selectedClipId: null,
  };
}

/**
 * Checks if a specific clip is selected.
 * 
 * @param state - Current selection state
 * @param clipId - ID of the clip to check
 * @returns True if the clip is selected
 */
export function isClipSelected(state: SelectionState, clipId: string): boolean {
  return state.selectedClipId === clipId;
}

/**
 * Handles a clip click event.
 * Selects the clicked clip and returns the scene ID for the callback.
 * (Requirement 10.1, 10.3)
 * 
 * @param state - Current selection state
 * @param clipId - ID of the clicked clip
 * @returns Object with new state and scene ID for callback
 */
export function handleClipClick(
  state: SelectionState,
  clipId: string
): { newState: SelectionState; sceneId: string } {
  const newState = selectClip(state, clipId);
  const sceneId = extractSceneId(clipId);
  return { newState, sceneId };
}

/**
 * Handles a click outside of clips (on empty lane area).
 * Clears the selection.
 * (Requirement 10.2)
 * 
 * @param state - Current selection state
 * @returns New selection state with no clip selected
 */
export function handleOutsideClick(state: SelectionState): SelectionState {
  return clearSelection(state);
}
