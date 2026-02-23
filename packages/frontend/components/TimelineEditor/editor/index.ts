/**
 * Editor Sub-Components
 *
 * This directory contains the sub-components for the AudioTimelineEditor.
 * These components are adapted from the new-time-line reference implementation
 * with imports updated to use the project's path aliases (@/).
 *
 * @see .kiro/specs/timeline-editor-replacement/design.md for architecture details
 */

// Main editor panels
export { TrackSidebar } from "./TrackSidebar";
export { VideoPreview } from "./VideoPreview";
export { TimelinePanel } from "./TimelinePanel";
export { TimelineControls } from "./TimelineControls";
export { ImportMediaModal } from "./ImportMediaModal";

// Clip components
export { WaveformClip } from "./WaveformClip";
export { SubtitleClip } from "./SubtitleClip";
export { VideoClipComponent } from "./VideoClipComponent";
export { ImageClipComponent } from "./ImageClipComponent";
