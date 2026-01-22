/**
 * useTimelineAdapter Hook
 *
 * Custom React hook that converts external props (Scene, NarrationSegment, VideoSFXPlan)
 * to the internal data model (Track, AudioClip, VideoClip) used by AudioTimelineEditor.
 *
 * This adapter layer enables backward compatibility, allowing the new timeline component
 * to be used as a drop-in replacement without requiring changes to the rest of the application.
 *
 * Key responsibilities:
 * 1. Convert scenes → videoClips using scenesToVideoTrack
 * 2. Convert narrationSegments → audioClips using narrationToAudioTrack
 * 3. Convert sfxPlan → tracks/clips using sfxPlanToTracks
 * 4. Sync selectedSceneId ↔ selectedClipId using clipIdToSceneId/sceneIdToClipId
 * 5. Wrap onSceneSelect to convert clip IDs back to scene IDs
 * 6. Wrap onDeleteClip similarly
 *
 * @see .kiro/specs/timeline-editor-replacement/design.md for architecture details
 * @requirements 9.1-9.6, 10.1, 10.3, 10.4
 */

import { useMemo, useCallback } from "react";
import type { Scene, NarrationSegment, VideoSFXPlan } from "@/types";
import type {
  Track,
  AudioClip,
  VideoClip,
  ImageClip,
  SubtitleCue,
} from "@/types/audio-editor";
import {
  scenesToVideoTrack,
  narrationToAudioTrack,
  sfxPlanToTracks,
  clipIdToSceneId,
  sceneIdToClipId,
} from "@/components/TimelineEditor/timelineAdapter";

/**
 * Props interface matching AudioTimelineEditorProps from design.md
 * These are the external props that the adapter converts from.
 */
export interface UseTimelineAdapterProps {
  /** Array of Scene objects from ContentPlan */
  scenes: Scene[];
  /** Map of scene IDs to thumbnail URLs */
  visuals?: Record<string, string>;
  /** Array of NarrationSegment objects */
  narrationSegments?: NarrationSegment[];
  /** Sound effects plan */
  sfxPlan?: VideoSFXPlan | null;
  /** Currently selected scene ID (external state) */
  selectedSceneId?: string | null;
  /** Callback when a scene is selected */
  onSceneSelect?: (sceneId: string) => void;
  /** Callback when a clip is deleted */
  onDeleteClip?: (clipId: string) => void;
}

/**
 * Return type for the useTimelineAdapter hook.
 * Contains the converted internal data model and wrapped callbacks.
 */
export interface UseTimelineAdapterReturn {
  /** All tracks (video, narrator, sfx, etc.) */
  tracks: Track[];
  /** Audio clips (narrator and sfx) */
  audioClips: AudioClip[];
  /** Video clips (from scenes) */
  videoClips: VideoClip[];
  /** Image clips (currently empty, for future use) */
  imageClips: ImageClip[];
  /** Subtitle cues (currently empty, for future use) */
  subtitles: SubtitleCue[];
  /** Currently selected clip ID (converted from selectedSceneId) */
  selectedClipId: string | null;
  /** Handler for clip selection - converts clip ID to scene ID and calls onSceneSelect */
  handleClipSelect: (clipId: string | null) => void;
  /** Handler for clip deletion - converts clip ID to scene ID and calls onDeleteClip */
  handleDeleteClip: (clipId: string) => void;
}

/**
 * Hook for adapting external timeline props to internal data model.
 *
 * @param props - External props from AudioTimelineEditor
 * @returns Converted internal data model and wrapped callbacks
 *
 * @example
 * ```tsx
 * const {
 *   tracks,
 *   audioClips,
 *   videoClips,
 *   selectedClipId,
 *   handleClipSelect,
 *   handleDeleteClip,
 * } = useTimelineAdapter({
 *   scenes,
 *   visuals,
 *   narrationSegments,
 *   sfxPlan,
 *   selectedSceneId,
 *   onSceneSelect,
 *   onDeleteClip,
 * });
 * ```
 *
 * @requirements 9.1-9.6, 10.1, 10.3, 10.4
 */
