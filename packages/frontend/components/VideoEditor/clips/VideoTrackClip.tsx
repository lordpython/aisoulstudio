/**
 * VideoTrackClip — Teal video clip with repeating thumbnail tiles.
 */

import { Film } from 'lucide-react';
import type { EditorClip } from '../types/video-editor-types';
import '../video-editor.css';

interface VideoTrackClipProps {
  clip: EditorClip;
  zoom: number;
  isSelected: boolean;
  onSelect: (clipId: string) => void;
  onResizeStart?: (clipId: string, edge: 'left' | 'right', e: React.PointerEvent) => void;
}

export function VideoTrackClip({ clip, zoom, isSelected, onSelect, onResizeStart }: VideoTrackClipProps) {
  const left = clip.startTime * zoom;
  const width = Math.max(clip.duration * zoom, 20);
  const tileCount = Math.max(1, Math.floor(width / 50));

  return (
    <div
      className={`ve-clip ve-clip--video ${isSelected ? 'selected' : ''}`}
      style={{ left: `${left}px`, width: `${width}px` }}
      onClick={(e) => { e.stopPropagation(); onSelect(clip.id); }}
      role="button"
      aria-label={`Video: ${clip.name}`}
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
      {clip.thumbnailUrl ? (
        <div className="ve-thumb-strip">
          {Array.from({ length: tileCount }, (_, i) => (
            <div
              key={i}
              className="ve-thumb-tile"
              style={{ backgroundImage: `url(${clip.thumbnailUrl})` }}
            />
          ))}
        </div>
      ) : (
        <>
          <Film size={14} className="ve-clip-icon" />
          <span className="ve-clip-name">{clip.name}</span>
        </>
      )}
    </div>
  );
}
