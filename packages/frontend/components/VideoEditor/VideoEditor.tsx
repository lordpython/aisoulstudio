/**
 * VideoEditor
 *
 * Top-level layout component for the professional video editor.
 * Orchestrates toolbar, canvas preview, transport bar, and multi-track timeline.
 *
 * Layout:
 * ┌──────────┬─────────────────────────────────────┐
 * │ Toolbar  │ [Tool Panel?] │ Canvas Preview      │
 * │ (48px)   │ (280px)       │                     │
 * ├──────────┴───────────────┴─────────────────────┤
 * │ Enhanced Transport Bar                         │
 * ├────────────────────────────────────────────────┤
 * │ Track Labels │ MultiTrack Timeline             │
 * │ (160px)      │ (TimeRuler + Tracks + Playhead) │
 * └────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useRef } from 'react';
import { useVideoEditorStore } from './hooks/useVideoEditorStore';
import { VideoEditorToolbar } from './VideoEditorToolbar';
import { ToolPanelRouter } from './ToolPanels';
import { CanvasPreview } from './CanvasPreview';
import { EnhancedTransportBar } from './EnhancedTransportBar';
import { TrackLabelPanel } from './TrackLabelPanel';
import { MultiTrackTimeline } from './MultiTrackTimeline';
import type { EditorTrackType, ToolPanel } from './types/video-editor-types';
import { DEFAULT_TEXT_STYLE } from './types/video-editor-types';
import './video-editor.css';

const SKIP_INTERVAL = 5;

interface VideoEditorProps {
  className?: string;
}

export function VideoEditor({ className = '' }: VideoEditorProps) {
  const store = useVideoEditorStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // ---- Playback Loop ----
  useEffect(() => {
    if (!store.isPlaying) return;
    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      const { currentTime, duration } = useVideoEditorStore.getState();
      const newTime = currentTime + delta;
      if (newTime >= duration) {
        store.setIsPlaying(false);
        store.setCurrentTime(duration);
        return;
      }
      store.setCurrentTime(newTime);
      playbackRef.current = requestAnimationFrame(tick);
    };

    playbackRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playbackRef.current);
  }, [store.isPlaying]);

  // ---- Transport Handlers ----
  const handlePlayPause = useCallback(() => store.togglePlayback(), [store]);
  const handleSkipBack = useCallback(() => {
    store.setCurrentTime(Math.max(0, store.currentTime - SKIP_INTERVAL));
  }, [store]);
  const handleSkipForward = useCallback(() => {
    store.setCurrentTime(Math.min(store.duration, store.currentTime + SKIP_INTERVAL));
  }, [store]);

  const handleSplit = useCallback(() => {
    if (store.selectedClipIds.length === 1) {
      store.splitClipAtPlayhead(store.selectedClipIds[0]!);
    }
  }, [store]);

  // ---- Tool Panel ----
  const handlePanelToggle = useCallback((panel: NonNullable<ToolPanel>) => {
    store.setActiveToolPanel(panel);
  }, [store]);

  // ---- Add Text Clip ----
  const handleAddTextClip = useCallback((text: string) => {
    // Find or create a text track
    let textTrack = store.tracks.find(t => t.type === 'text');
    if (!textTrack) {
      store.addTrack('text');
      textTrack = useVideoEditorStore.getState().tracks.find(t => t.type === 'text');
    }
    if (!textTrack) return;

    store.addClip({
      trackId: textTrack.id,
      type: 'text',
      startTime: store.currentTime,
      duration: 3,
      name: text,
      text,
      textStyle: { ...DEFAULT_TEXT_STYLE },
      inPoint: 0,
      outPoint: 3,
    });
  }, [store]);

  // ---- Add Track ----
  const handleAddTrack = useCallback((type: EditorTrackType) => {
    store.addTrack(type);
  }, [store]);

  // ---- Resize Handler ----
  const handleResizeStart = useCallback((clipId: string, edge: 'left' | 'right', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    const laneElement = target.closest('.ve-track-lanes');
    if (!laneElement) return;

    const zoom = store.zoom;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const rect = laneElement.getBoundingClientRect();
      const scrollLeft = (laneElement as HTMLElement).scrollLeft;
      const x = moveEvent.clientX - rect.left + scrollLeft;
      const newTime = Math.max(0, x / zoom);
      store.resizeClip(clipId, edge, newTime);
    };

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }, [store]);

  // ---- Keyboard Shortcuts ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          store.togglePlayback();
          break;
        case 'j':
        case 'ArrowLeft':
          e.preventDefault();
          store.setCurrentTime(Math.max(0, store.currentTime - (e.shiftKey ? 5 : 1)));
          break;
        case 'l':
        case 'ArrowRight':
          e.preventDefault();
          store.setCurrentTime(Math.min(store.duration, store.currentTime + (e.shiftKey ? 5 : 1)));
          break;
        case 'Home':
          e.preventDefault();
          store.setCurrentTime(0);
          break;
        case 'End':
          e.preventDefault();
          store.setCurrentTime(store.duration);
          break;
        case 's':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            handleSplit();
          }
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) store.redo();
            else store.undo();
          }
          break;
        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            store.redo();
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (store.selectedClipIds.length > 0) {
            e.preventDefault();
            for (const id of store.selectedClipIds) {
              store.removeClip(id);
            }
          }
          break;
        case 'Escape':
          store.deselectAll();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store, handleSplit]);

  const isPanelOpen = store.activeToolPanel !== null;

  return (
    <div
      ref={containerRef}
      className={`video-editor ${isPanelOpen ? 'video-editor--panel-open' : ''} ${className}`}
      role="application"
      aria-label="Video Editor"
      tabIndex={0}
    >
      {/* Left toolbar — spans all rows */}
      <VideoEditorToolbar
        activePanel={store.activeToolPanel}
        onPanelToggle={handlePanelToggle}
      />

      {/* Tool panel (conditionally rendered between toolbar and preview) */}
      {isPanelOpen && (
        <ToolPanelRouter
          activePanel={store.activeToolPanel}
          tracks={store.tracks}
          onToggleVisibility={store.toggleTrackVisibility}
          onRemoveTrack={store.removeTrack}
          onAddTrack={handleAddTrack}
          onAddTextClip={handleAddTextClip}
        />
      )}

      {/* Canvas stage */}
      <div className="ve-stage">
        <div className="ve-stage-inner">
          <CanvasPreview
            clips={store.clips}
            currentTime={store.currentTime}
            aspectRatio={store.aspectRatio}
            isPlaying={store.isPlaying}
            className="ve-stage-preview"
          />
        </div>
      </div>

      {/* Transport bar — spans full width below preview */}
      <EnhancedTransportBar
        currentTime={store.currentTime}
        duration={store.duration}
        isPlaying={store.isPlaying}
        zoom={store.zoom}
        aspectRatio={store.aspectRatio}
        activeTool={store.activeTool}
        canUndo={store.undoStack.length > 0}
        canRedo={store.redoStack.length > 0}
        onPlayPause={handlePlayPause}
        onSkipBack={handleSkipBack}
        onSkipForward={handleSkipForward}
        onUndo={store.undo}
        onRedo={store.redo}
        onSplit={handleSplit}
        onZoomChange={store.setZoom}
        onAspectRatioChange={store.setAspectRatio}
        onFullscreen={() => {
          if (containerRef.current) {
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else {
              containerRef.current.requestFullscreen();
            }
          }
        }}
      />

      {/* Timeline area: labels + tracks */}
      <div
        className="ve-timeline-area"
        style={{ gridColumn: isPanelOpen ? '2 / -1' : '2 / -1' }}
      >
        <TrackLabelPanel
          tracks={store.tracks}
          selectedTrackId={store.selectedTrackId}
          onSelectTrack={store.selectTrack}
          onToggleLock={store.toggleTrackLock}
          onToggleVisibility={store.toggleTrackVisibility}
        />
        <MultiTrackTimeline
          tracks={store.tracks}
          clips={store.clips}
          currentTime={store.currentTime}
          duration={store.duration}
          isPlaying={store.isPlaying}
          zoom={store.zoom}
          selectedClipIds={store.selectedClipIds}
          onSeek={store.setCurrentTime}
          onSelectClip={(id) => store.selectClip(id)}
          onDeselectAll={store.deselectAll}
          onSelectTrack={store.selectTrack}
          onResizeStart={handleResizeStart}
        />
      </div>
    </div>
  );
}
