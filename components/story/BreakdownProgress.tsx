/**
 * BreakdownProgress.tsx
 *
 * Loading screen that shows 4 stages of AI processing with checkmarks.
 * Used during the initial story breakdown generation.
 */

import React from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

export type BreakdownStage =
    | 'reading'
    | 'aligning'
    | 'identifying'
    | 'creating';

interface BreakdownProgressProps {
    currentStage: BreakdownStage;
    isComplete?: boolean;
    genre?: string;
}

interface StageConfig {
    id: BreakdownStage;
    label: string;
    description?: string;
}

const STAGES: StageConfig[] = [
    { id: 'reading', label: 'Reading your story idea' },
    { id: 'aligning', label: 'Aligning with genre' },
    { id: 'identifying', label: 'Identifying characters' },
    { id: 'creating', label: 'Creating scene breakdown' },
];

const getStageIndex = (stage: BreakdownStage): number => {
    return STAGES.findIndex(s => s.id === stage);
};

export const BreakdownProgress: React.FC<BreakdownProgressProps> = ({
    currentStage,
    isComplete = false,
    genre = 'your genre',
}) => {
    const currentIndex = getStageIndex(currentStage);

    const getStageStatus = (index: number): 'complete' | 'processing' | 'pending' => {
        if (isComplete) return 'complete';
        if (index < currentIndex) return 'complete';
        if (index === currentIndex) return 'processing';
        return 'pending';
    };

    const renderStageIcon = (status: 'complete' | 'processing' | 'pending') => {
        switch (status) {
            case 'complete':
                return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
            case 'processing':
                return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
            case 'pending':
                return <Circle className="w-5 h-5 text-zinc-600" />;
        }
    };

    const getStageClasses = (status: 'complete' | 'processing' | 'pending') => {
        switch (status) {
            case 'complete':
                return 'bg-emerald-500/10 border-emerald-500/30';
            case 'processing':
                return 'bg-blue-500/10 border-blue-500/30';
            case 'pending':
                return 'bg-zinc-900/50 border-zinc-800';
        }
    };

    const getTextClasses = (status: 'complete' | 'processing' | 'pending') => {
        switch (status) {
            case 'complete':
                return 'text-emerald-300';
            case 'processing':
                return 'text-blue-300';
            case 'pending':
                return 'text-zinc-500';
        }
    };

    // Dynamic label based on genre
    const getStageLabel = (stage: StageConfig) => {
        if (stage.id === 'aligning') {
            return `Aligning with ${genre}`;
        }
        return stage.label;
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">
                        Crafting Your Story
                    </h2>
                    <p className="text-zinc-400 text-sm">
                        Please wait while our AI analyzes your idea
                    </p>
                </div>

                {/* Stage List */}
                <div className="space-y-4">
                    {STAGES.map((stage, index) => {
                        const status = getStageStatus(index);
                        return (
                            <div
                                key={stage.id}
                                className={`
                                    flex items-center gap-4 p-4 rounded-xl border transition-all duration-300
                                    ${getStageClasses(status)}
                                `}
                            >
                                <div className="shrink-0">
                                    {renderStageIcon(status)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium ${getTextClasses(status)}`}>
                                        {getStageLabel(stage)}
                                    </p>
                                </div>
                                {status === 'processing' && (
                                    <div className="shrink-0">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold bg-blue-500/20 text-blue-400">
                                            In Progress
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Bottom Note */}
                <div className="mt-8 text-center">
                    <p className="text-xs text-zinc-600">
                        This usually takes 15-30 seconds
                    </p>
                </div>
            </div>
        </div>
    );
};

export default BreakdownProgress;
