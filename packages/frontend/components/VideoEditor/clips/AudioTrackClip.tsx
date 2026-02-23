/**
 * AudioTrackClip — Orange audio clip with waveform visualization.
 */

import { Music } from 'lucide-react';
import { useMemo } from 'react';
import type { EditorClip } from '../types/video-editor-types';
import { TRACK_COLORS } from '../types/video-editor-types';
import '../video-editor.css';

interface AudioTrackClipProps {
  clip: EditorClip;
  zoom: number;
  isSelected: boolean;
  onSelect: (clipId: string) => void;
  onResizeStart?: (clipId: string, edge: 'left' | 'right', e: React.PointerEvent) => void;
}

/**
 * Generate pseudo-random waveform bars if no waveformData is provided.
 * Uses a seed derived from the clip ID for consistent rendering.
 */
function generateWaveform(clipId: string, barCount: number): number[] {
  let hash = 0;
  for (let i = 0; i < clipId.length; i++) {
    hash = ((hash << 5) - hash + clipId.charCodeAt(i)) | 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    hash = ((hash * 1103515245 + 12345) & 0x7fffffff);
    bars.push(0.2 + (hash % 100) / 125);
  }
  return bars;
}

export function AudioTrackClip({ clip, zoom, isSelected, onSelect, onResizeStart }: AudioTrackClipProps) {
  const left = clip.startTime * zoom;
  const width = Math.max(clip.duration * zoom, 20);
  const barCount = Math.max(8, Math.floor(width / 4));

  const waveform = useMemo(() => {
    return clip.waveformData ?? generateWaveform(clip.id, barCount);
  }, [clip.id, clip.waveformData, barCount]);

  const maxBarHeight = 36;
  const color = TRACK_COLORS.audio.waveform;

  return (
    <div
      className={`ve-clip ve-clip--audio ${isSelected ? 'selected' : ''}`}
      style={{ left: `${left}px`, width: `${width}px` }}
      onClick={(e) => { e.stopPropagation(); onSelect(clip.id); }}
      role="button"
      aria-label={`Audio: ${clip.name}`}
      aria-selected={isSelected}
      tabIndex={0}
    >
      {isSelected && (
        <>
          <div
            className="ve-resize-handle ve-resize-handle--left"
            onPointerDown={(e) => onResizeStart?.(clip.id, 'left', e)}
          />
          <div
            className="ve-resize-handle ve-resize-handle--right"
            onPointerDown={(e) => onResizeStart?.(clip.id, 'right', e)}
          />
        </>
      )}
      <Music size={12} className="ve-clip-icon" style={{ flexShrink: 0, marginRight: 2 }} />
      <div className="ve-waveform">
        {waveform.slice(0, barCount).map((amp, i) => (
          <div
            key={i}
            className="ve-wave-bar"
            style={{
              height: `${Math.max(4, amp * maxBarHeight)}px`,
              background: color,
            }}
          />
        ))}
      </div>
    </div>
  );
}
