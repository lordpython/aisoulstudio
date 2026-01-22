/**
 * Asset Calculator Service
 * Dynamically calculates optimal number of image/video assets based on:
 * - Audio duration
 * - Semantic analysis from directorService (Themes, Motifs, Concrete Objects)
 * - Content density
 * - Video purpose
 */

import { VideoPurpose } from "../constants";
import type { AnalysisOutput } from "./directorService";

/**
 * Input for asset calculation
 */
export interface AssetCalculationInput {
    audioDuration: number; // seconds
    analysisOutput: AnalysisOutput;
    videoPurpose: VideoPurpose;
    contentType: "lyrics" | "story";
    minAssets?: number; // minimum assets (default: 6)
    maxAssets?: number; // maximum assets (default: 15)
}

/**
 * Result of asset calculation
 */
export interface AssetCalculationResult {
    optimalAssetCount: number;
    assetTimestamps: number[]; // seconds for each asset
    reasoning: string;
}

/**
 * Calculate optimal number of assets based on multiple factors
 */
export async function calculateOptimalAssets(
    input: AssetCalculationInput
): Promise<AssetCalculationResult> {
    const {
        audioDuration,
        analysisOutput,
        videoPurpose,
        minAssets = 6,
        maxAssets = 15,
    } = input;

    console.log("[AssetCalculator] Calculating optimal assets...");
    console.log(`[AssetCalculator] Duration: ${audioDuration}s, Purpose: ${videoPurpose}`);

    // Factor 1: Duration-based baseline
    const durationBaseline = calculateDurationBaseline(audioDuration);
    console.log(`[AssetCalculator] Duration baseline: ${durationBaseline} assets`);

    // Factor 2: Motif density analysis (Replaces section analysis)
    const motifBasedCount = calculateMotifBasedCount(analysisOutput);
    console.log(`[AssetCalculator] Motif-based count: ${motifBasedCount} assets`);

    // Factor 3: Video purpose adjustment
    const purposeAdjustedCount = adjustForPurpose(
        Math.max(durationBaseline, motifBasedCount),
        videoPurpose
    );
    console.log(`[AssetCalculator] Purpose-adjusted count: ${purposeAdjustedCount} assets`);

    // Factor 4: Content density (motif frequency)
    const densityAdjustedCount = adjustForContentDensity(
        purposeAdjustedCount,
        analysisOutput,
        audioDuration
    );
    console.log(`[AssetCalculator] Density-adjusted count: ${densityAdjustedCount} assets`);

    // Apply min/max constraints
    const optimalAssetCount = Math.max(
        minAssets,
        Math.min(maxAssets, densityAdjustedCount)
    );

    console.log(`[AssetCalculator] Final optimal count: ${optimalAssetCount} assets`);

    // Calculate timestamps for each asset
    const assetTimestamps = calculateAssetTimestamps(
        optimalAssetCount,
        audioDuration,
        analysisOutput
    );

    // Generate reasoning
    const reasoning = generateReasoning({
        audioDuration,
        durationBaseline,
        motifBasedCount,
        purposeAdjustedCount,
        densityAdjustedCount,
        optimalAssetCount,
        videoPurpose,
    });

    return {
        optimalAssetCount,
        assetTimestamps,
        reasoning,
    };
}

/**
 * Calculate baseline asset count based on audio duration
 */
function calculateDurationBaseline(duration: number): number {
    if (duration < 30) {
        // Short content: 6-8 assets
        return Math.round(6 + (duration / 30) * 2);
    } else if (duration < 60) {
        // Medium content: 8-10 assets
        return Math.round(8 + ((duration - 30) / 30) * 2);
    } else if (duration < 120) {
        // Long content: 10-12 assets
        return Math.round(10 + ((duration - 60) / 60) * 2);
    } else {
        // Very long content: 12-15 assets
        return Math.round(12 + Math.min(3, (duration - 120) / 60));
    }
}

/**
 * Calculate asset count based on concrete motif density
 */
function calculateMotifBasedCount(analysis: AnalysisOutput): number {
    const motifCount = analysis.concreteMotifs?.length || 0;

    if (motifCount === 0) {
        return 8; // Default
    }

    // Goal: ensure every concrete motif gets a high chance of being shown
    // We want at least as many assets as motifs, but capped for sanity
    return Math.min(15, Math.max(8, motifCount + 2));
}

