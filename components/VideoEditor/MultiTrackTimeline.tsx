/**
 * MultiTrackTimeline
 *
 * The timeline panel containing the time ruler, track lanes, and playhead.
 * Reuses TimeRuler, Playhead, and usePlayheadSeek from the existing timeline.
 */

import { useRef, useCallback, useMemo } from 'react';
import { TimeRuler } from '@/components/TimelineEditor/TimeRuler';
import { Playhead, usePlayheadSeek } from '@/components/TimelineEditor/Playhead';
import { useTimelineScroll } from '@/components/TimelineEditor/useTimelineScroll';
import type { EditorTrack, EditorClip } from './types/video-editor-types';
import { TrackRow } from './TrackRow';
import './video-editor.css';

interface MultiTrackTimelineProps {
  tracks: EditorTrack[];
  clips: EditorClip[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  zoom: number;
  selectedClipIds: string[];
  onSeek: (time: number) => void;
  onSelectClip: (clipId: string) => void;
  onDeselectAll: () => void;
  onSelectTrack: (trackId: string) => void;
  onResizeStart?: (clipId: string, edge: 'left' | 'right', e: React.PointerEvent) => void;
}

export function MultiTrackTimeline({
  tracks,
  clips,
  currentTime,
  duration,
  isPlaying,
  zoom,
  selectedClipIds,
  onSeek,
  onSelectClip,
  onDeselectAll,
  onSelectTrack,
  onResizeStart,
}: MultiTrackTimelineProps) {
  const trackLanesContainerRef = useRef<HTMLDivElement>(null);

  // Reuse scroll sync hook from existing timeline
  const {
    scrollLeft,
    trackLanesRef,
    rulerRef,
    handleScroll,
  } = useTimelineScroll({
    currentTime,
    zoom,
    isPlaying,
    duration,
    autoScrollMargin: 100,
  });

  // Reuse playhead seek hook
  const {
    isAnimating,
    handleMouseDown: seekMouseDown,
    handleClick: seekClick,
  } = usePlayheadSeek({
    zoom,
    scrollLeft,
    duration,
    onSeek,
  });

  // Sort tracks by order
  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => a.order - b.order),
    [tracks],
  );

  // Group clips by track
  const clipsByTrack = useMemo(() => {
    const map = new Map<string, EditorClip[]>();
    for (const track of tracks) {
      map.set(track.id, []);
    }
    for (const clip of clips) {
      const arr = map.get(clip.trackId);
      if (arr) arr.push(clip);
    }
    return map;
  }, [tracks, clips]);

  const totalWidth = Math.max(duration * zoom, 800);
  const trackHeight = 64; // --ve-track-height
  const totalTrackHeight = sortedTracks.length * trackHeight;

  // Create a combined ref handler for track lanes
  const setTrackLanesRef = useCallback((node: HTMLDivElement | null) => {
    // Update the scroll hook's ref
    (trackLanesRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    trackLanesContainerRef.current = node;
  }, [trackLanesRef]);

  return (
    <div className="ve-timeline-content">
      {/* Time ruler — syncs scroll with track lanes */}
      <TimeRuler
        ref={rulerRef}
        duration={duration}
        zoom={zoom}
        scrollLeft={scrollLeft}
      />

      {/* Track lanes with playhead */}
      <div
        ref={setTrackLanesRef}
        className="ve-track-lanes"
        onScroll={handleScroll}
        onClick={seekClick}
        onMouseDown={seekMouseDown}
      >
        <div
          className="ve-track-lanes-inner"
          style={{ width: `${totalWidth}px` }}
        >
          {sortedTracks.map(track => (
            <TrackRow
              key={track.id}
              track={track}
              clips={clipsByTrack.get(track.id) ?? []}
              zoom={zoom}
              selectedClipIds={selectedClipIds}
              onSelectClip={onSelectClip}
              onLaneClick={() => {
                onDeselectAll();
                onSelectTrack(track.id);
              }}
              onResizeStart={onResizeStart}
            />
          ))}

          {/* Empty state when no tracks */}
          {sortedTracks.length === 0 && (
            <div className="ve-empty-state" style={{ height: '120px' }}>
              <p>Add tracks using the toolbar to get started</p>
            </div>
          )}
        </div>

        {/* Playhead overlay */}
        <Playhead
          currentTime={currentTime}
          zoom={zoom}
          scrollLeft={scrollLeft}
          height={Math.max(totalTrackHeight, 120)}
          duration={duration}
          isAnimating={isAnimating}
        />
      </div>
    </div>
  );
}
