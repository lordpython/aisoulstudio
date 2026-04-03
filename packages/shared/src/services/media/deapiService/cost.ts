/**
 * DeAPI cost estimation utilities
 */

import type { CostEstimate } from './types';

export const estimateBatchCost = (
  imageCount: number,
  videoCount: number,
  resolution: "16:9" | "9:16" | "1:1" = "16:9"
): CostEstimate => {
  const IMAGE_COST_BASE = 0.00136;
  const VIDEO_COST_BASE = 0.03;
  const resolutionMultiplier = resolution === "1:1" ? 1.2 : 1.0;

  const imageCost = imageCount * IMAGE_COST_BASE * resolutionMultiplier * 2;
  const videoCost = videoCount * VIDEO_COST_BASE * resolutionMultiplier;

  return {
    imageCount,
    videoCount,
    estimatedCostUSD: Math.round((imageCost + videoCost) * 1000) / 1000,
    breakdown: {
      images: Math.round(imageCost * 1000) / 1000,
      videos: Math.round(videoCost * 1000) / 1000,
    },
  };
};

export const checkCredits = async (): Promise<{ available: number; sufficient: boolean } | null> => {
  // TODO: Implement when DeAPI provides account balance endpoint
  return null;
};