/**
 * Adjust asset count based on video purpose
 */
function adjustForPurpose(count: number, purpose: VideoPurpose): number {
    switch (purpose) {
        case "social_short":
            // Fewer, faster cuts
            return Math.round(count * 0.75);
        case "music_video":
            // Balanced
            return count;
        case "documentary":
            // More coverage
            return Math.round(count * 1.2);
        case "commercial":
            // Product-focused, fewer cuts
            return Math.round(count * 0.8);
        case "podcast_visual":
            // Ambient, fewer changes
            return Math.round(count * 0.7);
        case "lyric_video":
            // Text-focused, moderate
            return Math.round(count * 0.9);
        default:
            return count;
    }
}

/**
 * Adjust asset count based on content density (motifs per minute)
 */
function adjustForContentDensity(
    count: number,
    analysis: AnalysisOutput,
    duration: number
): number {
    const motifCount = analysis.concreteMotifs?.length || 0;
    if (motifCount === 0) return count;

    const motifsPerMinute = motifCount / (duration / 60);

    // Highly dense motifs → more assets
    if (motifsPerMinute > 5) {
        return Math.round(count * 1.25);
    } else if (motifsPerMinute < 1) {
        return Math.round(count * 0.85);
    }

    return count;
}

/**
 * Calculate timestamps for each asset
 * Distributes assets across content with bias towards concrete motifs
 */
function calculateAssetTimestamps(
    count: number,
    duration: number,
    analysis: AnalysisOutput
): number[] {
    const timestamps: number[] = [];
    const motifTimes = (analysis.concreteMotifs || [])
        .map(m => parseTimestamp(m.timestamp))
        .sort((a, b) => a - b);

    if (motifTimes.length === 0) {
        // Even distribution if no motifs
        const interval = duration / (count + 1);
        for (let i = 1; i <= count; i++) {
            timestamps.push(i * interval);
        }
        return timestamps;
    }

    // Mix motif timestamps with even distribution
    // This ensures identified objects are shown, but gaps are filled
    const evenInterval = duration / (count + 1);
    const usedTimes = new Set<string>();

    // 1. Add motif times (up to count)
    motifTimes.slice(0, count).forEach(t => {
        timestamps.push(t);
        usedTimes.add(t.toFixed(1));
    });

    // 2. Fill remaining slots with even distribution
    let currentIdx = 1;
    while (timestamps.length < count && currentIdx <= count) {
        const candidate = currentIdx * evenInterval;
        // Simple check to avoid double-clumping
        if (!Array.from(usedTimes).some(ut => Math.abs(parseFloat(ut) - candidate) < 2)) {
            timestamps.push(candidate);
            usedTimes.add(candidate.toFixed(1));
        }
        currentIdx++;
    }

    return timestamps.sort((a, b) => a - b);
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(params: {
    audioDuration: number;
    durationBaseline: number;
    motifBasedCount: number;
    purposeAdjustedCount: number;
    densityAdjustedCount: number;
    optimalAssetCount: number;
    videoPurpose: VideoPurpose;
}): string {
    const {
        audioDuration,
        durationBaseline,
        motifBasedCount,
        purposeAdjustedCount,
        densityAdjustedCount,
        optimalAssetCount,
        videoPurpose,
    } = params;

    const parts: string[] = [];

    parts.push(`Audio duration: ${Math.round(audioDuration)}s`);
    parts.push(`Duration baseline: ${durationBaseline} assets`);
    parts.push(`Motif density: ${motifBasedCount} assets`);
    parts.push(`Purpose adjustment (${videoPurpose}): ${purposeAdjustedCount} assets`);
    parts.push(`Content density factor: ${densityAdjustedCount} assets`);
    parts.push(`Final optimal count: ${optimalAssetCount} assets`);

    return parts.join("\n");
}

/**
 * Parse timestamp string (MM:SS) to seconds
 */
function parseTimestamp(timestamp: string): number {
    const parts = timestamp.split(":");
    if (parts.length !== 2) {
        return 0;
    }

    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);

    return minutes * 60 + seconds;
}