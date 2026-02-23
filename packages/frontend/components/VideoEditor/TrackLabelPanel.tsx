/**
 * TrackLabelPanel
 *
 * Left sidebar of the timeline showing track names, type icons,
 * lock/mute toggle buttons for each track.
 */

import {
  Video, Image, Type, Music,
  Lock, Unlock, Eye, EyeOff,
} from 'lucide-react';
import type { EditorTrack, EditorTrackType } from './types/video-editor-types';
import './video-editor.css';

const TRACK_ICONS: Record<EditorTrackType, React.ElementType> = {
  video: Video,
  image: Image,
  text: Type,
  audio: Music,
};

interface TrackLabelPanelProps {
  tracks: EditorTrack[];
  selectedTrackId: string | null;
  onSelectTrack: (trackId: string) => void;
  onToggleLock: (trackId: string) => void;
  onToggleVisibility: (trackId: string) => void;
}

export function TrackLabelPanel({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onToggleLock,
  onToggleVisibility,
}: TrackLabelPanelProps) {
  const sorted = [...tracks].sort((a, b) => a.order - b.order);

  return (
    <div className="ve-track-labels" role="list" aria-label="Track labels">
      <div className="ve-track-label-spacer" />
      {sorted.map(track => {
        const Icon = TRACK_ICONS[track.type];
        return (
          <div
            key={track.id}
            className={`ve-track-label ${selectedTrackId === track.id ? 'selected' : ''}`}
            onClick={() => onSelectTrack(track.id)}
            role="listitem"
            aria-label={`${track.name} track`}
          >
            <div className="ve-track-label-icon">
              <Icon size={14} />
            </div>
            <span className="ve-track-label-name">{track.name}</span>
            <div className="ve-track-label-actions">
              <button
                className={`ve-track-action-btn ${track.isLocked ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToggleLock(track.id); }}
                title={track.isLocked ? 'Unlock track' : 'Lock track'}
                aria-label={track.isLocked ? 'Unlock track' : 'Lock track'}
              >
                {track.isLocked ? <Lock size={12} /> : <Unlock size={12} />}
              </button>
              <button
                className={`ve-track-action-btn ${!track.isVisible ? 'muted' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToggleVisibility(track.id); }}
                title={track.isVisible ? 'Hide track' : 'Show track'}
                aria-label={track.isVisible ? 'Hide track' : 'Show track'}
              >
                {track.isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
