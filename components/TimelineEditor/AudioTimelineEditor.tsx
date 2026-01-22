/**
 * AudioTimelineEditor Component
 *
 * Main wrapper component that provides a modernized timeline UI while maintaining
 * backward compatibility with the existing GraphiteTimeline props interface.
 *
 * This component:
 * 1. Accepts all GraphiteTimelineProps for backward compatibility
 * 2. Uses useTimelineAdapter hook to convert data to internal format
 * 3. Composes sub-components (TrackSidebar, VideoPreview, TimelinePanel, TimelineControls)
 * 4. Manages internal state (zoom, volume, import modal)
 * 5. Wires up callbacks to convert clip IDs back to scene IDs
 *
 * @see .kiro/specs/timeline-editor-replacement/design.md for architecture details
 * @requirements 10.1, 10.3, 10.4, 10.5
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { Scene, NarrationSegment, VideoSFXPlan } from "@/types";
import type { MediaFile, SubtitleCue, VideoClip, AudioClip } from "@/types/audio-editor";
import { useTimelineAdapter } from "@/hooks/useTimelineAdapter";
import { useTimelineKeyboard } from "@/hooks/useTimelineKeyboard";
import {
  TrackSidebar,
  VideoPreview,
  TimelinePanel,
  TimelineControls,
  ImportMediaModal,
} from "./editor";

// --- Accessibility Helper Functions ---

/**
 * Format duration in seconds to a human-readable string for screen reader announcements.
 * Outputs format like "5 seconds", "1 minute 30 seconds", etc.
 *
 * @param seconds - Duration in seconds
 * @returns Human-readable duration string
 *
 * @requirements 8.3
 * @validates Property 15: Aria Announcement Content
 */
export function formatDurationForAnnouncement(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) {
    return "0 seconds";
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes === 0) {
    return remainingSeconds === 1 ? "1 second" : `${remainingSeconds} seconds`;
  }

  const minuteStr = minutes === 1 ? "1 minute" : `${minutes} minutes`;
  
  if (remainingSeconds === 0) {
    return minuteStr;
  }

  const secondStr = remainingSeconds === 1 ? "1 second" : `${remainingSeconds} seconds`;
  return `${minuteStr} ${secondStr}`;
}

/**
 * Update the aria-live region with an announcement for screen readers.
 * The announcement will be read aloud by screen readers due to aria-live="assertive".
 *
 * @param message - The message to announce
 * @param regionId - The ID of the aria-live region element (default: "timeline-announcements")
 *
 * @requirements 8.3, 8.5
 */
export function announceToScreenReader(
  message: string,
  regionId: string = "timeline-announcements"
): void {
  const region = document.getElementById(regionId);
  if (region) {
    // Clear and set to trigger announcement even if same message
    region.textContent = "";
    // Use requestAnimationFrame to ensure the clear is processed first
    requestAnimationFrame(() => {
      region.textContent = message;
    });
  }
}

/**
 * Find a clip by ID from the combined video and audio clips arrays.
 *
 * @param clipId - The clip ID to find
 * @param videoClips - Array of video clips
 * @param audioClips - Array of audio clips
 * @returns The found clip with its name and duration, or null if not found
 */
function findClipById(
  clipId: string,
  videoClips: VideoClip[],
  audioClips: AudioClip[]
): { name: string; duration: number } | null {
  // Check video clips first
  const videoClip = videoClips.find((clip) => clip.id === clipId);
  if (videoClip) {
    return { name: videoClip.name, duration: videoClip.duration };
  }

  // Check audio clips
  const audioClip = audioClips.find((clip) => clip.id === clipId);
  if (audioClip) {
    // Audio clips don't have a name property, so we generate one from the ID
    const clipName = audioClip.id.startsWith("audio-")
      ? `Audio clip ${audioClip.id.replace("audio-", "")}`
      : `Clip ${audioClip.id}`;
    return { name: clipName, duration: audioClip.duration };
  }

  return null;
}

// --- Types ---

/**
 * Props interface for AudioTimelineEditor.
 * Maintains backward compatibility with GraphiteTimelineProps while adding
 * new optional props for extended functionality.
 *
 * @requirements 10.1, 10.5
 */
