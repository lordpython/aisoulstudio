import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IdeaView } from './IdeaView';
import { ScriptView } from './ScriptView';
import { CharacterView } from './CharacterView';
import { StoryboardView } from './StoryboardView';
import { LockWarningDialog } from './LockWarningDialog';
import { StyleSelector } from './StyleSelector';
import { BreakdownProgress } from './BreakdownProgress';
import { StoryboardProgress } from './StoryboardProgress';
import type { StoryState, StoryStep, CharacterProfile } from '@/types';
import type { VisualStyleKey, AspectRatioId } from '@/constants/visualStyles';
import { estimateProjectCost } from '@/utils/costEstimator';
import {
    fadeFromBlack,
    stepTransition,
    staggerContainer,
    staggerItem,
} from '@/lib/cinematicMotion';
import { Download, RefreshCcw, Undo2, Redo2, Lock, CheckCircle2, Circle, Loader2, AlertCircle, X, Film, Mic, Video, Play, Check } from 'lucide-react';

interface StageProgress {
    totalScenes: number;
    scenesWithShots: number;
    scenesWithVisuals: number;
    shotsComplete: boolean;
    visualsComplete: boolean;
}

interface StoryWorkspaceProps {
    storyState: StoryState;
    onNextStep: () => void;
    onGenerateIdea?: (topic: string, genre: string) => void;
    initialTopic?: string;
    onExportScript?: () => void;
    onRegenerateScene?: (sceneNumber: number, feedback: string) => void;
    onVerifyConsistency?: (characterName: string) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    isProcessing: boolean;
    progress: { message: string; percent: number };
    onLockStory?: () => void;
    onUpdateVisualStyle?: (style: string) => void;
    onUpdateAspectRatio?: (ratio: string) => void;
    onGenerateShots?: (sceneIndex?: number) => void;
    onGenerateVisuals?: (sceneIndex?: number) => void;
    stageProgress?: StageProgress;
    error?: string | null;
    onClearError?: () => void;
    onRetry?: () => void;
    onAddCharacter?: () => void;
    onEditCharacter?: (character: CharacterProfile) => void;
    onDeleteCharacter?: (characterId: string) => void;
    onGenerateCharacterImage?: (characterId: string) => void;
    onGenerateVideo?: (shotId: string) => void;
    onUpdateShotDuration?: (shotId: string, duration: number) => void;
    // Narration, Animation, and Export props
    onGenerateNarration?: () => void;
    onAnimateShots?: (shotIndex?: number) => void;
    onExportFinalVideo?: () => Promise<Blob | null | undefined>;
    onDownloadVideo?: () => void;
    allScenesHaveNarration?: () => boolean;
    allShotsHaveAnimation?: () => boolean;
}

type MainStep = 'idea' | 'breakdown' | 'storyboard';