export function useTimelineAdapter(
  props: UseTimelineAdapterProps
): UseTimelineAdapterReturn {
  const {
    scenes,
    visuals = {},
    narrationSegments = [],
    sfxPlan = null,
    selectedSceneId = null,
    onSceneSelect,
    onDeleteClip,
  } = props;

  /**
   * Convert scenes to video track and clips.
   * Memoized to prevent unnecessary recalculations.
   *
   * @requirements 9.1, 9.5
   * @validates Requirements 1.1, 1.2, 1.3, 1.4
   */
  const { track: videoTrack, clips: videoClips } = useMemo(
    () => scenesToVideoTrack(scenes, visuals),
    [scenes, visuals]
  );

  /**
   * Convert narration segments to narrator track and audio clips.
   * Memoized to prevent unnecessary recalculations.
   *
   * @requirements 9.2, 9.5
   * @validates Requirements 1.5
   */
  const { track: narratorTrack, clips: narratorClips } = useMemo(
    () => narrationToAudioTrack(narrationSegments, scenes),
    [narrationSegments, scenes]
  );

  /**
   * Convert SFX plan to SFX tracks and audio clips.
   * Memoized to prevent unnecessary recalculations.
   *
   * @requirements 9.3, 9.5
   * @validates Requirements 1.6
   */
  const { tracks: sfxTracks, clips: sfxClips } = useMemo(
    () => sfxPlanToTracks(sfxPlan, scenes, narrationSegments),
    [sfxPlan, scenes, narrationSegments]
  );

  /**
   * Combine all tracks into a single array.
   * Order: video, narrator, sfx tracks
   */
  const tracks = useMemo<Track[]>(
    () => [videoTrack, narratorTrack, ...sfxTracks],
    [videoTrack, narratorTrack, sfxTracks]
  );

  /**
   * Combine all audio clips (narrator + sfx).
   */
  const audioClips = useMemo<AudioClip[]>(
    () => [...narratorClips, ...sfxClips],
    [narratorClips, sfxClips]
  );

  /**
   * Image clips - currently empty, for future media import functionality.
   * @requirements 9.1
   */
  const imageClips = useMemo<ImageClip[]>(() => [], []);

  /**
   * Subtitle cues - currently empty, for future subtitle import functionality.
   * @requirements 9.3
   */
  const subtitles = useMemo<SubtitleCue[]>(() => [], []);

  /**
   * Convert selectedSceneId to selectedClipId.
   * Video clips use scene ID directly, so we can use it as-is.
   *
   * @requirements 9.4, 10.4
   * @validates Requirements 3.5
   */
  const selectedClipId = useMemo<string | null>(() => {
    if (!selectedSceneId) {
      return null;
    }
    // Video clips use scene ID directly (no prefix)
    // This allows selection to work with video track clips
    return sceneIdToClipId(selectedSceneId, "video");
  }, [selectedSceneId]);

  /**
   * Handle clip selection - converts clip ID back to scene ID and calls onSceneSelect.
   * This wraps the external callback to maintain backward compatibility.
   *
   * @requirements 9.4, 10.3, 10.4
   * @validates Requirements 3.2
   */
  const handleClipSelect = useCallback(
    (clipId: string | null) => {
      if (!onSceneSelect) {
        return;
      }

      if (clipId === null) {
        // Selection cleared - some implementations may want to handle this
        // For now, we don't call onSceneSelect with null since the original
        // GraphiteTimeline didn't support clearing selection via callback
        return;
      }

      // Convert clip ID back to scene ID
      const sceneId = clipIdToSceneId(clipId);
      onSceneSelect(sceneId);
    },
    [onSceneSelect]
  );

  /**
   * Handle clip deletion - converts clip ID back to scene ID and calls onDeleteClip.
   * This wraps the external callback to maintain backward compatibility.
   *
   * @requirements 9.4, 10.3
   * @validates Requirements 3.4
   */
  const handleDeleteClip = useCallback(
    (clipId: string) => {
      if (!onDeleteClip) {
        return;
      }

      // Convert clip ID back to scene ID
      const sceneId = clipIdToSceneId(clipId);
      onDeleteClip(sceneId);
    },
    [onDeleteClip]
  );

  // Return memoized result to prevent unnecessary re-renders
  return useMemo(
    () => ({
      tracks,
      audioClips,
      videoClips,
      imageClips,
      subtitles,
      selectedClipId,
      handleClipSelect,
      handleDeleteClip,
    }),
    [
      tracks,
      audioClips,
      videoClips,
      imageClips,
      subtitles,
      selectedClipId,
      handleClipSelect,
      handleDeleteClip,
    ]
  );
}

export default useTimelineAdapter;
