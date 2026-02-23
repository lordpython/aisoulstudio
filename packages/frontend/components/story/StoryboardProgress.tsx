/**
 * StoryboardProgress.tsx
 * Loading screen for storyboard generation with stage tracking.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';

export type StoryboardStage =
    | 'shotlist'
    | 'characters'
    | 'storyboard';

interface StoryboardProgressProps {
    currentStage: StoryboardStage;
    isComplete?: boolean;
}

interface StageConfig {
    id: StoryboardStage;
    label: string;
    description: string;
}

const STAGE_KEYS: Record<StoryboardStage, { label: string; description: string }> = {
    shotlist: { label: 'story.storyboard_progress.generatingShotList', description: 'story.storyboard_progress.breakingScenes' },
    characters: { label: 'story.storyboard_progress.preparingCast', description: 'story.storyboard_progress.loadingProfiles' },
    storyboard: { label: 'story.storyboard_progress.renderingStoryboard', description: 'story.storyboard_progress.creatingFrames' },
};

const STAGES: StageConfig[] = [
    { id: 'shotlist', label: 'Generating Shot List', description: 'Breaking down scenes into shots' },
    { id: 'characters', label: 'Preparing Cast', description: 'Loading character profiles' },
    { id: 'storyboard', label: 'Rendering Storyboard', description: 'Creating visual frames' },
];

const getStageIndex = (stage: StoryboardStage): number => {
    return STAGES.findIndex(s => s.id === stage);
};

export const StoryboardProgress: React.FC<StoryboardProgressProps> = ({
    currentStage,
    isComplete = false,
}) => {
    const { t } = useLanguage();
    const currentIndex = getStageIndex(currentStage);

    const getStageStatus = (index: number): 'complete' | 'processing' | 'pending' => {
        if (isComplete) return 'complete';
        if (index < currentIndex) return 'complete';
        if (index === currentIndex) return 'processing';
        return 'pending';
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
                        {t('story.storyboard_progress.developingVision')}
                    </h2>
                    <p className="text-zinc-500 text-sm">
                        {t('story.storyboard_progress.renderedFrameByFrame')}
                    </p>
                </div>

                {/* Stage List */}
                <div className="space-y-6">
                    {STAGES.map((stage, index) => {
                        const status = getStageStatus(index);
                        return (
                            <motion.div
                                key={stage.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, ease: 'easeOut', delay: index * 0.08 }}
                                className="flex items-start gap-4"
                            >
                                {/* Status Icon */}
                                <div className="shrink-0 mt-1">
                                    {status === 'complete' && (
                                        <CheckCircle2 className="w-6 h-6 text-blue-400" />
                                    )}
                                    {status === 'processing' && (
                                        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
                                    )}
                                    {status === 'pending' && (
                                        <Circle className="w-6 h-6 text-zinc-700" />
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1">
                                    <span className={`
                                        font-sans text-base block mb-1 transition-colors duration-200 ease-out
                                        ${status === 'complete' || status === 'processing'
                                            ? 'text-zinc-300'
                                            : 'text-zinc-600'
                                        }
                                    `}>
                                        {t(STAGE_KEYS[stage.id].label)}
                                    </span>
                                    <span className={`
                                        text-xs transition-colors duration-200 ease-out
                                        ${status === 'pending' ? 'text-zinc-700' : 'text-zinc-600'}
                                    `}>
                                        {t(STAGE_KEYS[stage.id].description)}
                                    </span>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </motion.div>
        </div>
    );
};

export default StoryboardProgress;
