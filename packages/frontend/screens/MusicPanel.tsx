/**
 * MusicPanel - editor/video-editor mode, extracted from StudioScreen
 *
 * Wraps the VideoEditor component for the editor studioMode. Named MusicPanel
 * to align with the three-panel architecture (video/story/music), where this
 * panel hosts the full-featured timeline video editor that includes music tracks.
 */

import React from 'react';
import { VideoEditor } from '@/components/VideoEditor';

export interface MusicPanelProps {
  className?: string;
}

export function MusicPanel({ className }: MusicPanelProps) {
  return <VideoEditor className={className} />;
}
