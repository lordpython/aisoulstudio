/**
 * GraphiteTimeline Component
 * 
 * Main timeline component that assembles all sub-components:
 * - TransportBar: Playback controls and timecode display
 * - TimeRuler: Time scale with major/minor ticks
 * - TrackLabel: Track names in left sidebar
 * - TrackLane: Track lanes with clips
 * - Playhead: Current position indicator
 * - FooterNav: Zoom controls and project overview
 * 
 * Accessibility Features:
 * - Full keyboard navigation via useTimelineKeyboard hook
 * - ARIA roles and labels for screen readers
 * - Focus management and visual indicators
 * - Live regions for time announcements
 * 
 * Requirements: All (1.1-12.1) + Accessibility
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Scene, NarrationSegment } from "@/types";
import { buildTracks, TimelineClip } from "./graphite-timeline-utils";
import { TransportBar } from "./TransportBar";
import { TimeRuler } from "./TimeRuler";
import { TrackLabel } from "./TrackLabel";
import { TrackLane } from "./TrackLane";
import { Playhead, usePlayheadSeek } from "./Playhead";
import { FooterNav } from "./FooterNav";
import { useTimelineScroll } from "./useTimelineScroll";
import { useTimelineSelection } from "@/hooks/useTimelineSelection";
import { useTimelineKeyboard } from "@/hooks/useTimelineKeyboard";
import "./graphite-timeline.css";

// --- Types ---

export interface GraphiteTimelineProps {
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
  /** Project name to display in transport bar */
  projectName?: string;
  /** Optional additional CSS class */
  className?: string;
  /** SFX plan for ambient tracks */
  sfxPlan?: import("@/types").VideoSFXPlan | null;
  /** Callback when a clip should be deleted */
  onDeleteClip?: (clipId: string) => void;
}

// --- Constants ---

const MIN_ZOOM = 10; // pixels per second
const MAX_ZOOM = 200;
const DEFAULT_ZOOM = 50;
const SKIP_INTERVAL = 5; // seconds

// --- Helper Functions ---

/**
 * Formats time in seconds to a human-readable string for screen readers
 * @param seconds - Time in seconds
 * @returns Formatted string like "1 minute 30 seconds"
 */
function formatTimeForScreenReader(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  
  if (mins === 0) {
    return `${secs} second${secs !== 1 ? 's' : ''}`;
  }
  return `${mins} minute${mins !== 1 ? 's' : ''} ${secs} second${secs !== 1 ? 's' : ''}`;
}

/**
 * Formats timecode for display
 */
function formatTimecode(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30); // Assuming 30fps
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

// --- Noise Texture SVG ---

const NoiseTexture = () => (
  <svg className="graphite-noise" aria-hidden="true">
    <filter id="graphite-noise-filter">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.8"
        numOctaves="4"
        stitchTiles="stitch"
      />
    </filter>
    <rect filter="url(#graphite-noise-filter)" />
  </svg>
);

// --- Component ---

