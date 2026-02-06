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

export async function calculateOptimalAssets(
    input: AssetCalculationInput
): Promise<AssetCalculationResult> {
    const {
        audioDuration,
        videoPurpose,
    } = input;

    console.log("[AssetCalculator] Calculating optimal assets (Synchronized to Video Gen limit)...");

    // --- CRITICAL FIX FOR 4-SECOND LOOPING ---
    // DeAPI/Kling/Luma generate exactly 4.0s or 5.0s clips.
    // If we make scenes longer than this, they loop awkwardly.
    const GENERATOR_MAX_DURATION = 4.0; // We want a 1:1 match: 1 video asset per 4 seconds of audio.
    // No looping allowed.

    let optimalAssetCount = Math.ceil(audioDuration / GENERATOR_MAX_DURATION);

    // Safety Clamp: Don't generate less than 4 clips, but allow up to 100 for long songs.
    optimalAssetCount = Math.max(optimalAssetCount, 4);

    // Generate timestamps
    const assetTimestamps: number[] = [];
    const step = audioDuration / optimalAssetCount;
    for (let i = 0; i < optimalAssetCount; i++) {
        assetTimestamps.push(i * step);
    }

    const reasoning = `Audio Duration: ${audioDuration.toFixed(1)}s
Generator Limit: ${GENERATOR_MAX_DURATION}s per clip
Looping Policy: STRICTLY DISABLED
Calculated Assets: ${optimalAssetCount} (to ensure continuous flow)`;

    console.log(reasoning);

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
 * Calculate asset count based on visual scene density
 */
function calculateSceneBasedCount(analysis: AnalysisOutput): number {
    const sceneCount = analysis.visualScenes?.length || 0;

    if (sceneCount === 0) {
        return 8; // Default
    }

    // Goal: ensure every visual scene gets a high chance of being shown
    // We want at least as many assets as scenes, but capped for sanity
    return Math.min(15, Math.max(8, sceneCount + 2));
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
    const sceneCount = analysis.visualScenes?.length || 0;
    if (sceneCount === 0) return count;

    const scenesPerMinute = sceneCount / (duration / 60);

    // Highly dense scenes → more assets
    if (scenesPerMinute > 5) {
        return Math.round(count * 1.25);
    } else if (scenesPerMinute < 1) {
        return Math.round(count * 0.85);
    }

    return count;
}

/**
 * Calculate timestamps for each asset
 * Distributes assets across content with bias towards visual scenes
 */
function calculateAssetTimestamps(
    count: number,
    duration: number,
    analysis: AnalysisOutput
): number[] {
    const timestamps: number[] = [];
    const sceneTimes = (analysis.visualScenes || [])
        .map(scene => parseTimestamp(scene.timestamp))
        .sort((a, b) => a - b);

    if (sceneTimes.length === 0) {
        // Even distribution if no scenes
        const interval = duration / (count + 1);
        for (let i = 1; i <= count; i++) {
            timestamps.push(i * interval);
        }
        return timestamps;
    }

    // Mix scene timestamps with even distribution
    // This ensures identified scenes are shown, but gaps are filled
    const evenInterval = duration / (count + 1);
    const usedTimes = new Set<string>();

    // 1. Add scene times (up to count)
    sceneTimes.slice(0, count).forEach(t => {
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

    const minStr = parts[0];
    const secStr = parts[1];
    if (minStr === undefined || secStr === undefined) return 0;

    const minutes = parseInt(minStr, 10);
    const seconds = parseInt(secStr, 10);

    return minutes * 60 + seconds;
}