/**
 * Central export point for all application constants.
 * Import from this file for convenient access to all constants.
 *
 * @example
 * import { ART_STYLES, LANGUAGES, VIDEO_PURPOSES } from './constants';
 */

// Style constants
export {
  ART_STYLES,
  IMAGE_STYLE_MODIFIERS,
  VIDEO_STYLE_MODIFIERS,
  type ArtStyle,
} from "./styles";

// Language constants
export { LANGUAGES, CONTENT_LANGUAGES, getLanguageName, type Language, type LanguageOption, type LanguageCode } from "./languages";

// Video constants
export {
  VIDEO_PURPOSES,
  CAMERA_ANGLES,
  LIGHTING_MOODS,
  DEFAULT_NEGATIVE_CONSTRAINTS,
  type VideoPurposeOption,
  type VideoPurpose,
  type CameraAngle,
  type LightingMood,
  type NegativeConstraint,
} from "./video";
