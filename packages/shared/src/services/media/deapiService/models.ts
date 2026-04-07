/**
 * DeAPI Model Registry — Single source of truth for all DeAPI model slugs.
 *
 * Models are dynamically available via GET /api/v1/client/models,
 * but we pin known-good slugs here for type safety and UI display.
 *
 * Categories:
 *   IMAGE   — txt2img, img2img
 *   VIDEO   — txt2video, img2video, aud2video
 *   TTS     — txt2audio / predict
 *   UTILITY — img-rmbg, img-upscale, transcribe, OCR
 *   MUSIC   — txt2music
 *   PROMPT  — prompt/image, prompt/video, prompt/image2image, prompt/speech
 */

// ─── Image Models ────────────────────────────────────────────────────────────

export const DEAPI_IMAGE_MODELS = {
  FLUX_SCHNELL: 'Flux1schnell',
  FLUX_2_KLEIN: 'Flux_2_Klein_4B_BF16',
  ZIMAGE_TURBO: 'ZImageTurbo_INT8',
} as const;

export type DeApiImageModel = typeof DEAPI_IMAGE_MODELS[keyof typeof DEAPI_IMAGE_MODELS];

export const ALL_IMAGE_MODEL_SLUGS = Object.values(DEAPI_IMAGE_MODELS);

export const IMAGE_MODEL_META: Record<DeApiImageModel, {
  name: string;
  description: string;
  speed: 'fastest' | 'fast' | 'standard';
  supportsGuidance: boolean;
  defaultSteps: number;
  maxSteps: number;
}> = {
  [DEAPI_IMAGE_MODELS.FLUX_SCHNELL]: {
    name: 'FLUX Schnell',
    description: 'Fastest image generation, good for previews',
    speed: 'fastest',
    supportsGuidance: false,
    defaultSteps: 4,
    maxSteps: 10,
  },
  [DEAPI_IMAGE_MODELS.FLUX_2_KLEIN]: {
    name: 'FLUX.2 Klein',
    description: 'Fast with guidance support, good for storyboards',
    speed: 'fast',
    supportsGuidance: true,
    defaultSteps: 4,
    maxSteps: 10,
  },
  [DEAPI_IMAGE_MODELS.ZIMAGE_TURBO]: {
    name: 'ZImage Turbo',
    description: 'Photorealistic quality at turbo speed',
    speed: 'standard',
    supportsGuidance: true,
    defaultSteps: 4,
    maxSteps: 10,
  },
};

export const IMAGE_MODEL_RECOMMENDATIONS = {
  speed: DEAPI_IMAGE_MODELS.FLUX_SCHNELL,
  storyboard: DEAPI_IMAGE_MODELS.FLUX_2_KLEIN,
  quality: DEAPI_IMAGE_MODELS.ZIMAGE_TURBO,
} as const;

// ─── Video Models ────────────────────────────────────────────────────────────

export const DEAPI_VIDEO_MODELS = {
  LTX2_22B: 'Ltx2_3_22B_Dist_INT8',
} as const;

export type DeApiVideoModel = typeof DEAPI_VIDEO_MODELS[keyof typeof DEAPI_VIDEO_MODELS];

export const ALL_VIDEO_MODEL_SLUGS = Object.values(DEAPI_VIDEO_MODELS);

export const VIDEO_MODEL_META: Record<DeApiVideoModel, {
  name: string;
  description: string;
  defaultFrames: number;
  defaultFps: number;
  defaultGuidance: number;
  defaultSteps: number;
}> = {
  [DEAPI_VIDEO_MODELS.LTX2_22B]: {
    name: 'LTX-Video 2 22B',
    description: 'High-quality text/image-to-video generation',
    defaultFrames: 120,
    defaultFps: 30,
    defaultGuidance: 0,
    defaultSteps: 1,
  },
};

// ─── TTS Models ──────────────────────────────────────────────────────────────

export const DEAPI_TTS_MODELS = {
  QWEN3_VOICE_DESIGN: 'Qwen3_TTS_12Hz_1_7B_VoiceDesign',
} as const;

export type DeApiTtsModel = typeof DEAPI_TTS_MODELS[keyof typeof DEAPI_TTS_MODELS];

export const ALL_TTS_MODEL_SLUGS = Object.values(DEAPI_TTS_MODELS);

export const TTS_MODEL_META: Record<DeApiTtsModel, {
  name: string;
  description: string;
  supportsVoiceDesign: boolean;
  maxChars: number;
  minChars: number;
  sampleRate: number;
  format: string;
  languages: string[];
}> = {
  [DEAPI_TTS_MODELS.QWEN3_VOICE_DESIGN]: {
    name: 'Qwen3 VoiceDesign',
    description: '12Hz 1.7B model with voice design capabilities',
    supportsVoiceDesign: true,
    maxChars: 5000,
    minChars: 10,
    sampleRate: 24000,
    format: 'mp3',
    languages: [
      'English', 'Arabic', 'Chinese', 'Spanish', 'French',
      'German', 'Russian', 'Japanese', 'Korean',
    ],
  },
};

// ─── Utility Models ──────────────────────────────────────────────────────────

export const DEAPI_UTILITY_MODELS = {
  BG_REMOVAL: 'Ben2',
} as const;

export type DeApiUtilityModel = typeof DEAPI_UTILITY_MODELS[keyof typeof DEAPI_UTILITY_MODELS];

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEAPI_DEFAULTS = {
  IMAGE_MODEL: DEAPI_IMAGE_MODELS.FLUX_SCHNELL,
  VIDEO_MODEL: DEAPI_VIDEO_MODELS.LTX2_22B,
  TTS_MODEL: DEAPI_TTS_MODELS.QWEN3_VOICE_DESIGN,
  BG_REMOVAL_MODEL: DEAPI_UTILITY_MODELS.BG_REMOVAL,
  IMG2IMG_MODEL: DEAPI_IMAGE_MODELS.FLUX_2_KLEIN,
} as const;

// ─── Endpoint Registry (for reference / proxy routing) ───────────────────────

export const DEAPI_ENDPOINTS = {
  TXT2IMG: '/txt2img',
  IMG2IMG: '/img2img',
  TXT2VIDEO: '/txt2video',
  IMG2VIDEO: '/img2video',
  TXT2AUDIO: '/txt2audio',
  PREDICT: '/predict',
  IMG_RMBG: '/img-rmbg',
  IMG_UPSCALE: '/img-upscale',
  TRANSCRIBE: '/transcribe',
  IMG2TXT: '/img2txt',
  TXT2MUSIC: '/txt2music',
  TXT2EMBEDDING: '/txt2embedding',
  AUD2VIDEO: '/aud2video',
  VIDEOS_REPLACE: '/videos/replace',
  PROMPT_IMAGE: '/prompt/image',
  PROMPT_VIDEO: '/prompt/video',
  PROMPT_IMG2IMG: '/prompt/image2image',
  PROMPT_SPEECH: '/prompt/speech',
  REQUEST_STATUS: '/request-status',
} as const;

// ─── Dynamic Model Discovery ────────────────────────────────────────────────

export { deApiModelRegistry } from './modelDiscovery';
export type { DiscoveredModel, InferenceType } from './modelDiscovery';
