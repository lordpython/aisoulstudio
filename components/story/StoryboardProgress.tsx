/**
 * StoryboardProgress.tsx
 * Cinematic loading screen for storyboard generation.
 * COMPLETE REDESIGN - removed jarring white mockup, replaced with dark cinematic loader.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Film, Clapperboard } from 'lucide-react';
import { staggerContainer, staggerItem } from '@/lib/cinematicMotion';
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
        <div className="flex flex-col lg:flex-row items-center justify-center min-h-[70vh] p-8 gap-16 max-w-6xl mx-auto">
            {/* Left Column: Progress Steps */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
                className="flex-1 max-w-xl space-y-10"
            >
                {/* Header */}
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <Clapperboard className="w-6 h-6 text-[var(--cinema-spotlight)]" />
                        <div className="w-12 h-px bg-[var(--cinema-spotlight)]/30" />
                    </div>
                    <h1 className="font-display text-4xl text-[var(--cinema-silver)] tracking-tight mb-4">
                        {t('story.storyboard_progress.developingVision')}
                    </h1>
                    <p className="font-script italic text-xl text-[var(--cinema-silver)]/80 leading-relaxed">
                        {t('story.storyboard_progress.renderedFrameByFrame')}
                    </p>
                </div>

                {/* Stage List */}
                <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="space-y-6"
                >
                    {STAGES.map((stage, index) => {
                        const status = getStageStatus(index);
                        return (
                            <motion.div
                                key={stage.id}
                                variants={staggerItem}
                                className="flex items-start gap-4"
                            >
                                {/* Status Icon */}
                                <div className="shrink-0 mt-1">
                                    {status === 'complete' && (
                                        <CheckCircle2 className="w-6 h-6 text-[var(--cinema-spotlight)]" />
                                    )}
                                    {status === 'processing' && (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                            className="w-6 h-6 border-2 border-[var(--cinema-silver)]/30 border-t-[var(--cinema-silver)] rounded-full"
                                        />
                                    )}
                                    {status === 'pending' && (
                                        <Circle className="w-6 h-6 text-[var(--cinema-silver)]/60" />
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1">
                                    <span className={`
                                        font-display text-xl block mb-1 transition-colors duration-300
                                        ${status === 'complete'
                                            ? 'text-[var(--cinema-spotlight)]'
                                            : status === 'processing'
                                                ? 'text-[var(--cinema-silver)]'
                                                : 'text-[var(--cinema-silver)]/70'
                                        }
                                    `}>
                                        {t(STAGE_KEYS[stage.id].label)}
                                    </span>
                                    <span className={`
                                        font-script italic text-sm transition-colors duration-300
                                        ${status === 'pending'
                                            ? 'text-[var(--cinema-silver)]/50'
                                            : 'text-[var(--cinema-silver)]/70'
                                        }
                                    `}>
                                        {t(STAGE_KEYS[stage.id].description)}
                                    </span>
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>
            </motion.div>

            {/* Right Column: Cinematic Preview Placeholder */}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="w-full lg:w-[420px]"
            >
                <div className="aspect-video relative rounded-lg overflow-hidden border border-[var(--cinema-silver)]/10 bg-[var(--cinema-celluloid)] shadow-cinematic">
                    {/* Shimmer Effect */}
                    <div className="absolute inset-0 overflow-hidden">
                        <motion.div
                            animate={{ x: ["-100%", "100%"] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--cinema-silver)]/5 to-transparent"
                        />
                    </div>

                    {/* Film Grain Texture */}
                    <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20200%20200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cfilter%20id%3D%22noise%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.85%22%20numOctaves%3D%224%22%20stitchTiles%3D%22stitch%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23noise)%22%2F%3E%3C%2Fsvg%3E')]" />

                    {/* Vignette */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,var(--cinema-void)_100%)]" />

                    {/* Letterbox Bars */}
                    <div className="absolute top-0 inset-x-0 h-[12%] bg-[var(--cinema-void)]" />
                    <div className="absolute bottom-0 inset-x-0 h-[12%] bg-[var(--cinema-void)]" />

                    {/* Center Icon */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                            className="relative"
                        >
                            <Film className="w-16 h-16 text-[var(--cinema-silver)]/10" />
                        </motion.div>
                    </div>

                    {/* Frame Counter */}
                    <div className="absolute bottom-[15%] right-4 font-mono text-[10px] text-[var(--cinema-silver)]/20 tracking-widest">
                        FRAME 001
                    </div>
                </div>

                {/* Caption Below Preview */}
                <div className="mt-4 text-center">
                    <p className="font-script italic text-sm text-[var(--cinema-silver)]/70">
                        {t('story.storyboard_progress.visualMasterpiece')}
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default StoryboardProgress;