export interface AudioTimelineEditorProps {
  // Existing GraphiteTimeline props (backward compatible)
  /** Array of Scene objects from content plan */
  scenes: Scene[];
  /** Map of scene IDs to thumbnail URLs */
  visuals?: Record<string, string>;
  /** Array of NarrationSegment objects */
  narrationSegments?: NarrationSegment[];
  /** Current playback time in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Whether playback is currently active */
  isPlaying: boolean;
  /** Callback when play/pause is toggled */
  onPlayPause: () => void;
  /** Callback when user seeks to a new position */
  onSeek: (time: number) => void;
  /** Callback when a scene is selected */
  onSceneSelect?: (sceneId: string) => void;
  /** Currently selected scene ID */
  selectedSceneId?: string | null;
  /** Project name to display */
  projectName?: string;
  /** Optional additional CSS class */
  className?: string;
  /** SFX plan for ambient tracks */
  sfxPlan?: VideoSFXPlan | null;
  /** Callback when a clip should be deleted */
  onDeleteClip?: (clipId: string) => void;
  /** Optional data-testid for E2E testing */
  "data-testid"?: string;

  // New optional props for extended functionality
  /** Callback when a video file is imported */
  onImportVideo?: (file: MediaFile) => void;
  /** Callback when an image file is imported */
  onImportImage?: (file: MediaFile) => void;
  /** Callback when subtitles are imported */
  onImportSubtitles?: (cues: SubtitleCue[]) => void;
}

// --- Constants ---

const DEFAULT_ZOOM = 50;
const DEFAULT_VOLUME = 80;

// --- Component ---

/**
 * AudioTimelineEditor - Main timeline editor component.
 *
 * Provides a modernized timeline UI with video preview, track sidebar,
 * and media import capabilities while maintaining backward compatibility
 * with the existing application state and callbacks.
 *
 * @example
 * ```tsx
 * <AudioTimelineEditor
 *   scenes={contentPlan.scenes}
 *   visuals={generatedVisuals}
 *   narrationSegments={narrationSegments}
 *   currentTime={currentTime}
 *   duration={totalDuration}
 *   isPlaying={isPlaying}
 *   onPlayPause={handlePlayPause}
 *   onSeek={handleSeek}
 *   onSceneSelect={handleSceneSelect}
 *   selectedSceneId={selectedSceneId}
 *   sfxPlan={sfxPlan}
 * />
 * ```
 *
 * @requirements 10.1, 10.3, 10.4, 10.5
 */
