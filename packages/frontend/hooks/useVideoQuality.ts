/**
 * useVideoQuality Hook
 * 
 * Handles quality monitoring and reporting for video production.
 * Manages quality reports, history, and validation.
 */

import { useState, useCallback } from "react";
import { ContentPlan, NarrationSegment, ValidationResult } from "@/types";
import { VideoSFXPlan } from "@/services/sfxService";
import { VideoPurpose } from "@/constants";
import {
    generateQualityReport,
    saveReportToHistory,
    getQualityHistory,
    getHistoricalAverages,
    getQualitySummary,
    exportReportAsJson,
    ProductionQualityReport
} from "@/services/qualityMonitorService";
import { validateContentPlan } from "@/services/editorService";
import { ProductionProgress } from "@/services/agentOrchestrator";

export interface VideoQualityState {
    qualityReport: ProductionQualityReport | null;
}

export function useVideoQuality(
    onProgress?: (progress: ProductionProgress) => void,
    onError?: (error: string) => void
) {
    const [qualityReport, setQualityReport] = useState<ProductionQualityReport | null>(null);

    /**
     * Generate and save quality report
     */
    const generateAndSaveQualityReport = useCallback((
        contentPlan: ContentPlan,
        narrationSegments: NarrationSegment[],
        sfxPlan: VideoSFXPlan | null,
        validation: ValidationResult,
        videoPurpose: VideoPurpose
    ) => {
        const report = generateQualityReport(
            contentPlan,
            narrationSegments,
            sfxPlan,
            validation,
            videoPurpose
        );
        setQualityReport(report);
        saveReportToHistory(report);
        console.log(`[useVideoQuality] Quality Report: ${report.overallScore}/100`);
        return report;
    }, []);

    /**
     * Validate the current plan
     */
    const runValidation = useCallback(async (
        contentPlan: ContentPlan,
        narrationSegments: NarrationSegment[],
        visuals: any[]
    ): Promise<ValidationResult | null> => {
        if (!contentPlan) {
            onError?.("No content plan to validate");
            return null;
        }

        onProgress?.({
            stage: "validating",
            progress: 0,
            message: "Validating production...",
        });

        try {
            const result = await validateContentPlan(contentPlan, {
                narrationSegments,
                visuals,
                useAICritique: true,
            });

            onProgress?.({
                stage: "validating",
                progress: 100,
                message: `Validation score: ${result.score}/100`,
            });

            return result;
        } catch (err) {
            console.error("[useVideoQuality] Validation failed:", err);
            onError?.(err instanceof Error ? err.message : String(err));
            return null;
        }
    }, [onProgress, onError]);

    /**
     * Get quality history from localStorage
     */
    const getQualityHistoryData = useCallback(() => {
        return getQualityHistory();
    }, []);

    /**
     * Get historical quality averages and trend
     */
    const getQualityTrend = useCallback(() => {
        return getHistoricalAverages();
    }, []);

    /**
     * Export current quality report as JSON
     */
    const exportQualityReport = useCallback(() => {
        if (!qualityReport) return null;
        return exportReportAsJson(qualityReport);
    }, [qualityReport]);

    /**
     * Get quality summary string
     */
    const getQualitySummaryText = useCallback(() => {
        if (!qualityReport) return null;
        return getQualitySummary(qualityReport);
    }, [qualityReport]);

    /**
     * Reset quality state
     */
    const resetQuality = useCallback(() => {
        setQualityReport(null);
    }, []);

    return {
        // State
        qualityReport,

        // Actions
        generateAndSaveQualityReport,
        runValidation,
        getQualityHistoryData,
        getQualityTrend,
        exportQualityReport,
        getQualitySummaryText,
        resetQuality,
        setQualityReport,
    };
}