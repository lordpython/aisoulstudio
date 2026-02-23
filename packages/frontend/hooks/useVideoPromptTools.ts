/**
 * useVideoPromptTools Hook
 * 
 * Handles prompt quality checking and improvement tools for video production.
 * Provides AI-powered prompt refinement and quality analysis.
 */

import { useCallback } from "react";
import { ContentPlan } from "@/types";
import {
    lintPrompt,
    refineImagePrompt,
    type PromptLintIssue
} from "@/services/promptService";

export function useVideoPromptTools(
    contentPlan: ContentPlan | null,
    visualStyle: string,
    topic: string
) {
    /**
     * Lint a prompt for quality issues
     */
    const checkPromptQuality = useCallback((promptText: string, globalSubject?: string): PromptLintIssue[] => {
        return lintPrompt({
            promptText,
            globalSubject,
            previousPrompts: contentPlan?.scenes.map(s => s.visualDescription) || []
        });
    }, [contentPlan]);

    /**
     * Refine a prompt using AI
     */
    const improvePrompt = useCallback(async (
        promptText: string,
        intent: "auto" | "more_detailed" | "more_cinematic" | "shorten" = "auto"
    ): Promise<{ refinedPrompt: string; issues: PromptLintIssue[] }> => {
        return refineImagePrompt({
            promptText,
            style: visualStyle,
            globalSubject: topic,
            intent,
            previousPrompts: contentPlan?.scenes.map(s => s.visualDescription) || []
        });
    }, [visualStyle, topic, contentPlan]);

    return {
        // Actions
        checkPromptQuality,
        improvePrompt,
    };
}