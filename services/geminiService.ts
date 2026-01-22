/**
 * Gemini Service
 * 
 * This module re-exports all functions from the split service modules
 * for backward compatibility. New code should import directly from
 * the specific service modules.
 * 
 * @module geminiService
 */

// Re-export from transcriptionService
export {
  fileToGenerativePart,
  transcribeAudio,
  transcribeAudioWithWordTiming,
} from "./transcriptionService";

// Re-export from promptService
export {
  // Types
  type PromptRefinementIntent,
  type PromptLintIssueCode,
  type PromptLintIssue,
  // Helper functions
  normalizeForSimilarity,
  countWords,
  jaccardSimilarity,
  lintPrompt,
  getPurposeGuidance,
  getPromptGenerationInstruction,
  // Main functions
  generatePromptsFromLyrics,
  generatePromptsFromStory,
  refineImagePrompt,
  generateMotionPrompt,
} from "./promptService";

// Re-export from imageService
export { generateImageFromPrompt } from "./imageService";

// Re-export from videoService
export { generateVideoFromPrompt } from "./videoService";

// Re-export from translationService
export { translateSubtitles } from "./translationService";

// Re-export VideoPurpose type from constants for backward compatibility
export { type VideoPurpose } from "../constants";
