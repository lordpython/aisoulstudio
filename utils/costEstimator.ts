/**
 * Cost Estimator Utility
 *
 * Estimates generation costs for the story workflow.
 * Used to display cost warnings before locking the screenplay.
 */

import type { StoryState } from '@/types';

/**
 * Detailed cost breakdown for transparency
 */
export interface CostBreakdown {
    scenes: number;
    shots: number;
    llmCost: number;
    imageCost: number;
    videoCost: number;
    total: number;
}

/**
 * Cost rates (estimated)
 */
const COST_RATES = {
    // LLM costs per scene
    sceneBreakdown: 0.10,       // Scene analysis and breakdown
    shotBreakdown: 0.05,        // Shot generation per scene

    // Image generation costs per shot
    imageGeneration: 0.08,      // Per image (Imagen 4 / similar)

    // Video generation costs (optional)
    videoGeneration: 0.25,      // Per video clip (Veo / similar)

    // Narration costs
    narrationPerMinute: 0.15,   // TTS per minute
};

/**
 * Estimate total project cost based on story state
 */
export function estimateProjectCost(story: StoryState): number {
    const sceneCount = story.breakdown.length;
    const shotCount = story.shots?.length || sceneCount * 5; // Estimate 5 shots per scene

    const llmCost = sceneCount * COST_RATES.sceneBreakdown;
    const shotLLMCost = sceneCount * COST_RATES.shotBreakdown;
    const imageCost = shotCount * COST_RATES.imageGeneration;

    return llmCost + shotLLMCost + imageCost;
}

/**
 * Get detailed cost breakdown
 */
export function getDetailedCostBreakdown(story: StoryState): CostBreakdown {
    const sceneCount = story.breakdown.length;
    const shotCount = story.shots?.length || sceneCount * 5;

    const llmCost = sceneCount * COST_RATES.sceneBreakdown + sceneCount * COST_RATES.shotBreakdown;
    const imageCost = shotCount * COST_RATES.imageGeneration;

    return {
        scenes: sceneCount,
        shots: shotCount,
        llmCost,
        imageCost,
        videoCost: 0, // Optional video generation
        total: llmCost + imageCost,
    };
}

/**
 * Estimate cost for shot breakdown only
 */
export function estimateShotBreakdownCost(sceneCount: number): number {
    return sceneCount * COST_RATES.shotBreakdown;
}

/**
 * Estimate cost for image generation
 */
export function estimateImageGenerationCost(shotCount: number): number {
    return shotCount * COST_RATES.imageGeneration;
}

/**
 * Estimate cost with video generation
 */
export function estimateWithVideoCost(story: StoryState, videoCount: number): number {
    const baseCost = estimateProjectCost(story);
    const videoCost = videoCount * COST_RATES.videoGeneration;
    return baseCost + videoCost;
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number): string {
    return `$${cost.toFixed(2)}`;
}

/**
 * Get cost tier label
 */
export function getCostTier(cost: number): 'low' | 'medium' | 'high' {
    if (cost < 1) return 'low';
    if (cost < 5) return 'medium';
    return 'high';
}

/**
 * Get cost tier color class
 */
export function getCostTierColor(cost: number): string {
    const tier = getCostTier(cost);
    switch (tier) {
        case 'low':
            return 'text-emerald-400';
        case 'medium':
            return 'text-amber-400';
        case 'high':
            return 'text-red-400';
    }
}
