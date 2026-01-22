/**
 * TimelineEditor - Barrel Export
 * 
 * Groups all timeline-related components for the video editing interface.
 * Provides a clean public API while hiding internal implementation details.
 * 
 * The AudioTimelineEditor is the new modernized timeline component that replaces
 * GraphiteTimeline while maintaining backward compatibility.
 */

// New AudioTimelineEditor component (recommended)
export { AudioTimelineEditor } from "./AudioTimelineEditor";
export type { AudioTimelineEditorProps } from "./AudioTimelineEditor";

// Backward-compatible aliases - AudioTimelineEditor exported as GraphiteTimeline and VideoTimeline
export { AudioTimelineEditor as GraphiteTimeline } from "./AudioTimelineEditor";
export { AudioTimelineEditor as VideoTimeline } from "./AudioTimelineEditor";
export type { AudioTimelineEditorProps as GraphiteTimelineProps } from "./AudioTimelineEditor";

// Adapter functions for data conversion
export {
  scenesToVideoTrack,
  narrationToAudioTrack,
  sfxPlanToTracks,
  clipIdToSceneId,
  sceneIdToClipId,
  convertToTimelineData,
  TRACK_IDS,
  CLIP_PREFIXES,
} from "./timelineAdapter";

// Accessibility helpers
export {
  formatDurationForAnnouncement,
  announceToScreenReader,
} from "./AudioTimelineEditor";

// Editor sub-components (exported for advanced customization)
export {
  TrackSidebar,
  VideoPreview,
  TimelinePanel,
  TimelineControls,
  ImportMediaModal,
  WaveformClip,
  SubtitleClip,
  VideoClipComponent,
  ImageClipComponent,
} from "./editor";

// Legacy components (deprecated - use AudioTimelineEditor instead)
// These are kept for backward compatibility with existing code
export { TransportBar } from "./TransportBar";
export { TimeRuler } from "./TimeRuler";
export { TrackLabel } from "./TrackLabel";
export { TrackLane } from "./TrackLane";
export { Playhead, usePlayheadSeek } from "./Playhead";
export { FooterNav } from "./FooterNav";
export { GraphiteClip } from "./GraphiteClip";
export { AudioClip } from "./AudioClip";

// Legacy utilities
export { buildTracks } from "./graphite-timeline-utils";
export { useTimelineScroll } from "./useTimelineScroll";