export function GraphiteTimeline({
  scenes,
  visuals = {},
  narrationSegments = [],
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onSeek,
  onSceneSelect,
  selectedSceneId,
  projectName = "UNTITLED",
  className = "",
  sfxPlan = null,
  onDeleteClip,
}: GraphiteTimelineProps) {
  // --- State ---
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [isFocused, setIsFocused] = useState(false);
  
  // --- Refs ---
  const timelineRef = useRef<HTMLDivElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  // --- Build Tracks ---
  // Memoize visuals to prevent unnecessary rebuilds when object reference changes but content is same
  const visualsJson = useMemo(() => JSON.stringify(visuals), [visuals]);
  
  const tracks = useMemo(() => {
    const parsedVisuals = JSON.parse(visualsJson) as Record<string, string>;
    const t = buildTracks(scenes, parsedVisuals, narrationSegments, sfxPlan);
    // Only log in development and limit frequency
    if (process.env.NODE_ENV === 'development') {
      console.log("[GraphiteTimeline] Tracks built:", t.length, "tracks,", t.find(tr => tr.id === "fx")?.clips.length || 0, "FX clips");
    }
    return t;
  }, [scenes, visualsJson, narrationSegments, sfxPlan]);

  // --- Flatten all clips for index-based navigation ---
  const allClips = useMemo(() => {
    const clips: Array<TimelineClip & { trackId: string }> = [];
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        clips.push({ ...clip, trackId: track.id });
      });
    });
    // Sort by start time for logical navigation order
    return clips.sort((a, b) => a.startTime - b.startTime);
  }, [tracks]);

  // --- Scroll Management ---
  const {
    scrollLeft,
    trackLanesRef,
    rulerRef,
    handleScroll,
    getVisibleRange,
  } = useTimelineScroll({
    currentTime,
    duration,
    zoom,
    isPlaying,
  });

  // --- Selection Management ---
  const {
    selectedClipId,
    handleSelectClip,
    handleClearSelection,
    setSelectedClipId,
  } = useTimelineSelection({
    initialSelectedId: selectedSceneId,
    onSceneSelect,
  });

  // --- Get selected clip index ---
  const selectedClipIndex = useMemo(() => {
    if (!selectedClipId) return null;
    const index = allClips.findIndex(clip => clip.id === selectedClipId);
    return index >= 0 ? index : null;
  }, [selectedClipId, allClips]);

  // Sync external selectedSceneId with internal state
  useEffect(() => {
    if (selectedSceneId !== undefined) {
      // The selectedSceneId could be a scene ID or null
      // We need to check if it matches any clip ID
    }
  }, [selectedSceneId]);

  // --- Playhead Seek ---
  const {
    isAnimating,
    handleMouseDown: handleSeekMouseDown,
    handleClick: handleSeekClick,
  } = usePlayheadSeek({
    zoom,
    scrollLeft,
    duration,
    onSeek,
  });

  // --- Transport Handlers ---
  const handleSkipBack = useCallback(() => {
    onSeek(Math.max(0, currentTime - SKIP_INTERVAL));
  }, [currentTime, onSeek]);

  const handleSkipForward = useCallback(() => {
    onSeek(Math.min(duration, currentTime + SKIP_INTERVAL));
  }, [currentTime, duration, onSeek]);

  // --- Zoom Handler ---
  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom)));
  }, []);

  // --- Keyboard Navigation Handlers ---
  const handleNextClip = useCallback(() => {
    if (allClips.length === 0) return;
    const nextIndex = selectedClipIndex === null ? 0 : Math.min(selectedClipIndex + 1, allClips.length - 1);
    const clip = allClips[nextIndex];
    if (clip) {
      setSelectedClipId(clip.id);
      // Also seek to the clip start
      onSeek(clip.startTime);
    }
  }, [allClips, selectedClipIndex, setSelectedClipId, onSeek]);

  const handlePrevClip = useCallback(() => {
    if (allClips.length === 0) return;
    const prevIndex = selectedClipIndex === null ? allClips.length - 1 : Math.max(selectedClipIndex - 1, 0);
    const clip = allClips[prevIndex];
    if (clip) {
      setSelectedClipId(clip.id);
      // Also seek to the clip start
      onSeek(clip.startTime);
    }
  }, [allClips, selectedClipIndex, setSelectedClipId, onSeek]);

  const handleDeleteSelectedClip = useCallback((index: number) => {
    const clip = allClips[index];
    if (clip && onDeleteClip) {
      onDeleteClip(clip.id);
      // Clear selection after delete
      setSelectedClipId(null);
    }
  }, [allClips, onDeleteClip, setSelectedClipId]);

  const handleJumpToStart = useCallback(() => {
    onSeek(0);
  }, [onSeek]);

  const handleJumpToEnd = useCallback(() => {
    onSeek(duration);
  }, [onSeek, duration]);

  // --- Integrate Keyboard Navigation ---
  const { shortcuts } = useTimelineKeyboard({
    isActive: isFocused,
    duration,
    currentTime,
    isPlaying,
    selectedClipIndex,
    clipCount: allClips.length,
    onTimeChange: onSeek,
    onPlayPause,
    onSelectClip: (index) => {
      if (index === null) {
        setSelectedClipId(null);
      } else {
        const clip = allClips[index];
        if (clip) {
          setSelectedClipId(clip.id);
        }
      }
    },
    onDeleteClip: onDeleteClip ? handleDeleteSelectedClip : undefined,
    onNextClip: handleNextClip,
    onPrevClip: handlePrevClip,
    onJumpToStart: handleJumpToStart,
    onJumpToEnd: handleJumpToEnd,
  });

  // --- Live Region Updates for Screen Readers ---
  const lastAnnouncedTimeRef = useRef<number>(currentTime);
  
  useEffect(() => {
    // Only announce significant time changes (more than 0.5 seconds)
    // to avoid flooding screen readers during playback
    if (Math.abs(currentTime - lastAnnouncedTimeRef.current) >= 0.5 && !isPlaying) {
      lastAnnouncedTimeRef.current = currentTime;
      // The live region will be read by screen readers
    }
  }, [currentTime, isPlaying]);

  // --- Focus Handler ---
  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Only blur if focus moved outside the timeline container
    if (!timelineRef.current?.contains(e.relatedTarget as Node)) {
      setIsFocused(false);
    }
  }, []);

  // --- Visible Range for Minimap ---
  const visibleRange = getVisibleRange();

  // --- Calculate Timeline Width ---
  const timelineWidth = Math.max(duration * zoom, 800);

  // --- Calculate Track Container Height ---
  const trackContainerHeight = tracks.length * 120; // --graphite-track-height

  // --- Class Names ---
  const containerClassNames = [
    "graphite-timeline",
    isFocused && "graphite-timeline--focused",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={timelineRef}
      className={containerClassNames}
      tabIndex={0}
      role="application"
      aria-label={`Timeline editor for ${projectName}. Use arrow keys to navigate time, Tab to select clips, Space to play/pause.`}
      aria-describedby="timeline-instructions"
      aria-activedescendant={selectedClipId || undefined}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {/* Screen reader instructions (visually hidden) */}
      <div id="timeline-instructions" className="sr-only">
        Press Space or K to play/pause. Use left/right arrows to move 1 second, Shift+arrows for 5 seconds, Ctrl+arrows for frame-by-frame.
        Press Home to jump to start, End to jump to end. Tab to navigate clips, Delete to remove selected clip, Escape to deselect.
        Number keys 0-9 jump to that percentage of the timeline.
      </div>
      
      {/* Live region for time announcements (screen readers) */}
      <div 
        ref={liveRegionRef}
        role="status" 
        aria-live="polite" 
        aria-atomic="true" 
        className="sr-only"
      >
        {!isPlaying && `Current time: ${formatTimeForScreenReader(currentTime)} of ${formatTimeForScreenReader(duration)}`}
        {isPlaying && 'Playing'}
      </div>

      {/* Selected clip announcement for screen readers */}
      {selectedClipId && (
        <div 
          role="status" 
          aria-live="assertive" 
          aria-atomic="true" 
          className="sr-only"
        >
          {(() => {
            const clip = allClips.find(c => c.id === selectedClipId);
            if (clip) {
              return `Selected clip: ${clip.name}, duration ${formatTimeForScreenReader(clip.duration)}`;
            }
            return '';
          })()}
        </div>
      )}

      <div className="graphite-timeline-workspace">
        {/* Noise Texture Overlay - Requirement 1.3 */}
        <NoiseTexture />

        {/* Transport Bar - Requirements 2.1-2.6 */}
        <TransportBar
          currentTime={currentTime}
          isPlaying={isPlaying}
          projectName={projectName}
          onPlayPause={onPlayPause}
          onSkipBack={handleSkipBack}
          onSkipForward={handleSkipForward}
        />

        {/* Timeline Area */}
        <div 
          className="graphite-timeline-area"
          role="region"
          aria-label="Timeline tracks"
        >
          {/* Tracks Container - holds labels and lanes side by side */}
          <div className="graphite-tracks-container">
            {/* Track Labels (Left Sidebar) - Requirement 4.2, 11.3 */}
            <div className="graphite-track-labels" role="group" aria-label="Track labels">
              {/* Ruler spacer to align with ruler */}
              <div className="graphite-ruler-spacer" aria-hidden="true" />
              {tracks.map((track) => (
                <TrackLabel key={track.id} name={track.name} />
              ))}
            </div>

            {/* Timeline Content (Ruler + Track Lanes) */}
            <div className="graphite-timeline-content">
              {/* Time Ruler - Requirements 3.1-3.5 */}
              <TimeRuler
                ref={rulerRef}
                duration={duration}
                zoom={zoom}
                scrollLeft={scrollLeft}
              />

              {/* Track Lanes Container */}
              <div
                ref={trackLanesRef}
                className="graphite-track-lanes"
                onScroll={handleScroll}
                role="list"
                aria-label="Track lanes with clips"
              >
                <div
                  className="graphite-track-lanes-inner"
                  style={{ width: `${timelineWidth}px` }}
                >
                  {tracks.map((track) => (
                    <TrackLane
                      key={track.id}
                      track={track}
                      zoom={zoom}
                      scrollLeft={0} // Clips position relative to inner container
                      selectedClipId={selectedClipId}
                      onClipSelect={handleSelectClip}
                      onLaneClick={handleClearSelection}
                      onSeekClick={handleSeekClick}
                      onSeekMouseDown={handleSeekMouseDown}
                    />
                  ))}
                </div>

                {/* Playhead - Requirements 7.1-7.6 */}
                <Playhead
                  currentTime={currentTime}
                  zoom={zoom}
                  scrollLeft={scrollLeft}
                  height={trackContainerHeight}
                  duration={duration}
                  isAnimating={isAnimating}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Navigation - Requirements 8.1-9.4 */}
        <FooterNav
          zoom={zoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          duration={duration}
          visibleStart={visibleRange.start}
          visibleEnd={visibleRange.end}
          onZoomChange={handleZoomChange}
          tracks={tracks}
        />
      </div>
    </div>
  );
}

export default GraphiteTimeline;

// Backward compatibility alias - can be used as drop-in replacement for VideoTimeline
export { GraphiteTimeline as VideoTimeline };
