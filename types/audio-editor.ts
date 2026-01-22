/**
 * Audio Editor Types
 *
 * Type definitions for the AudioTimelineEditor component and its sub-components.
 * These types define the internal data model used by the timeline editor.
 *
 * @see .kiro/specs/timeline-editor-replacement/design.md for architecture details
 */

/**
 * Represents a track in the timeline editor.
 * Tracks are horizontal lanes that contain clips of a specific media type.
 *
 * @requirements 9.1, 9.2, 9.3
 */
export interface Track {
  /** Unique identifier for the track */
  id: string;
  /** Type of media this track contains */
  type: "narrator" | "sfx" | "subtitle" | "video" | "image";
  /** Display name for the track */
  name: string;
  /** Text content associated with the track (e.g., narration script) */
  text: string;
  /** Whether the track's content has been generated */
  isGenerated: boolean;
}

/**
 * Represents an audio clip on a track (narrator or SFX).
 * Audio clips display waveform visualization.
 *
 * @requirements 9.2
 */
export interface AudioClip {
  /** Unique identifier for the clip */
  id: string;
  /** ID of the track this clip belongs to */
  trackId: string;
  /** Start time in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** Waveform data for visualization (normalized values 0-1) */
  waveformData: number[];
}

/**
 * Represents a video clip on the video track.
 * Video clips display thumbnail previews.
 *
 * @requirements 9.1
 */
export interface VideoClip {
  /** Unique identifier for the clip */
  id: string;
  /** ID of the track this clip belongs to */
  trackId: string;
  /** Start time in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** URL of the thumbnail image */
  thumbnailUrl: string;
  /** Display name for the clip */
  name: string;
}

/**
 * Represents an image clip on the image track.
 * Image clips display the image as a thumbnail.
 *
 * @requirements 9.1
 */
export interface ImageClip {
  /** Unique identifier for the clip */
  id: string;
  /** ID of the track this clip belongs to */
  trackId: string;
  /** Start time in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** URL of the image */
  imageUrl: string;
  /** Display name for the clip */
  name: string;
}

/**
 * Represents a subtitle cue on the subtitle track.
 * Subtitle cues have start and end times for display duration.
 *
 * @requirements 9.3
 */
export interface SubtitleCue {
  /** Unique identifier for the cue */
  id: string;
  /** ID of the track this cue belongs to */
  trackId: string;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Subtitle text content */
  text: string;
}

/**
 * Represents a media file that can be imported into the timeline.
 * Used by the import modal and media management.
 *
 * @requirements 9.1, 9.2, 9.3
 */
export interface MediaFile {
  /** Unique identifier for the file */
  id: string;
  /** Type of media file */
  type: "video" | "image" | "subtitle";
  /** Display name for the file */
  name: string;
  /** URL or data URI of the file */
  url: string;
  /** Duration in seconds (for video files) */
  duration?: number;
  /** URL of the thumbnail image (for video files) */
  thumbnailUrl?: string;
}

/**
 * Represents the current state of the timeline.
 * Used for managing playback and zoom state.
 */
export interface TimelineState {
  /** Current playback time in seconds */
  currentTime: number;
  /** Whether playback is active */
  isPlaying: boolean;
  /** Zoom level (10-100) */
  zoom: number;
  /** Total duration in seconds */
  duration: number;
}

/**
 * Represents the media files associated with a project.
 * Used for managing imported media.
 */
export interface ProjectMedia {
  /** Main video file */
  video: MediaFile | null;
  /** Imported image files */
  images: MediaFile[];
  /** Parsed subtitle cues */
  subtitles: SubtitleCue[];
}
