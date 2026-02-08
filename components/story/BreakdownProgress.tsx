/**
 * BreakdownProgress.tsx
 * Cinematic loading screen with film reel animation and director's notes style stages.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Film } from 'lucide-react';
import { staggerContainer, staggerItem } from '@/lib/cinematicMotion';
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
                transition={{ duration: 0.6 }}
                className="w-full max-w-lg"
            >
                {/* Cinematic Header with Film Reel */}
                <div className="text-center mb-12">
                    {/* Dual Film Reel Spinner */}
                    <div className="relative w-20 h-20 mx-auto mb-6">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 border-4 border-[var(--cinema-spotlight)]/30 border-t-[var(--cinema-spotlight)] rounded-full"
                        />
                        <motion.div
                            animate={{ rotate: -360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-2 border-4 border-[var(--cinema-silver)]/20 border-b-[var(--cinema-silver)]/60 rounded-full"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Film className="w-6 h-6 text-[var(--cinema-spotlight)]" />
                        </div>
                    </div>

                    <h2 className="font-display text-3xl text-[var(--cinema-silver)] tracking-tight mb-3">
                        {t('story.breakdown_progress.developing')}
                    </h2>
                    <p className="font-script italic text-lg text-[var(--cinema-silver)]/80">
                        {t('story.breakdown_progress.craftedFrameByFrame')}
                    </p>
                </div>

                {/* Director's Notes Style Stage List */}
                <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="space-y-4"
                >
                    {STAGES.map((stage, index) => {
                        const status = getStageStatus(index);
                        return (
                            <motion.div
                                key={stage.id}
                                variants={staggerItem}
                                className={`
                                    relative pl-8 py-4 border-l-2 transition-all duration-500
                                    ${status === 'complete'
                                        ? 'border-[var(--cinema-spotlight)]'
                                        : status === 'processing'
                                            ? 'border-[var(--cinema-silver)]'
                                            : 'border-[var(--cinema-silver)]/40'
                                    }
                                `}
                            >
                                {/* Frame Number */}
                                <span className="absolute left-3 top-4 font-mono text-[10px] text-[var(--cinema-silver)]/60">
                                    {String(index + 1).padStart(2, '0')}
                                </span>

                                {/* Stage Content */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {status === 'complete' && (
                                            <CheckCircle2 className="w-5 h-5 text-[var(--cinema-spotlight)]" />
                                        )}
                                        {status === 'processing' && (
                                            <motion.div
                                                animate={{ scale: [1, 1.2, 1] }}
                                                transition={{ duration: 1.5, repeat: Infinity }}
                                                className="w-5 h-5 rounded-full bg-[var(--cinema-silver)] flex items-center justify-center"
                                            >
                                                <div className="w-2 h-2 rounded-full bg-[var(--cinema-void)]" />
                                            </motion.div>
                                        )}
                                        {status === 'pending' && (
                                            <Circle className="w-5 h-5 text-[var(--cinema-silver)]/60" />
                                        )}

                                        <span className={`
                                            font-display text-lg transition-colors duration-300
                                            ${status === 'complete'
                                                ? 'text-[var(--cinema-spotlight)]'
                                                : status === 'processing'
                                                    ? 'text-[var(--cinema-silver)]'
                                                    : 'text-[var(--cinema-silver)]/70'
                                            }
                                        `}>
                                            {getStageLabel(stage)}
                                        </span>
                                    </div>

                                    {status === 'processing' && (
                                        <motion.span
                                            animate={{ opacity: [0.3, 1, 0.3] }}
                                            transition={{ duration: 1.5, repeat: Infinity }}
                                            className="font-mono text-[10px] text-[var(--cinema-silver)]/60 uppercase tracking-widest"
                                        >
                                            {t('story.breakdown_progress.processing')}
                                        </motion.span>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>

                {/* Footer Note */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="mt-12 text-center"
                >
                    <div className="flex items-center justify-center gap-4">
                        <div className="w-8 h-px bg-[var(--cinema-silver)]/10" />
                        <span className="font-mono text-[10px] text-[var(--cinema-silver)]/20 tracking-widest">
                            LYRICLENS STUDIOS
                        </span>
                        <div className="w-8 h-px bg-[var(--cinema-silver)]/10" />
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default BreakdownProgress;
