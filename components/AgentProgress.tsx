/**
 * AgentProgress Component
 * 
 * Real-time visualization of the multi-agent production pipeline.
 * Shows progress through: ContentPlanner → Narrator → Editor → Export
 * Includes accessible aria-live regions for screen reader support
 */

import React from "react";
import { motion } from "framer-motion";
import {
    FileText,
    Mic,
    Film,
    CheckCircle2,
    Loader2,
    AlertCircle,
    Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductionProgress, ProductionStage } from "@/services/agentOrchestrator";

interface AgentProgressProps {
    progress: ProductionProgress | null;
    className?: string;
}

interface StageInfo {
    id: ProductionStage;
    label: string;
    icon: React.ReactNode;
}

const STAGES: StageInfo[] = [
    { id: "content_planning", label: "Planning", icon: <FileText className="w-5 h-5" /> },
    { id: "narrating", label: "Narration", icon: <Mic className="w-5 h-5" /> },
    { id: "generating_visuals", label: "Visuals", icon: <Film className="w-5 h-5" /> },
    { id: "validating", label: "Review", icon: <CheckCircle2 className="w-5 h-5" /> },
];

function getStageStatus(
    stageId: ProductionStage,
    currentStage: ProductionStage | undefined
): "pending" | "active" | "complete" {
    if (!currentStage) return "pending";

    const stageOrder = STAGES.map(s => s.id);
    const currentIndex = stageOrder.indexOf(currentStage);
    const stageIndex = stageOrder.indexOf(stageId);

    if (currentStage === "complete") return "complete";
    if (currentStage === "adjusting") {
        // During adjustment, show validating as active
        return stageId === "validating" ? "active" : stageIndex < 3 ? "complete" : "pending";
    }

    if (stageIndex < currentIndex) return "complete";
    if (stageIndex === currentIndex) return "active";
    return "pending";
}

function getAccessibleStageLabel(stage: ProductionStage | undefined): string {
    if (!stage) return "Not started";
    switch (stage) {
        case "content_planning": return "Content Planning";
        case "narrating": return "Narration";
        case "generating_visuals": return "Generating Visuals";
        case "validating": return "Review and Validation";
        case "adjusting": return "Making Adjustments";
        case "complete": return "Complete";
        default: return stage;
    }
}

export function AgentProgress({ progress, className }: AgentProgressProps) {
    if (!progress) return null;

    // Generate accessible status description
    const getAccessibleStatus = () => {
        const stageLabel = getAccessibleStageLabel(progress.stage);
        const progressText = `${Math.round(progress.progress)}% complete`;
        const sceneText = progress.currentScene && progress.totalScenes 
            ? `, scene ${progress.currentScene} of ${progress.totalScenes}` 
            : "";
        return `${stageLabel} stage: ${progressText}${sceneText}. ${progress.message}`;
    };

    return (
        <div 
            className={cn("rounded-xl bg-slate-900/50 border border-slate-700/50 p-6", className)}
            role="status"
            aria-live="polite"
            aria-label={getAccessibleStatus()}
        >
            {/* Stage indicators */}
            <nav 
                className="flex items-center justify-between mb-6"
                aria-label="Production pipeline stages"
            >
                {STAGES.map((stage, index) => {
                    const status = getStageStatus(stage.id, progress.stage);

                    return (
                        <React.Fragment key={stage.id}>
                            {/* Stage node */}
                            <div className="flex flex-col items-center gap-2">
                                <motion.div
                                    className={cn(
                                        "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                                        status === "complete" && "bg-green-500/20 text-green-400 border-2 border-green-500/50",
                                        status === "active" && "bg-cyan-500/20 text-cyan-400 border-2 border-cyan-500/50",
                                        status === "pending" && "bg-slate-800 text-slate-500 border-2 border-slate-600/50"
                                    )}
                                    animate={status === "active" ? { scale: [1, 1.05, 1] } : {}}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                    aria-label={`${stage.label}: ${status === "complete" ? "completed" : status === "active" ? "in progress" : "pending"}`}
                                    aria-current={status === "active" ? "step" : undefined}
                                >
                                    {status === "active" ? (
                                        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                                    ) : status === "complete" ? (
                                        <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                                    ) : (
                                        <span aria-hidden="true">{stage.icon}</span>
                                    )}
                                </motion.div>
                                <span className={cn(
                                    "text-xs font-medium",
                                    status === "active" && "text-cyan-400",
                                    status === "complete" && "text-green-400",
                                    status === "pending" && "text-slate-500"
                                )}>
                                    {stage.label}
                                </span>
                            </div>

                            {/* Connector line */}
                            {index < STAGES.length - 1 && (
                                <div 
                                    className="flex-1 mx-2 h-0.5 bg-slate-700 relative"
                                    aria-hidden="true"
                                >
                                    <motion.div
                                        className="absolute inset-y-0 left-0 bg-linear-to-r from-cyan-500 to-green-500"
                                        initial={{ width: "0%" }}
                                        animate={{
                                            width: getStageStatus(STAGES[index + 1].id, progress.stage) !== "pending"
                                                ? "100%"
                                                : getStageStatus(stage.id, progress.stage) === "active"
                                                    ? `${progress.progress}%`
                                                    : "0%"
                                        }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </nav>

            {/* Progress bar */}
            <div className="mb-4">
                <div 
                    className="h-2 bg-slate-800 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={Math.round(progress.progress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Overall progress: ${Math.round(progress.progress)}%`}
                >
                    <motion.div
                        className="h-full bg-linear-to-r from-cyan-500 via-purple-500 to-pink-500"
                        initial={{ width: "0%" }}
                        animate={{ width: `${progress.progress}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>
            </div>

            {/* Status message */}
            <div className="flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-purple-400" aria-hidden="true" />
                <span className="text-slate-300">{progress.message}</span>
                {progress.currentScene && progress.totalScenes && (
                    <span className="text-slate-500 ml-auto">
                        Scene {progress.currentScene}/{progress.totalScenes}
                    </span>
                )}
            </div>

            {/* Screen reader announcement for completion */}
            <div className="sr-only" aria-live="assertive" aria-atomic="true">
                {progress.stage === "complete" && "Production pipeline complete!"}
            </div>
        </div>
    );
}

/**
 * Compact version for inline display
 */
export function AgentProgressCompact({ progress, className }: AgentProgressProps) {
    if (!progress) return null;

    // Generate accessible status for compact view
    const getCompactAccessibleStatus = () => {
        const stageLabel = getAccessibleStageLabel(progress.stage);
        return `${stageLabel}: ${progress.message}`;
    };

    return (
        <div 
            className={cn("flex items-center gap-3", className)}
            role="status"
            aria-live="polite"
            aria-label={getCompactAccessibleStatus()}
        >
            <div className="flex items-center gap-1" role="list" aria-label="Stage indicators">
                {STAGES.map((stage) => {
                    const status = getStageStatus(stage.id, progress.stage);
                    return (
                        <div
                            key={stage.id}
                            role="listitem"
                            aria-label={`${stage.label}: ${status === "complete" ? "completed" : status === "active" ? "in progress" : "pending"}`}
                            className={cn(
                                "w-2 h-2 rounded-full",
                                status === "complete" && "bg-green-500",
                                status === "active" && "bg-cyan-500 animate-pulse",
                                status === "pending" && "bg-slate-600"
                            )}
                        />
                    );
                })}
            </div>
            <span className="text-sm text-slate-400">{progress.message}</span>
        </div>
    );
}

export default AgentProgress;
