/**
 * DeAPI public types and interfaces
 */

export type { DeApiImageModel, DeApiTtsModel } from './models';
export { DEAPI_TTS_MODELS, IMAGE_MODEL_RECOMMENDATIONS as MODEL_RECOMMENDATIONS } from './models';

export type DeApiTier = "basic" | "premium" | "unknown";

export interface DeApiResponse {
  request_id: string;
  status: "pending" | "processing" | "done" | "error";
  progress?: string;
  preview?: string | null;
  result_url?: string;
  error?: string;
}

export interface Txt2ImgParams {
  prompt: string;
  model?: import('./models').DeApiImageModel;
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
  model?: import('./models').DeApiImageModel;
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

