import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ShotlistEntry, ScreenplayScene } from '@/types';
import {
    Play, SkipBack, SkipForward, Clock,
    Film, ChevronLeft, ChevronRight,
    Wand2, Video, Loader2
} from 'lucide-react';

interface StoryboardViewProps {
    shots: ShotlistEntry[];
    scenes?: ScreenplayScene[];
    scenesWithVisuals?: string[];
    onGenerateVisuals?: (sceneIndex?: number) => void;
    onGenerateVideo?: (shotId: string) => void;
    onUpdateDuration?: (shotId: string, duration: number) => void;
    isProcessing?: boolean;
}

export const StoryboardView: React.FC<StoryboardViewProps> = ({
    shots,
    scenes = [],
    onGenerateVisuals,
    onGenerateVideo,
    onUpdateDuration,
    isProcessing = false,
}) => {
    const [selectedShotIndex, setSelectedShotIndex] = useState(0);
    const [localDuration, setLocalDuration] = useState<number>(0);

    if (!shots || shots.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <Film className="w-20 h-20 text-[var(--cinema-silver)]/10" />
                <div className="text-center">
                    <p className="font-display text-xl text-[var(--cinema-silver)]/60 mb-2">No Shots Available</p>
                    <p className="font-script italic text-[var(--cinema-silver)]/40">
                        Generate a shot list to begin storyboarding
                    </p>
                </div>
            </div>
        );
    }

    const currentShot = shots[selectedShotIndex];
    const currentScene = scenes.find(s => s.id === currentShot.sceneId);

    useEffect(() => {
        setLocalDuration(currentShot.durationEst || 5);
    }, [currentShot.id, currentShot.durationEst]);

    const handleNext = () => {
        if (selectedShotIndex < shots.length - 1) {
            setSelectedShotIndex(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (selectedShotIndex > 0) {
            setSelectedShotIndex(prev => prev - 1);
        }
    };

    const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            setLocalDuration(val);
        }
    };

    const handleSaveDuration = () => {
        if (onUpdateDuration) {
            onUpdateDuration(currentShot.id, localDuration);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--cinema-void)]">
            {/* Main Preview Area */}
            <div className="flex-1 relative flex overflow-hidden group">
                {/* Film Sprocket Decoration - Left */}
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-[var(--cinema-void)] z-20 flex flex-col justify-around py-4">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="w-4 h-4 mx-auto rounded bg-[var(--cinema-celluloid)] border border-[var(--cinema-silver)]/10" />
                    ))}
                </div>

                {/* Image/Video Display */}
                <div className="absolute inset-0 ml-8 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentShot.id}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.02 }}
                            transition={{ duration: 0.3 }}
                            className="w-full h-full relative"
                        >
                            {currentShot.imageUrl ? (
                                <>
                                    <img
                                        src={currentShot.imageUrl}
                                        alt={currentShot.description}
                                        className="w-full h-full object-contain"
                                    />
                                    {/* Vignette */}
                                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,var(--cinema-void)_100%)] pointer-events-none" />
                                </>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-[var(--cinema-celluloid)]/30">
                                    <Wand2 className="w-16 h-16 text-[var(--cinema-silver)]/20" />
                                    <p className="font-mono text-sm text-[var(--cinema-silver)]/30 uppercase tracking-widest">
                                        No Visual Generated
                                    </p>
                                    {onGenerateVisuals && (
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => onGenerateVisuals()}
                                            className="btn-cinematic px-6 py-3 rounded-lg font-display"
                                        >
                                            Generate All Visuals
                                        </motion.button>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Overlay Controls */}
                <div className="absolute inset-x-8 bottom-0 bg-gradient-to-t from-[var(--cinema-void)] via-[var(--cinema-void)]/90 to-transparent p-8 pt-24 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                    <div className="max-w-4xl mx-auto flex items-end gap-8">
                        {/* Shot Info */}
                        <div className="flex-1 space-y-4">
                            {/* Badges */}
                            <div className="flex items-center gap-3">
                                <span className="px-3 py-1.5 bg-[var(--cinema-celluloid)] backdrop-blur-md rounded text-xs font-mono text-[var(--cinema-spotlight)] border border-[var(--cinema-spotlight)]/30">
                                    Scene {currentScene?.sceneNumber || '?'} | Shot {currentShot.shotNumber}
                                </span>
                                {currentShot.cameraAngle && (
                                    <span className="px-3 py-1.5 bg-[var(--cinema-editorial)]/20 text-[var(--cinema-editorial)] rounded text-xs font-mono uppercase border border-[var(--cinema-editorial)]/30">
                                        {currentShot.cameraAngle}
                                    </span>
                                )}
                            </div>

                            {/* Description */}
                            <h3 className="font-display text-2xl text-[var(--cinema-silver)] leading-snug">
                                {currentShot.description}
                            </h3>

                            {/* Duration Control */}
                            <div className="flex items-center gap-4 bg-[var(--cinema-celluloid)]/50 w-fit px-4 py-2 rounded-lg border border-[var(--cinema-silver)]/10">
                                <Clock className="w-4 h-4 text-[var(--cinema-silver)]/40" />
                                <span className="font-script italic text-sm text-[var(--cinema-silver)]/60">Duration:</span>
                                <input
                                    type="number"
                                    value={localDuration}
                                    onChange={handleDurationChange}
                                    className="w-16 bg-transparent border-b border-[var(--cinema-silver)]/30 text-[var(--cinema-silver)] text-center font-mono focus:outline-none focus:border-[var(--cinema-spotlight)]"
                                    min={1}
                                    max={60}
                                />
                                <span className="font-mono text-xs text-[var(--cinema-silver)]/40">sec</span>
                                <button
                                    onClick={handleSaveDuration}
                                    className="font-mono text-[10px] uppercase text-[var(--cinema-spotlight)] hover:text-[var(--cinema-silver)] transition-colors tracking-wider"
                                >
                                    Update
                                </button>
                            </div>
                        </div>

                        {/* Generate Video Button */}
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => onGenerateVideo?.(currentShot.id)}
                            disabled={isProcessing || !currentShot.imageUrl}
                            className="
                                h-14 px-8 rounded-lg
                                btn-cinematic
                                flex items-center gap-3
                                font-display text-lg
                                disabled:opacity-40 disabled:cursor-not-allowed
                                shadow-[0_0_30px_var(--glow-spotlight)]
                            "
                        >
                            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
                            Generate Video
                        </motion.button>
                    </div>
                </div>

                {/* Left/Right Navigation */}
                <button
                    onClick={handlePrev}
                    disabled={selectedShotIndex === 0}
                    className="absolute left-8 inset-y-0 w-24 bg-gradient-to-r from-[var(--cinema-void)]/80 to-transparent flex items-center justify-start pl-4 opacity-0 hover:opacity-100 transition-opacity disabled:hidden z-10"
                >
                    <div className="p-3 bg-[var(--cinema-celluloid)] rounded-full border border-[var(--cinema-silver)]/20 text-[var(--cinema-silver)]">
                        <ChevronLeft className="w-6 h-6" />
                    </div>
                </button>

                <button
                    onClick={handleNext}
                    disabled={selectedShotIndex === shots.length - 1}
                    className="absolute right-0 inset-y-0 w-24 bg-gradient-to-l from-[var(--cinema-void)]/80 to-transparent flex items-center justify-end pr-4 opacity-0 hover:opacity-100 transition-opacity disabled:hidden z-10"
                >
                    <div className="p-3 bg-[var(--cinema-celluloid)] rounded-full border border-[var(--cinema-silver)]/20 text-[var(--cinema-silver)]">
                        <ChevronRight className="w-6 h-6" />
                    </div>
                </button>
            </div>

            {/* Timeline Strip - Film Strip Style */}
            <div className="h-52 border-t border-[var(--cinema-silver)]/5 bg-[var(--cinema-celluloid)] flex flex-col">
                {/* Timeline Header */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--cinema-silver)]/5">
                    <div className="flex items-center gap-4">
                        <Film className="w-4 h-4 text-[var(--cinema-spotlight)]" />
                        <span className="font-mono text-xs text-[var(--cinema-silver)]/50">
                            {selectedShotIndex + 1} / {shots.length} FRAMES
                        </span>
                    </div>

                    {/* Transport Controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrev}
                            disabled={selectedShotIndex === 0}
                            className="p-2 hover:bg-[var(--cinema-void)]/50 rounded text-[var(--cinema-silver)]/40 hover:text-[var(--cinema-silver)] disabled:opacity-20 transition-colors"
                        >
                            <SkipBack className="w-4 h-4" />
                        </button>
                        <button className="p-2 hover:bg-[var(--cinema-spotlight)]/20 text-[var(--cinema-spotlight)] rounded transition-colors">
                            <Play className="w-4 h-4 fill-current" />
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={selectedShotIndex === shots.length - 1}
                            className="p-2 hover:bg-[var(--cinema-void)]/50 rounded text-[var(--cinema-silver)]/40 hover:text-[var(--cinema-silver)] disabled:opacity-20 transition-colors"
                        >
                            <SkipForward className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="w-16" /> {/* Spacer for balance */}
                </div>

                {/* Thumbnails with Sprocket Decoration */}
                <div className="flex-1 flex">
                    {/* Left Sprockets */}
                    <div className="w-6 bg-[var(--cinema-void)] flex flex-col justify-around py-2">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="w-3 h-3 mx-auto rounded-sm bg-[var(--cinema-celluloid)] border border-[var(--cinema-silver)]/10" />
                        ))}
                    </div>

                    {/* Thumbnail Strip */}
                    <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-4 flex gap-2 no-scrollbar">
                        {shots.map((shot, idx) => {
                            const isSelected = idx === selectedShotIndex;
                            return (
                                <motion.button
                                    key={shot.id}
                                    whileHover={{ scale: 1.05 }}
                                    onClick={() => setSelectedShotIndex(idx)}
                                    className={`
                                        relative flex-none w-44 h-28 rounded overflow-hidden border-2 transition-all
                                        ${isSelected
                                            ? 'border-[var(--cinema-spotlight)] shadow-[0_0_20px_var(--glow-spotlight)] scale-105 z-10'
                                            : 'border-[var(--cinema-silver)]/10 opacity-60 hover:opacity-100'
                                        }
                                    `}
                                >
                                    {shot.imageUrl ? (
                                        <img
                                            src={shot.imageUrl}
                                            alt=""
                                            className={`w-full h-full object-cover ${isSelected ? '' : 'grayscale-[30%]'} transition-all`}
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-[var(--cinema-void)] flex items-center justify-center">
                                            <Wand2 className="w-6 h-6 text-[var(--cinema-silver)]/20" />
                                        </div>
                                    )}

                                    {/* Vignette overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--cinema-void)] via-transparent to-transparent opacity-80" />

                                    {/* Duration Badge */}
                                    <div className="absolute bottom-1 right-2 flex items-center gap-1 font-mono text-[10px] text-[var(--cinema-silver)]">
                                        <Clock className="w-3 h-3" /> {shot.durationEst}s
                                    </div>

                                    {/* Shot Number */}
                                    <div className="absolute top-1 left-2 px-1.5 py-0.5 bg-[var(--cinema-void)]/80 backdrop-blur-sm rounded text-[9px] font-mono text-[var(--cinema-spotlight)]">
                                        #{shot.shotNumber}
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* Right Sprockets */}
                    <div className="w-6 bg-[var(--cinema-void)] flex flex-col justify-around py-2">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="w-3 h-3 mx-auto rounded-sm bg-[var(--cinema-celluloid)] border border-[var(--cinema-silver)]/10" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StoryboardView;
