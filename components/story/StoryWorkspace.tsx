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
import { Download, RefreshCcw, Undo2, Redo2, Lock, CheckCircle2, Circle, Loader2, AlertCircle, X, Film } from 'lucide-react';

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
    onUpdateShotDuration
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

    const renderSubNav = (tabs: { id: StoryStep; label: string }[]) => (
        <div className="w-full border-b border-[var(--cinema-celluloid)] bg-[var(--cinema-void)]">
            <div className="flex items-center gap-8 px-8">
                {tabs.map(tab => {
                    const isActive = subTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setSubTab(tab.id)}
                            className={`
                                relative py-4 text-sm tracking-wide transition-all duration-300
                                ${isActive
                                    ? 'text-[var(--cinema-silver)]'
                                    : 'text-[var(--cinema-silver)]/40 hover:text-[var(--cinema-silver)]/70'
                                }
                            `}
                        >
                            <span className="font-script italic">{tab.label}</span>
                            {isActive && (
                                <motion.div
                                    layoutId="subTabIndicator"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--cinema-spotlight)]"
                                    style={{ boxShadow: '0 0 10px var(--glow-spotlight)' }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );

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
