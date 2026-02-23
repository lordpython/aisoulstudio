/**
 * Status Tools for Production Agent
 * 
 * Tools for checking production status and marking completion.
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { productionStore } from "../store";
import { validateContentPlanId } from "../utils";

// --- Get Production Status Tool ---

export const getProductionStatusTool = tool(
    async ({ contentPlanId }) => {
        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state) {
            return JSON.stringify({ 
                success: false, 
                error: `Session not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` 
            });
        }

        return JSON.stringify({
            success: true,
            hasContentPlan: !!state.contentPlan,
            sceneCount: state.contentPlan?.scenes.length || 0,
            totalDuration: state.contentPlan?.totalDuration || 0,
            hasNarration: state.narrationSegments.length > 0,
            narrationCount: state.narrationSegments.length,
            hasVisuals: state.visuals.length > 0,
            visualCount: state.visuals.length,
            hasSFX: !!state.sfxPlan,
            sfxSceneCount: state.sfxPlan?.scenes.length || 0,
            isComplete: state.isComplete,
            errors: state.errors,
        });
    },
    {
        name: "get_production_status",
        description: "Get the current status of a video production session.",
        schema: z.object({
            contentPlanId: z.string().describe("Session ID to check status for"),
        }),
    }
);

// --- Mark Complete Tool ---

export const markCompleteTool = tool(
    async ({ contentPlanId }) => {
        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state) {
            return JSON.stringify({ 
                success: false, 
                error: `Session not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` 
            });
        }

        state.isComplete = true;
        productionStore.set(contentPlanId, state);

        return JSON.stringify({
            success: true,
            message: "Production marked as complete",
            summary: {
                scenes: state.contentPlan?.scenes.length || 0,
                duration: state.contentPlan?.totalDuration || 0,
                narrations: state.narrationSegments.length,
                visuals: state.visuals.length,
                sfxScenes: state.sfxPlan?.scenes.length || 0,
            },
        });
    },
    {
        name: "mark_complete",
        description: "Mark a production session as complete after all assets are generated.",
        schema: z.object({
            contentPlanId: z.string().describe("Session ID to mark as complete"),
        }),
    }
);
