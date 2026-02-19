/**
 * TextClip — Blue text clip renderer for the timeline.
 */

import { Type } from 'lucide-react';
import type { EditorClip } from '../types/video-editor-types';
import '../video-editor.css';

interface TextClipProps {
  clip: EditorClip;
  zoom: number;
  isSelected: boolean;
  onSelect: (clipId: string) => void;
  onResizeStart?: (clipId: string, edge: 'left' | 'right', e: React.PointerEvent) => void;
}

export function TextClip({ clip, zoom, isSelected, onSelect, onResizeStart }: TextClipProps) {
  const left = clip.startTime * zoom;
  const width = Math.max(clip.duration * zoom, 20);

  return (
    <div
      className={`ve-clip ve-clip--text ${isSelected ? 'selected' : ''}`}
      style={{ left: `${left}px`, width: `${width}px` }}
      onClick={(e) => { e.stopPropagation(); onSelect(clip.id); }}
      role="button"
      aria-label={`Text: ${clip.text ?? clip.name}`}
      aria-selected={isSelected}
      tabIndex={0}
    >
      {/* Resize handles */}
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
      <Type size={14} className="ve-clip-icon" />
      <span className="ve-clip-name">{clip.text ?? clip.name}</span>
    </div>
  );
}
