/**
 * TrackRow
 *
 * A single track lane in the timeline. Renders clips of the appropriate type
 * and handles click-to-seek on empty areas.
 */

import type { EditorTrack, EditorClip } from './types/video-editor-types';
import { TextClip } from './clips/TextClip';
import { VideoTrackClip } from './clips/VideoTrackClip';
import { ImageTrackClip } from './clips/ImageTrackClip';
import { AudioTrackClip } from './clips/AudioTrackClip';
import './video-editor.css';

interface TrackRowProps {
  track: EditorTrack;
  clips: EditorClip[];
  zoom: number;
  selectedClipIds: string[];
  onSelectClip: (clipId: string) => void;
  onLaneClick?: () => void;
  onSeekClick?: (e: React.MouseEvent) => void;
  onResizeStart?: (clipId: string, edge: 'left' | 'right', e: React.PointerEvent) => void;
}

export function TrackRow({
  track,
  clips,
  zoom,
  selectedClipIds,
  onSelectClip,
  onLaneClick,
  onSeekClick,
  onResizeStart,
}: TrackRowProps) {
  const handleLaneClick = (e: React.MouseEvent) => {
    // Only fire if clicking on the lane background, not on a clip
    if ((e.target as HTMLElement).closest('.ve-clip')) return;
    onLaneClick?.();
    onSeekClick?.(e);
  };

  const renderClip = (clip: EditorClip) => {
    const isSelected = selectedClipIds.includes(clip.id);
    const props = { clip, zoom, isSelected, onSelect: onSelectClip, onResizeStart };

    switch (clip.type) {
      case 'text': return <TextClip key={clip.id} {...props} />;
      case 'video': return <VideoTrackClip key={clip.id} {...props} />;
      case 'image': return <ImageTrackClip key={clip.id} {...props} />;
      case 'audio': return <AudioTrackClip key={clip.id} {...props} />;
      default: return null;
    }
  };

  return (
    <div
      className={`ve-lane ve-lane--${track.type}`}
      onClick={handleLaneClick}
      role="row"
      aria-label={`${track.name} lane`}
    >
      {clips.map(renderClip)}
    </div>
  );
}