export const StoryWorkspace: React.FC<StoryWorkspaceProps> = ({
    storyState,
    onNextStep,
    onGenerateIdea,
    initialTopic,
    onExportScript,
    onRegenerateScene,
    onVerifyConsistency,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    isProcessing,
    progress,
    onLockStory,
    onUpdateVisualStyle,
    onUpdateAspectRatio,
    onGenerateShots,
    onGenerateVisuals,
    stageProgress,
    error,
    onClearError,
    onRetry,
    onAddCharacter,
    onEditCharacter,
    onDeleteCharacter,
    onGenerateCharacterImage,
    onGenerateVideo,
    onUpdateShotDuration,
    // Narration, Animation, and Export props
    onGenerateNarration,
    onAnimateShots,
    onExportFinalVideo,
    onDownloadVideo,
    allScenesHaveNarration,
    allShotsHaveAnimation,
}) => {
    const getHighLevelStep = (step: StoryStep): MainStep => {
        if (step === 'idea') return 'idea';
        if (['breakdown', 'script', 'characters'].includes(step)) return 'breakdown';
        return 'storyboard';
    };

    const [activeMainTab, setActiveMainTab] = useState<MainStep>(getHighLevelStep(storyState.currentStep));
    const [subTab, setSubTab] = useState<StoryStep>(storyState.currentStep);
    const [showLockDialog, setShowLockDialog] = useState(false);

    useEffect(() => {
        const newMain = getHighLevelStep(storyState.currentStep);
        setActiveMainTab(newMain);
        setSubTab(storyState.currentStep);
    }, [storyState.currentStep]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') {
                    if (e.shiftKey) {
                        if (canRedo && onRedo) {
                            e.preventDefault();
                            onRedo();
                        }
                    } else {
                        if (canUndo && onUndo) {
                            e.preventDefault();
                            onUndo();
                        }
                    }
                } else if (e.key === 'y') {
                    if (canRedo && onRedo) {
                        e.preventDefault();
                        onRedo();
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onUndo, onRedo, canUndo, canRedo]);

    const mainTabs: { id: MainStep; label: string; number: string; romanNumeral: string }[] = [
        { id: 'idea', label: 'Story Idea', number: '1', romanNumeral: 'I' },
        { id: 'breakdown', label: 'Breakdown', number: '2', romanNumeral: 'II' },
        { id: 'storyboard', label: 'Storyboard', number: '3', romanNumeral: 'III' },
    ];

    const handleProceed = () => {
        if (subTab === 'script' && !storyState.isLocked) {
            setShowLockDialog(true);
        } else {
            onNextStep();
        }
    };

    const isBreakdownProcessing = isProcessing && activeMainTab === 'breakdown' && storyState.breakdown.length === 0;
    const isStoryboardProcessing = isProcessing && activeMainTab === 'storyboard' && (!storyState.shots || storyState.shots.length === 0);

    // Step completion status helpers
    const getStepCompletionStatus = (stepId: StoryStep): 'completed' | 'active' | 'pending' | 'processing' => {
        const storyboardOrder: StoryStep[] = ['shots', 'style', 'storyboard', 'narration', 'animation', 'export'];
        const breakdownOrder: StoryStep[] = ['breakdown', 'script', 'characters'];

        const currentOrder = activeMainTab === 'storyboard' ? storyboardOrder : breakdownOrder;
        const currentIndex = currentOrder.indexOf(subTab);
        const stepIndex = currentOrder.indexOf(stepId);

        if (stepId === subTab) {
            return isProcessing ? 'processing' : 'active';
        }

        // Check specific completion conditions
        if (activeMainTab === 'storyboard') {
            switch (stepId) {
                case 'shots':
                    return (storyState.shots?.length ?? 0) > 0 ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
                case 'style':
                    return storyState.visualStyle ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
                case 'storyboard':
                    return (storyState.scenesWithVisuals?.length ?? 0) > 0 ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
                case 'narration':
                    return (storyState.narrationSegments?.length ?? 0) > 0 ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
                case 'animation':
                    return (storyState.animatedShots?.length ?? 0) > 0 ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
                case 'export':
                    return storyState.finalVideoUrl ? 'completed' : 'pending';
            }
        } else {
            switch (stepId) {
                case 'breakdown':
                    return storyState.breakdown.length > 0 ? 'completed' : 'pending';
                case 'script':
                    return storyState.script ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
                case 'characters':
                    return storyState.characters.length > 0 ? 'completed' : 'pending';
            }
        }

        return stepIndex < currentIndex ? 'completed' : 'pending';
    };

    const renderSubNav = (tabs: { id: StoryStep; label: string }[]) => {
        const currentIndex = tabs.findIndex(t => t.id === subTab);

        return (
            <div className="w-full bg-gradient-to-b from-[var(--cinema-celluloid)] to-[var(--cinema-void)] border-b border-[var(--cinema-silver)]/5">
                <div className="max-w-5xl mx-auto px-8 py-6">
                    {/* Progress Steps */}
                    <div className="relative flex items-center justify-between">
                        {/* Background Progress Line */}
                        <div className="absolute top-5 left-0 right-0 h-0.5 bg-[var(--cinema-silver)]/10" />

                        {/* Active Progress Line */}
                        <motion.div
                            className="absolute top-5 left-0 h-0.5 bg-gradient-to-r from-[var(--cinema-spotlight)] via-[var(--cinema-editorial)] to-emerald-500"
                            initial={false}
                            animate={{
                                width: `${(currentIndex / Math.max(tabs.length - 1, 1)) * 100}%`,
                            }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                            style={{ boxShadow: '0 0 12px var(--glow-spotlight)' }}
                        />

                        {tabs.map((tab, index) => {
                            const status = getStepCompletionStatus(tab.id);
                            const isActive = tab.id === subTab;
                            const isCompleted = status === 'completed';
                            const isProcessingStep = status === 'processing';
                            const isPending = status === 'pending';
                            const isAccessible = index <= currentIndex || isCompleted;

                            return (
                                <div key={tab.id} className="relative flex flex-col items-center z-10">
                                    {/* Step Indicator */}
                                    <motion.button
                                        onClick={() => isAccessible && setSubTab(tab.id)}
                                        disabled={!isAccessible}
                                        className={`
                                            relative w-10 h-10 rounded-full flex items-center justify-center
                                            transition-all duration-300 border-2
                                            ${isActive
                                                ? 'bg-[var(--cinema-spotlight)] border-[var(--cinema-spotlight)] text-[var(--cinema-void)] scale-110'
                                                : isCompleted
                                                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                                    : isPending
                                                        ? 'bg-[var(--cinema-void)] border-[var(--cinema-silver)]/20 text-[var(--cinema-silver)]/30'
                                                        : 'bg-[var(--cinema-celluloid)] border-[var(--cinema-silver)]/30 text-[var(--cinema-silver)]/50'
                                            }
                                            ${isAccessible && !isActive ? 'hover:border-[var(--cinema-spotlight)]/50 hover:scale-105 cursor-pointer' : ''}
                                            ${!isAccessible ? 'cursor-not-allowed' : ''}
                                        `}
                                        whileHover={isAccessible && !isActive ? { scale: 1.08 } : {}}
                                        whileTap={isAccessible ? { scale: 0.95 } : {}}
                                    >
                                        <AnimatePresence mode="wait">
                                            {isProcessingStep ? (
                                                <motion.div
                                                    key="processing"
                                                    initial={{ opacity: 0, scale: 0.5 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.5 }}
                                                >
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                </motion.div>
                                            ) : isCompleted ? (
                                                <motion.div
                                                    key="completed"
                                                    initial={{ opacity: 0, scale: 0.5 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.5 }}
                                                >
                                                    <Check className="w-5 h-5" />
                                                </motion.div>
                                            ) : (
                                                <motion.span
                                                    key="number"
                                                    initial={{ opacity: 0, scale: 0.5 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.5 }}
                                                    className="font-mono text-sm font-bold"
                                                >
                                                    {index + 1}
                                                </motion.span>
                                            )}
                                        </AnimatePresence>

                                        {/* Pulse ring for active step */}
                                        {isActive && (
                                            <motion.div
                                                className="absolute inset-0 rounded-full border-2 border-[var(--cinema-spotlight)]"
                                                initial={{ scale: 1, opacity: 0.5 }}
                                                animate={{ scale: 1.5, opacity: 0 }}
                                                transition={{ duration: 1.5, repeat: Infinity }}
                                            />
                                        )}
                                    </motion.button>

                                    {/* Step Label */}
                                    <motion.span
                                        className={`
                                            mt-3 text-xs font-medium tracking-wide whitespace-nowrap
                                            transition-all duration-300
                                            ${isActive
                                                ? 'text-[var(--cinema-spotlight)]'
                                                : isCompleted
                                                    ? 'text-emerald-400/80'
                                                    : 'text-[var(--cinema-silver)]/40'
                                            }
                                        `}
                                        animate={{ y: isActive ? -2 : 0 }}
                                    >
                                        {tab.label}
                                    </motion.span>

                                    {/* Status Badge */}
                                    <AnimatePresence>
                                        {isCompleted && !isActive && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 5 }}
                                                className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center"
                                            >
                                                <Check className="w-2.5 h-2.5 text-white" />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>

                    {/* Phase Transition Indicator */}
                    <AnimatePresence>
                        {isProcessing && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-4 pt-4 border-t border-[var(--cinema-silver)]/5"
                            >
                                <div className="flex items-center justify-center gap-3">
                                    <Loader2 className="w-4 h-4 text-[var(--cinema-spotlight)] animate-spin" />
                                    <span className="text-sm text-[var(--cinema-silver)]/60 font-script italic">
                                        {progress.message || 'Processing...'}
                                    </span>
                                    <div className="w-32 h-1.5 bg-[var(--cinema-silver)]/10 rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-[var(--cinema-spotlight)] to-[var(--cinema-editorial)]"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progress.percent}%` }}
                                            transition={{ duration: 0.3 }}
                                        />
                                    </div>
                                    <span className="text-xs text-[var(--cinema-silver)]/40 font-mono">
                                        {progress.percent}%
                                    </span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        );
    };

    const renderMainContent = () => {
        if (activeMainTab === 'idea') {
            return (
                <motion.div
                    key="idea"
                    variants={stepTransition}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="h-full"
                >
                    <IdeaView
                        initialTopic={initialTopic}
                        onGenerate={(topic, genre) => {
                            onGenerateIdea?.(topic, genre);
                        }}
                        isProcessing={isProcessing}
                    />
                </motion.div>
            );
        }

        if (activeMainTab === 'breakdown') {
            if (isBreakdownProcessing) {
                return (
                    <motion.div
                        key="breakdown-progress"
                        variants={fadeFromBlack}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                    >
                        <BreakdownProgress currentStage="creating" />
                    </motion.div>
                );
            }

            const breakdownTabs: { id: StoryStep; label: string }[] = [
                { id: 'breakdown', label: 'Scene Breakdown' },
                { id: 'script', label: 'Script' },
                { id: 'characters', label: 'Cast' },
            ];

            return (
                <motion.div
                    key="breakdown"
                    variants={stepTransition}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex flex-col h-full"
                >
                    {renderSubNav(breakdownTabs)}

                    <div className="flex-1 overflow-y-auto bg-[var(--cinema-void)]">
                        <AnimatePresence mode="wait">
                            {subTab === 'breakdown' && (
                                <motion.div
                                    key="scene-breakdown"
                                    variants={fadeFromBlack}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    className="p-8 max-w-5xl mx-auto w-full"
                                >
                                    <h2 className="font-display text-3xl text-[var(--cinema-silver)] mb-8 tracking-tight">
                                        Scene Breakdown
                                    </h2>
                                    <motion.div
                                        variants={staggerContainer}
                                        initial="initial"
                                        animate="animate"
                                        className="space-y-4"
                                    >
                                        {storyState.breakdown.map((scene) => (
                                            <motion.div
                                                key={scene.id}
                                                variants={staggerItem}
                                                className="bg-[var(--cinema-celluloid)] border border-[var(--cinema-silver)]/10 p-6 rounded-lg shadow-editorial hover:border-[var(--cinema-spotlight)]/30 transition-all duration-300"
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-mono text-xs text-[var(--cinema-spotlight)] tracking-widest">
                                                            SCENE {String(scene.sceneNumber).padStart(2, '0')}
                                                        </span>
                                                        <div className="w-8 h-px bg-[var(--cinema-velvet)]" />
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            const feedback = window.prompt(`How should we redo Scene ${scene.sceneNumber}? (Optional)`, "");
                                                            if (feedback !== null) onRegenerateScene?.(scene.sceneNumber, feedback);
                                                        }}
                                                        className="p-2 text-[var(--cinema-silver)]/40 hover:text-[var(--cinema-spotlight)] rounded-lg transition-colors"
                                                        disabled={isProcessing}
                                                    >
                                                        <RefreshCcw className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <h3 className="font-display text-xl text-[var(--cinema-silver)] mb-2" dir="auto">
                                                    {scene.heading}
                                                </h3>
                                                <p className="font-script italic text-[var(--cinema-silver)]/70 leading-relaxed" dir="auto">
                                                    {scene.action}
                                                </p>
                                            </motion.div>
                                        ))}
                                    </motion.div>
                                </motion.div>
                            )}
                            {subTab === 'script' && (
                                <motion.div
                                    key="script"
                                    variants={fadeFromBlack}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                >
                                    <ScriptView script={storyState.script} />
                                </motion.div>
                            )}
                            {subTab === 'characters' && (
                                <motion.div
                                    key="characters"
                                    variants={fadeFromBlack}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                >
                                    <CharacterView
                                        characters={storyState.characters}
                                        reports={storyState.consistencyReports}
                                        onVerify={onVerifyConsistency}
                                        isProcessing={isProcessing}
                                        onAdd={onAddCharacter}
                                        onEdit={onEditCharacter}
                                        onDelete={onDeleteCharacter}
                                        onGenerateImage={onGenerateCharacterImage}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            );
        }

        if (activeMainTab === 'storyboard') {
            if (isStoryboardProcessing) {
                return (
                    <motion.div
                        key="storyboard-progress"
                        variants={fadeFromBlack}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                    >
                        <StoryboardProgress currentStage={storyState.shots?.length ? 'storyboard' : 'shotlist'} />
                    </motion.div>
                );
            }

            const storyboardTabs: { id: StoryStep; label: string }[] = [
                { id: 'shots', label: 'Shot List' },
                { id: 'style', label: 'Visual Style' },
                { id: 'storyboard', label: 'Storyboard' },
                { id: 'narration', label: 'Narration' },
                { id: 'animation', label: 'Animation' },
                { id: 'export', label: 'Export' },
            ];

            return (
                <motion.div
                    key="storyboard"
                    variants={stepTransition}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex flex-col h-full"
                >
                    {renderSubNav(storyboardTabs)}

                    <div className="flex-1 overflow-y-auto bg-[var(--cinema-void)]">
                        <AnimatePresence mode="wait">
                            {subTab === 'shots' && (
                                <motion.div
                                    key="shots"
                                    variants={fadeFromBlack}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    className="p-6"
                                >
                                    <div className="flex justify-between items-center mb-8">
                                        <h2 className="font-display text-3xl text-[var(--cinema-silver)] tracking-tight">
                                            Shot Breakdown
                                        </h2>
                                        {storyState.isLocked && (
                                            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--cinema-spotlight)]/10 text-[var(--cinema-spotlight)] rounded border border-[var(--cinema-spotlight)]/20">
                                                <Lock className="w-3 h-3" />
                                                <span className="text-xs font-mono tracking-widest">LOCKED</span>
                                            </div>
                                        )}
                                    </div>
                                    <motion.div
                                        variants={staggerContainer}
                                        initial="initial"
                                        animate="animate"
                                        className="grid gap-6"
                                    >
                                        {storyState.breakdown.map((scene, idx) => {
                                            const shots = storyState.shots?.filter(s => s.sceneId === scene.id) || [];
                                            return (
                                                <motion.div
                                                    key={scene.id}
                                                    variants={staggerItem}
                                                    className="bg-[var(--cinema-celluloid)] border border-[var(--cinema-silver)]/10 rounded-lg overflow-hidden shadow-editorial"
                                                >
                                                    <div className="px-5 py-4 bg-[var(--cinema-void)]/50 flex justify-between items-center border-b border-[var(--cinema-silver)]/5">
                                                        <div className="flex items-center gap-3">
                                                            <span className="font-mono text-xs text-[var(--cinema-spotlight)]">
                                                                {String(scene.sceneNumber).padStart(2, '0')}
                                                            </span>
                                                            <span className="font-display text-[var(--cinema-silver)]">
                                                                {scene.heading}
                                                            </span>
                                                        </div>
                                                        {!shots.length && onGenerateShots && (
                                                            <button
                                                                onClick={() => onGenerateShots(idx)}
                                                                className="text-xs btn-cinematic px-4 py-1.5 rounded"
                                                            >
                                                                Generate Shots
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                        {shots.map(shot => (
                                                            <div
                                                                key={shot.id}
                                                                className="bg-[var(--cinema-void)]/60 border border-[var(--cinema-silver)]/5 p-4 rounded hover:border-[var(--cinema-spotlight)]/20 transition-colors"
                                                            >
                                                                <div className="flex justify-between text-xs mb-2">
                                                                    <span className="font-mono text-[var(--cinema-spotlight)]">
                                                                        SHOT {shot.shotNumber}
                                                                    </span>
                                                                    <span className="text-[var(--cinema-silver)]/40 uppercase tracking-wider">
                                                                        {shot.shotType}
                                                                    </span>
                                                                </div>
                                                                <p className="font-script text-[var(--cinema-silver)]/80 text-sm italic">
                                                                    {shot.description}
                                                                </p>
                                                            </div>
                                                        ))}
                                                        {shots.length === 0 && (
                                                            <div className="text-[var(--cinema-silver)]/30 font-script italic text-sm p-2">
                                                                No shots generated
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )
                                        })}
                                    </motion.div>
                                </motion.div>
                            )}
                            {subTab === 'style' && (
                                <motion.div
                                    key="style"
                                    variants={fadeFromBlack}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                >
                                    <StyleSelector
                                        selectedStyle={(storyState.visualStyle || 'CINEMATIC') as VisualStyleKey}
                                        onSelectStyle={(style) => onUpdateVisualStyle?.(style)}
                                        aspectRatio={(storyState.aspectRatio || '16:9') as AspectRatioId}
                                        onSelectAspectRatio={(ratio) => onUpdateAspectRatio?.(ratio)}
                                    />
                                </motion.div>
                            )}
                            {subTab === 'storyboard' && (
                                <motion.div
                                    key="storyboard-view"
                                    variants={fadeFromBlack}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                >
                                    <StoryboardView
                                        shots={storyState.shotlist}
                                        scenes={storyState.breakdown}
                                        scenesWithVisuals={storyState.scenesWithVisuals}
                                        onGenerateVisuals={onGenerateVisuals}
                                        isProcessing={isProcessing}
                                        onUpdateDuration={onUpdateShotDuration}
                                        onGenerateVideo={onGenerateVideo}
                                    />
                                </motion.div>
                            )}
                            {subTab === 'narration' && (
                                <motion.div
                                    key="narration-view"
                                    variants={fadeFromBlack}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    className="p-8 max-w-5xl mx-auto w-full"
                                >
                                    <div className="flex justify-between items-center mb-8">
                                        <h2 className="font-display text-3xl text-[var(--cinema-silver)] tracking-tight">
                                            Narration
                                        </h2>
                                        {onGenerateNarration && (
                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={onGenerateNarration}
                                                disabled={isProcessing}
                                                className="btn-cinematic px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                                            >
                                                <Mic className="w-4 h-4" />
                                                {allScenesHaveNarration?.() ? 'Regenerate Narration' : 'Generate Narration'}
                                            </motion.button>
                                        )}
                                    </div>
                                    <p className="text-[var(--cinema-silver)]/60 font-script italic mb-6">
                                        Generate AI voiceover for each scene using Gemini TTS.
                                    </p>
                                    <motion.div
                                        variants={staggerContainer}
                                        initial="initial"
                                        animate="animate"
                                        className="space-y-4"
                                    >
                                        {storyState.narrationSegments?.map((segment, idx) => (
                                            <motion.div
                                                key={segment.sceneId}
                                                variants={staggerItem}
                                                className="bg-[var(--cinema-celluloid)] border border-[var(--cinema-silver)]/10 p-5 rounded-lg"
                                            >
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="font-mono text-xs text-[var(--cinema-spotlight)]">
                                                        SCENE {String(idx + 1).padStart(2, '0')}
                                                    </span>
                                                    <span className="text-xs text-[var(--cinema-silver)]/40">
                                                        {segment.duration.toFixed(1)}s
                                                    </span>
                                                </div>
                                                <p className="font-script text-[var(--cinema-silver)]/80 text-sm italic mb-3" dir="auto">
                                                    {segment.text}
                                                </p>
                                                {segment.audioUrl && (
                                                    <audio
                                                        src={segment.audioUrl}
                                                        controls
                                                        className="w-full h-8 opacity-80"
                                                    />
                                                )}
                                            </motion.div>
                                        ))}
                                        {(!storyState.narrationSegments || storyState.narrationSegments.length === 0) && (
                                            <div className="text-center py-16 text-[var(--cinema-silver)]/40">
                                                <Mic className="w-12 h-12 mx-auto mb-4 opacity-30" />
                                                <p className="font-script italic">No narration generated yet</p>
                                                <p className="text-xs mt-2">Click "Generate Narration" to create voiceover</p>
                                            </div>
                                        )}
                                    </motion.div>
                                </motion.div>
                            )}
                            {subTab === 'animation' && (
                                <motion.div
                                    key="animation-view"
                                    variants={fadeFromBlack}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    className="p-8 max-w-6xl mx-auto w-full"
                                >
                                    <div className="flex justify-between items-center mb-8">
                                        <h2 className="font-display text-3xl text-[var(--cinema-silver)] tracking-tight">
                                            Animation
                                        </h2>
                                        {onAnimateShots && (
                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => onAnimateShots()}
                                                disabled={isProcessing}
                                                className="btn-cinematic px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                                            >
                                                <Video className="w-4 h-4" />
                                                {allShotsHaveAnimation?.() ? 'Regenerate All' : 'Animate All Shots'}
                                            </motion.button>
                                        )}
                                    </div>
                                    <p className="text-[var(--cinema-silver)]/60 font-script italic mb-6">
                                        Convert storyboard images to animated video clips using DeAPI or Veo.
                                    </p>
                                    <motion.div
                                        variants={staggerContainer}
                                        initial="initial"
                                        animate="animate"
                                        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                                    >
                                        {storyState.shotlist.map((shot, idx) => {
                                            const animated = storyState.animatedShots?.find(a => a.shotId === shot.id);
                                            return (
                                                <motion.div
                                                    key={shot.id}
                                                    variants={staggerItem}
                                                    className="bg-[var(--cinema-celluloid)] border border-[var(--cinema-silver)]/10 rounded-lg overflow-hidden group"
                                                >
                                                    <div className="aspect-video bg-[var(--cinema-void)] relative">
                                                        {animated?.videoUrl ? (
                                                            <video
                                                                src={animated.videoUrl}
                                                                className="w-full h-full object-cover"
                                                                loop
                                                                muted
                                                                playsInline
                                                                onMouseEnter={(e) => e.currentTarget.play()}
                                                                onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                                                            />
                                                        ) : shot.imageUrl ? (
                                                            <img
                                                                src={shot.imageUrl}
                                                                alt={shot.description}
                                                                className="w-full h-full object-cover opacity-60"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Video className="w-8 h-8 text-[var(--cinema-silver)]/20" />
                                                            </div>
                                                        )}
                                                        {!animated && shot.imageUrl && onAnimateShots && (
                                                            <button
                                                                onClick={() => onAnimateShots(idx)}
                                                                disabled={isProcessing}
                                                                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <Play className="w-8 h-8 text-white" />
                                                            </button>
                                                        )}
                                                        {animated && (
                                                            <div className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-500/80 text-white text-[10px] rounded uppercase tracking-wider">
                                                                Animated
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-3">
                                                        <span className="font-mono text-[10px] text-[var(--cinema-spotlight)]">
                                                            SHOT {shot.shotNumber}
                                                        </span>
                                                        <p className="text-xs text-[var(--cinema-silver)]/60 truncate mt-1">
                                                            {shot.description}
                                                        </p>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                        {storyState.shotlist.length === 0 && (
                                            <div className="col-span-full text-center py-16 text-[var(--cinema-silver)]/40">
                                                <Video className="w-12 h-12 mx-auto mb-4 opacity-30" />
                                                <p className="font-script italic">No shots to animate</p>
                                                <p className="text-xs mt-2">Generate storyboard visuals first</p>
                                            </div>
                                        )}
                                    </motion.div>
                                </motion.div>
                            )}
                            {subTab === 'export' && (
                                <motion.div
                                    key="export-view"
                                    variants={fadeFromBlack}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    className="p-8 max-w-3xl mx-auto w-full"
                                >
                                    <h2 className="font-display text-3xl text-[var(--cinema-silver)] tracking-tight mb-8 text-center">
                                        Export Video
                                    </h2>
                                    <div className="bg-[var(--cinema-celluloid)] border border-[var(--cinema-silver)]/10 rounded-xl p-8">
                                        {/* Preview */}
                                        {storyState.finalVideoUrl ? (
                                            <div className="mb-8">
                                                <video
                                                    src={storyState.finalVideoUrl}
                                                    controls
                                                    className="w-full rounded-lg"
                                                />
                                            </div>
                                        ) : (
                                            <div className="aspect-video bg-[var(--cinema-void)] rounded-lg flex items-center justify-center mb-8">
                                                <Film className="w-16 h-16 text-[var(--cinema-silver)]/20" />
                                            </div>
                                        )}
                                        {/* Stats */}
                                        <div className="grid grid-cols-3 gap-4 mb-8">
                                            <div className="text-center p-4 bg-[var(--cinema-void)]/50 rounded-lg">
                                                <div className="text-2xl font-display text-[var(--cinema-spotlight)]">
                                                    {storyState.breakdown.length}
                                                </div>
                                                <div className="text-xs text-[var(--cinema-silver)]/50 uppercase tracking-wider">Scenes</div>
                                            </div>
                                            <div className="text-center p-4 bg-[var(--cinema-void)]/50 rounded-lg">
                                                <div className="text-2xl font-display text-[var(--cinema-editorial)]">
                                                    {storyState.shotlist.length}
                                                </div>
                                                <div className="text-xs text-[var(--cinema-silver)]/50 uppercase tracking-wider">Shots</div>
                                            </div>
                                            <div className="text-center p-4 bg-[var(--cinema-void)]/50 rounded-lg">
                                                <div className="text-2xl font-display text-emerald-400">
                                                    {storyState.narrationSegments?.reduce((sum, s) => sum + s.duration, 0).toFixed(0) || 0}s
                                                </div>
                                                <div className="text-xs text-[var(--cinema-silver)]/50 uppercase tracking-wider">Duration</div>
                                            </div>
                                        </div>
                                        {/* Actions */}
                                        <div className="flex flex-col gap-3">
                                            {!storyState.finalVideoUrl ? (
                                                <motion.button
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={onExportFinalVideo}
                                                    disabled={isProcessing || !storyState.narrationSegments?.length}
                                                    className="w-full btn-cinematic py-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                                                >
                                                    {isProcessing ? (
                                                        <>
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                            Rendering Video...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Film className="w-5 h-5" />
                                                            Export Video
                                                        </>
                                                    )}
                                                </motion.button>
                                            ) : (
                                                <motion.button
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={onDownloadVideo}
                                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                                                >
                                                    <Download className="w-5 h-5" />
                                                    Download Video
                                                </motion.button>
                                            )}
                                            {!storyState.narrationSegments?.length && (
                                                <p className="text-center text-xs text-[var(--cinema-velvet)]">
                                                    Generate narration before exporting
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            );
        }
        return null;
    };

    return (
        <div className="flex flex-col h-full bg-[var(--cinema-void)] font-sans relative overflow-hidden">
            {/* Film Grain Overlay */}
            <div className="cinema-grain absolute inset-0 pointer-events-none z-50" />

            {/* Vignette Effect */}
            <div className="absolute inset-0 pointer-events-none z-40 bg-[radial-gradient(ellipse_at_center,transparent_50%,var(--cinema-void)_100%)]" />

            {/* Main Top Navigation - Cinematic Chapter Style */}
            <div className="relative z-10 flex items-center justify-between px-8 py-6 bg-[var(--cinema-celluloid)]/80 backdrop-blur-xl border-b border-[var(--cinema-silver)]/5">
                {/* Film Logo */}
                <div className="flex items-center gap-3 mr-8">
                    <Film className="w-5 h-5 text-[var(--cinema-spotlight)]" />
                    <span className="font-display text-sm text-[var(--cinema-silver)]/60 tracking-widest">STORY MODE</span>
                </div>

                {/* Chapter Navigation */}
                <div className="flex-1 flex items-center justify-center gap-16">
                    {mainTabs.map((tab, index) => {
                        const isActive = activeMainTab === tab.id;
                        const stepOrder = ['idea', 'breakdown', 'storyboard'];
                        const currentIdx = stepOrder.indexOf(getHighLevelStep(storyState.currentStep));
                        const tabIdx = stepOrder.indexOf(tab.id);
                        const isAccessible = tabIdx <= currentIdx;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    if (isAccessible) {
                                        setActiveMainTab(tab.id);
                                        if (tab.id === 'breakdown') setSubTab('breakdown');
                                        if (tab.id === 'storyboard') setSubTab('shots');
                                        if (tab.id === 'idea') setSubTab('idea');
                                    }
                                }}
                                disabled={!isAccessible}
                                className={`
                                    group relative flex flex-col items-center gap-1 transition-all duration-500
                                    ${isActive ? 'opacity-100' : isAccessible ? 'opacity-50 hover:opacity-80' : 'opacity-20 cursor-not-allowed'}
                                `}
                            >
                                {/* Roman Numeral */}
                                <span className={`
                                    font-display text-2xl tracking-wider transition-colors duration-300
                                    ${isActive ? 'text-[var(--cinema-spotlight)]' : 'text-[var(--cinema-silver)]'}
                                `}>
                                    {tab.romanNumeral}
                                </span>

                                {/* Label */}
                                <span className="font-script text-sm italic text-[var(--cinema-silver)]/70">
                                    {tab.label}
                                </span>

                                {/* Active Indicator - Spotlight Underline */}
                                {isActive && (
                                    <motion.div
                                        layoutId="mainTabIndicator"
                                        className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-16 h-0.5 bg-[var(--cinema-spotlight)]"
                                        style={{
                                            boxShadow: '0 0 20px var(--glow-spotlight), 0 0 40px var(--glow-spotlight)'
                                        }}
                                    />
                                )}

                                {/* Connector Line */}
                                {index < mainTabs.length - 1 && (
                                    <div className="absolute left-full top-1/2 -translate-y-1/2 w-16 h-px bg-[var(--cinema-silver)]/10 ml-8" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                    {activeMainTab !== 'idea' && (
                        <div className="flex items-center gap-1 mr-2">
                            <button
                                onClick={onUndo}
                                disabled={!canUndo}
                                className="p-2 text-[var(--cinema-silver)]/40 hover:text-[var(--cinema-silver)] disabled:opacity-20 transition-colors"
                            >
                                <Undo2 className="w-4 h-4" />
                            </button>
                            <button
                                onClick={onRedo}
                                disabled={!canRedo}
                                className="p-2 text-[var(--cinema-silver)]/40 hover:text-[var(--cinema-silver)] disabled:opacity-20 transition-colors"
                            >
                                <Redo2 className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {activeMainTab === 'breakdown' && subTab === 'script' && (
                        <div className="flex items-center gap-2">
                            {onExportScript && (
                                <button
                                    onClick={onExportScript}
                                    className="p-2 text-[var(--cinema-silver)]/40 hover:text-[var(--cinema-silver)] transition-colors"
                                    title="Export"
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                            )}
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleProceed}
                                className="btn-cinematic px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                            >
                                {!storyState.isLocked && <Lock className="w-4 h-4" />}
                                {storyState.isLocked ? 'Continue to Cast' : 'Lock Script'}
                            </motion.button>
                        </div>
                    )}

                    {activeMainTab === 'breakdown' && subTab === 'characters' && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onNextStep}
                            className="btn-cinematic px-5 py-2 rounded-lg text-sm font-medium"
                        >
                            Create Shot List
                        </motion.button>
                    )}

                    {activeMainTab === 'storyboard' && subTab === 'shots' && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSubTab('style')}
                            className="btn-cinematic px-5 py-2 rounded-lg text-sm font-medium"
                        >
                            Select Style
                        </motion.button>
                    )}

                    {activeMainTab === 'storyboard' && subTab === 'style' && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onNextStep}
                            className="btn-cinematic px-5 py-2 rounded-lg text-sm font-medium"
                        >
                            Generate Storyboard
                        </motion.button>
                    )}

                    {activeMainTab === 'storyboard' && subTab === 'storyboard' && storyState.scenesWithVisuals?.length && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSubTab('narration')}
                            className="btn-cinematic px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                        >
                            <Mic className="w-4 h-4" />
                            Add Narration
                        </motion.button>
                    )}

                    {activeMainTab === 'storyboard' && subTab === 'narration' && storyState.narrationSegments?.length && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSubTab('animation')}
                            className="btn-cinematic px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                        >
                            <Video className="w-4 h-4" />
                            Animate Shots
                        </motion.button>
                    )}

                    {activeMainTab === 'storyboard' && subTab === 'animation' && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSubTab('export')}
                            className="btn-cinematic px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                        >
                            <Film className="w-4 h-4" />
                            Export
                        </motion.button>
                    )}
                </div>
            </div>

            {/* Cinematic Progress Bar */}
            {isProcessing && (
                <div className="h-1 w-full bg-[var(--cinema-celluloid)] overflow-hidden relative z-10">
                    <motion.div
                        className="h-full bg-gradient-to-r from-[var(--cinema-spotlight)] to-[var(--cinema-editorial)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress.percent}%` }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                            boxShadow: '0 0 10px var(--glow-spotlight)'
                        }}
                    />
                </div>
            )}

            {/* Error Banner */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="relative z-10 mx-6 mt-4 p-4 rounded-lg bg-[var(--cinema-velvet)]/20 border border-[var(--cinema-velvet)]/40 flex items-start gap-3"
                    >
                        <AlertCircle className="w-5 h-5 text-[var(--cinema-velvet)] shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm text-[var(--cinema-silver)] font-medium">Something went wrong</p>
                            <p className="text-xs text-[var(--cinema-silver)]/60 mt-1 font-script italic">{error}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {onRetry && (
                                <button
                                    onClick={onRetry}
                                    className="px-3 py-1.5 text-xs font-medium bg-[var(--cinema-velvet)]/30 hover:bg-[var(--cinema-velvet)]/50 text-[var(--cinema-silver)] rounded transition-all flex items-center gap-1.5"
                                >
                                    <RefreshCcw className="w-3 h-3" />
                                    Retry
                                </button>
                            )}
                            {onClearError && (
                                <button
                                    onClick={onClearError}
                                    className="p-1.5 text-[var(--cinema-silver)]/40 hover:text-[var(--cinema-silver)] transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative z-10">
                <AnimatePresence mode="wait">
                    {renderMainContent()}
                </AnimatePresence>
            </div>

            {/* Stage Progress Helper - Cinematic Style */}
            {stageProgress && activeMainTab === 'storyboard' && !isProcessing && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="fixed bottom-6 right-6 z-50"
                >
                    <div className="bg-[var(--cinema-celluloid)]/95 backdrop-blur-xl border border-[var(--cinema-silver)]/10 rounded-lg p-4 shadow-cinematic">
                        <div className="flex items-center gap-4 text-xs font-mono">
                            <span className="text-[var(--cinema-silver)]/50">
                                SCENES: <span className="text-[var(--cinema-silver)]">{stageProgress.totalScenes}</span>
                            </span>
                            <span className="w-px h-4 bg-[var(--cinema-silver)]/10" />
                            <div className="flex items-center gap-2">
                                <span className={stageProgress.shotsComplete ? "text-emerald-400" : "text-[var(--cinema-spotlight)]"}>
                                    SHOTS: {stageProgress.scenesWithShots}/{stageProgress.totalScenes}
                                </span>
                                {stageProgress.shotsComplete
                                    ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    : <Loader2 className="w-3 h-3 text-[var(--cinema-spotlight)] animate-spin" />
                                }
                            </div>
                            <span className="w-px h-4 bg-[var(--cinema-silver)]/10" />
                            <div className="flex items-center gap-2">
                                <span className={stageProgress.visualsComplete ? "text-emerald-400" : "text-[var(--cinema-editorial)]"}>
                                    VISUALS: {stageProgress.scenesWithVisuals}/{stageProgress.totalScenes}
                                </span>
                                {stageProgress.visualsComplete
                                    ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    : <Circle className="w-3 h-3 text-[var(--cinema-editorial)]" />
                                }
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Lock Warning Dialog */}
            <LockWarningDialog
                isOpen={showLockDialog}
                onClose={() => setShowLockDialog(false)}
                onConfirmLock={() => {
                    onLockStory?.();
                    setShowLockDialog(false);
                }}
                estimatedCost={estimateProjectCost(storyState)}
                sceneCount={storyState.breakdown.length}
                estimatedShots={storyState.breakdown.length * 5}
            />
        </div>
    );
};

export default StoryWorkspace;
