/**
 * DeAPI public types and interfaces
 */

export type DeApiTier = "basic" | "premium" | "unknown";

export interface DeApiResponse {
  request_id: string;
  status: "pending" | "processing" | "done" | "error";
  progress?: string;
  preview?: string | null;
  result_url?: string;
  error?: string;
}

export type DeApiImageModel =
  | "Flux1schnell"
  | "Flux_2_Klein_4B_BF16"
  | "ZImageTurbo_INT8";

export const MODEL_RECOMMENDATIONS = {
  speed: "Flux1schnell" as DeApiImageModel,
  storyboard: "Flux_2_Klein_4B_BF16" as DeApiImageModel,
  quality: "ZImageTurbo_INT8" as DeApiImageModel,
} as const;

export interface Txt2ImgParams {
  prompt: string;
  model?: DeApiImageModel;
  width?: number;
  height?: number;
  guidance?: number;
  steps?: number;
  seed?: number;
  negative_prompt?: string;
  loras?: string;
  webhook_url?: string;
}

export interface Txt2VideoParams {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  guidance?: number;
  steps?: number;
  frames?: number;
  fps?: number;
  seed?: number;
  webhook_url?: string;
}

export interface Img2VideoParams {
  first_frame_image: string;
  last_frame_image?: string;
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  guidance?: number;
  steps?: number;
  frames?: number;
  fps?: number;
  seed?: number;
  webhook_url?: string;
}

export interface CostEstimate {
  imageCount: number;
  videoCount: number;
  estimatedCostUSD: number;
  breakdown: {
    images: number;
    videos: number;
  };
}

export interface BatchGenerationItem {
  id: string;
  prompt: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  model?: DeApiImageModel;
  negativePrompt?: string;
}

export interface BatchGenerationResult {
  id: string;
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export interface BatchGenerationProgress {
  completed: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
  results: BatchGenerationResult[];
}

export const DEAPI_TTS_MODELS = {
  QWEN3_VOICE_DESIGN: "Qwen3_TTS_12Hz_1_7B_VoiceDesign",
} as const;

export type DeApiTtsModel = typeof DEAPI_TTS_MODELS[keyof typeof DEAPI_TTS_MODELS];
