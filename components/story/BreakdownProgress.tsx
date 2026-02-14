/**
 * BreakdownProgress.tsx
 * Loading screen for story breakdown generation with stage tracking.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';

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
}

const STAGE_KEYS: Record<BreakdownStage, string> = {
    reading: 'story.breakdown_progress.readingIdea',
    aligning: 'story.breakdown_progress.aligningGenre',
    identifying: 'story.breakdown_progress.identifyingCharacters',
    creating: 'story.breakdown_progress.creatingBreakdown',
};

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
    const { t } = useLanguage();
    const currentIndex = getStageIndex(currentStage);

    const getStageStatus = (index: number): 'complete' | 'processing' | 'pending' => {
        if (isComplete) return 'complete';
        if (index < currentIndex) return 'complete';
        if (index === currentIndex) return 'processing';
        return 'pending';
    };

    const getStageLabel = (stage: StageConfig) => {
        if (stage.id === 'aligning') {
            return t('story.breakdown_progress.aligningWith', { genre });
        }
        return t(STAGE_KEYS[stage.id]);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] p-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="w-full max-w-lg"
            >
                {/* Header */}
                <div className="text-center mb-12">
                    <div className="flex items-center justify-center mb-6">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                    <h2 className="font-sans text-2xl font-medium tracking-tight text-zinc-100 mb-3">
                        {t('story.breakdown_progress.developing')}
                    </h2>
                    <p className="text-zinc-500 text-sm">
                        {t('story.breakdown_progress.craftedFrameByFrame')}
                    </p>
                </div>

                {/* Stage List */}
                <div className="space-y-0">
                    {STAGES.map((stage, index) => {
                        const status = getStageStatus(index);
                        return (
                            <motion.div
                                key={stage.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, ease: 'easeOut', delay: index * 0.08 }}
                                className={`
                                    relative pl-8 py-4 border-l transition-all duration-200 ease-out
                                    ${status === 'complete'
                                        ? 'border-blue-500'
                                        : status === 'processing'
                                            ? 'border-zinc-400'
                                            : 'border-zinc-800'
                                    }
                                `}
                            >
                                {/* Frame Number */}
                                <span className="absolute left-3 top-4 font-mono text-[10px] text-zinc-700">
                                    {String(index + 1).padStart(2, '0')}
                                </span>

                                {/* Stage Content */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {status === 'complete' && (
                                            <CheckCircle2 className="w-5 h-5 text-blue-400" />
                                        )}
                                        {status === 'processing' && (
                                            <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                                        )}
                                        {status === 'pending' && (
                                            <Circle className="w-5 h-5 text-zinc-700" />
                                        )}

                                        <span className={`
                                            font-sans text-sm transition-colors duration-200 ease-out
                                            ${status === 'complete' || status === 'processing'
                                                ? 'text-zinc-300'
                                                : 'text-zinc-600'
                                            }
                                        `}>
                                            {getStageLabel(stage)}
                                        </span>
                                    </div>

                                    {status === 'processing' && (
                                        <motion.span
                                            animate={{ opacity: [0.3, 1, 0.3] }}
                                            transition={{ duration: 1.5, repeat: Infinity }}
                                            className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest"
                                        >
                                            {t('story.breakdown_progress.processing')}
                                        </motion.span>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Footer */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="mt-12 text-center"
                >
                    <span className="font-mono text-[10px] text-zinc-700 tracking-widest">
                        PROCESSING
                    </span>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default BreakdownProgress;
