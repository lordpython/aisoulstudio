/**
 * ImageTrackClip — Green image clip with thumbnail preview.
 */

import { ImageIcon } from 'lucide-react';
import type { EditorClip } from '../types/video-editor-types';
import '../video-editor.css';

interface ImageTrackClipProps {
  clip: EditorClip;
  zoom: number;
  isSelected: boolean;
  onSelect: (clipId: string) => void;
  onResizeStart?: (clipId: string, edge: 'left' | 'right', e: React.PointerEvent) => void;
}

export function ImageTrackClip({ clip, zoom, isSelected, onSelect, onResizeStart }: ImageTrackClipProps) {
  const left = clip.startTime * zoom;
  const width = Math.max(clip.duration * zoom, 20);

  return (
    <div
      className={`ve-clip ve-clip--image ${isSelected ? 'selected' : ''}`}
      style={{ left: `${left}px`, width: `${width}px` }}
      onClick={(e) => { e.stopPropagation(); onSelect(clip.id); }}
      role="button"
      aria-label={`Image: ${clip.name}`}
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
      {clip.imageUrl ? (
        <img src={clip.imageUrl} alt={clip.name} className="ve-image-thumb" />
      ) : (
        <>
          <ImageIcon size={14} className="ve-clip-icon" />
          <span className="ve-clip-name">{clip.name}</span>
        </>
      )}
    </div>
  );
}