export function AudioTimelineEditor({
  scenes,
  visuals = {},
  narrationSegments = [],
  currentTime,
  duration: _duration,
  isPlaying,
  onPlayPause,
  onSeek,
  onSceneSelect,
  selectedSceneId = null,
  projectName = "Untitled Project",
  className,
  sfxPlan = null,
  onDeleteClip,
  onImportVideo,
  onImportImage,
  onImportSubtitles,
  "data-testid": dataTestId,
}: AudioTimelineEditorProps) {
  // --- Internal State ---
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [importedVideo, setImportedVideo] = useState<MediaFile | null>(null);
  const [importedSubtitles, setImportedSubtitles] = useState<SubtitleCue[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);

  // --- Refs ---
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitialRenderRef = useRef(true);

  // --- Use Timeline Adapter ---
  // Convert external props to internal data model
  const {
    tracks,
    audioClips,
    videoClips,
    imageClips,
    subtitles: adapterSubtitles,
    selectedClipId,
    handleClipSelect,
    handleDeleteClip: _handleDeleteClip,
  } = useTimelineAdapter({
    scenes,
    visuals,
    narrationSegments,
    sfxPlan,
    selectedSceneId,
    onSceneSelect,
    onDeleteClip,
  });

  // Combine adapter subtitles with imported subtitles
  const allSubtitles = [...adapterSubtitles, ...importedSubtitles];

  // Calculate total clip count for keyboard navigation
  const allClips = [...videoClips, ...audioClips];
  const clipCount = allClips.length;

  // Calculate duration from scenes if not provided
  const calculatedDuration = scenes.reduce((sum, s) => sum + s.duration, 0) || _duration;

  // --- Screen Reader Announcements ---
  // Requirements: 8.3, 8.5
  // Property 15: Aria Announcement Content

  /**
   * Announce clip selection changes to screen readers.
   * When a clip is selected, announces the clip name and duration.
   *
   * @requirements 8.3
   * @validates Property 15: Aria Announcement Content
   */
  useEffect(() => {
    if (selectedClipId) {
      const clipInfo = findClipById(selectedClipId, videoClips, audioClips);
      if (clipInfo) {
        const durationStr = formatDurationForAnnouncement(clipInfo.duration);
        const announcement = `Selected: ${clipInfo.name}, duration ${durationStr}`;
        announceToScreenReader(announcement);
      }
    }
  }, [selectedClipId, videoClips, audioClips]);

  /**
   * Announce playback state changes to screen readers.
   * Announces "Playing" when playback starts and "Paused" when playback stops.
   * Skips the initial render to avoid announcing on component mount.
   *
   * @requirements 8.5
   */
  useEffect(() => {
    // Skip announcement on initial render
    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false;
      return;
    }
    
    const announcement = isPlaying ? "Playing" : "Paused";
    announceToScreenReader(announcement);
  }, [isPlaying]);

  // --- Keyboard Navigation ---
  // Integrate useTimelineKeyboard hook for keyboard shortcuts
  // Requirements: 7.1-7.7

  const handleNextClip = useCallback(() => {
    if (clipCount === 0) return;
    setSelectedClipIndex((prev) => {
      const next = prev === null ? 0 : (prev + 1) % clipCount;
      // Also update the clip selection
      const clip = allClips[next];
      if (clip) {
        handleClipSelect(clip.id);
      }
      return next;
    });
  }, [clipCount, allClips, handleClipSelect]);

  const handlePrevClip = useCallback(() => {
    if (clipCount === 0) return;
    setSelectedClipIndex((prev) => {
      const next = prev === null ? clipCount - 1 : (prev - 1 + clipCount) % clipCount;
      // Also update the clip selection
      const clip = allClips[next];
      if (clip) {
        handleClipSelect(clip.id);
      }
      return next;
    });
  }, [clipCount, allClips, handleClipSelect]);

  const handleJumpToStart = useCallback(() => {
    onSeek(0);
  }, [onSeek]);

  const handleJumpToEnd = useCallback(() => {
    onSeek(calculatedDuration);
  }, [onSeek, calculatedDuration]);

  const handleKeyboardDeleteClip = useCallback(
    (index: number) => {
      const clip = allClips[index];
      if (clip && onDeleteClip) {
        onDeleteClip(clip.id);
      }
    },
    [allClips, onDeleteClip]
  );

  const handleKeyboardSelectClip = useCallback(
    (index: number | null) => {
      setSelectedClipIndex(index);
      if (index !== null) {
        const clip = allClips[index];
        if (clip) {
          handleClipSelect(clip.id);
        }
      } else {
        handleClipSelect(null);
      }
    },
    [allClips, handleClipSelect]
  );

  // Use the keyboard navigation hook
  useTimelineKeyboard({
    isActive: isFocused && !isImportModalOpen,
    duration: calculatedDuration,
    currentTime,
    isPlaying,
    selectedClipIndex,
    clipCount,
    onTimeChange: onSeek,
    onPlayPause,
    onSelectClip: handleKeyboardSelectClip,
    onDeleteClip: handleKeyboardDeleteClip,
    onNextClip: handleNextClip,
    onPrevClip: handlePrevClip,
    onJumpToStart: handleJumpToStart,
    onJumpToEnd: handleJumpToEnd,
  });

  // --- Handlers ---

  /**
   * Handle zoom level change.
   * Clamps value to valid range [10, 100].
   */
  const handleZoomChange = useCallback((value: number) => {
    setZoom(Math.max(10, Math.min(100, value)));
  }, []);

  /**
   * Handle volume change.
   * Clamps value to valid range [0, 100].
   */
  const handleVolumeChange = useCallback((value: number) => {
    setVolume(Math.max(0, Math.min(100, value)));
  }, []);

  /**
   * Handle track selection in sidebar.
   */
  const handleSelectTrack = useCallback((trackId: string) => {
    setSelectedTrackId(trackId);
  }, []);

  /**
   * Handle text update for a track.
   * Currently a no-op as tracks are derived from scenes.
   * Future: Could update scene narration scripts.
   */
  const handleUpdateTrackText = useCallback(
    (trackId: string, text: string) => {
      // TODO: Implement track text editing
      // This would need to update the scene's narrationScript
      console.log("[AudioTimelineEditor] Track text update:", trackId, text);
    },
    []
  );

  /**
   * Handle generate audio request for a track.
   * Currently a no-op - would trigger narration generation.
   */
  const handleGenerateAudio = useCallback((trackId: string) => {
    // TODO: Implement audio generation trigger
    console.log("[AudioTimelineEditor] Generate audio for track:", trackId);
  }, []);

  /**
   * Handle adding a new voiceover track.
   */
  const handleAddVoiceoverTrack = useCallback(() => {
    // TODO: Implement adding new voiceover track
    console.log("[AudioTimelineEditor] Add voiceover track");
  }, []);

  /**
   * Handle adding a new SFX track.
   */
  const handleAddSfxTrack = useCallback(() => {
    // TODO: Implement adding new SFX track
    console.log("[AudioTimelineEditor] Add SFX track");
  }, []);

  /**
   * Handle adding a new subtitle track.
   */
  const handleAddSubtitleTrack = useCallback(() => {
    // TODO: Implement adding new subtitle track
    console.log("[AudioTimelineEditor] Add subtitle track");
  }, []);

  /**
   * Handle opening the import modal.
   */
  const handleOpenImportModal = useCallback(() => {
    setIsImportModalOpen(true);
  }, []);

  /**
   * Handle video import.
   * Stores the video locally and calls external callback if provided.
   */
  const handleImportVideo = useCallback(
    (file: MediaFile) => {
      setImportedVideo(file);
      onImportVideo?.(file);
    },
    [onImportVideo]
  );

  /**
   * Handle image import.
   * Calls external callback if provided.
   */
  const handleImportImage = useCallback(
    (file: MediaFile) => {
      onImportImage?.(file);
    },
    [onImportImage]
  );

  /**
   * Handle subtitle import.
   * Stores subtitles locally and calls external callback if provided.
   */
  const handleImportSubtitles = useCallback(
    (cues: SubtitleCue[]) => {
      setImportedSubtitles((prev) => [...prev, ...cues]);
      onImportSubtitles?.(cues);
    },
    [onImportSubtitles]
  );

  /**
   * Handle time update from video preview.
   * Syncs video playback with timeline.
   */
  const handleVideoTimeUpdate = useCallback(
    (time: number) => {
      // Only update if significantly different to avoid feedback loops
      if (Math.abs(time - currentTime) > 0.1) {
        onSeek(time);
      }
    },
    [currentTime, onSeek]
  );

  // --- Render ---

  // Unique ID for keyboard instructions (for aria-describedby)
  const keyboardInstructionsId = "timeline-keyboard-instructions";

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full flex-col overflow-hidden bg-background",
        className
      )}
      role="application"
      aria-label={`Audio Timeline Editor for ${projectName}`}
      aria-describedby={keyboardInstructionsId}
      tabIndex={0}
      data-testid={dataTestId}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        // Only blur if focus is leaving the container entirely
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setIsFocused(false);
        }
      }}
    >
      {/* Visually hidden keyboard instructions for screen readers */}
      {/* Requirements: 8.2, 8.6 */}
      <div
        id={keyboardInstructionsId}
        className="sr-only"
        aria-live="polite"
      >
        Keyboard shortcuts: Space or K to play/pause, Left arrow to seek back 1 second, 
        Right arrow to seek forward 1 second, Home to jump to start, End to jump to end, 
        Tab to navigate between clips, Delete to remove selected clip.
      </div>

      {/* Aria-live region for dynamic announcements (selection, playback state) */}
      {/* Requirements: 8.3, 8.5 */}
      <div
        id="timeline-announcements"
        className="sr-only"
        aria-live="assertive"
        aria-atomic="true"
      />

      {/* Top Section: Sidebar + Video Preview */}
      <div className="flex flex-1 min-h-0">
        {/* Track Sidebar - Left Panel */}
        <TrackSidebar
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          onSelectTrack={handleSelectTrack}
          onUpdateText={handleUpdateTrackText}
          onGenerateAudio={handleGenerateAudio}
        />

        {/* Video Preview - Center Panel */}
        <VideoPreview
          video={importedVideo}
          currentTime={currentTime}
          isPlaying={isPlaying}
          subtitles={allSubtitles}
          onTimeUpdate={handleVideoTimeUpdate}
          onPlayPause={onPlayPause}
        />
      </div>

      {/* Bottom Section: Timeline Controls + Timeline Panel */}
      <div className="flex flex-col border-t border-border">
        {/* Timeline Controls */}
        <TimelineControls
          isPlaying={isPlaying}
          onPlayPause={onPlayPause}
          zoom={zoom}
          onZoomChange={handleZoomChange}
          volume={volume}
          onVolumeChange={handleVolumeChange}
          selectedClipId={selectedClipId}
          onAddVoiceoverTrack={handleAddVoiceoverTrack}
          onAddSfxTrack={handleAddSfxTrack}
          onAddSubtitleTrack={handleAddSubtitleTrack}
          onOpenImportModal={handleOpenImportModal}
        />

        {/* Timeline Panel */}
        <TimelinePanel
          tracks={tracks}
          clips={audioClips}
          subtitles={allSubtitles}
          videoClips={videoClips}
          imageClips={imageClips}
          currentTime={currentTime}
          zoom={zoom}
          selectedClipId={selectedClipId}
          onSelectClip={handleClipSelect}
          onSeek={onSeek}
        />
      </div>

      {/* Import Media Modal */}
      <ImportMediaModal
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        onImportVideo={handleImportVideo}
        onImportImage={handleImportImage}
        onImportSubtitles={handleImportSubtitles}
      />
    </div>
  );
}

export default AudioTimelineEditor;

