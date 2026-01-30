import React, { useState } from 'react';
import { IdeaView } from './IdeaView';
import { ScriptView } from './ScriptView';
import { CharacterView } from './CharacterView';
import { StoryboardView } from './StoryboardView';
import { LockWarningDialog } from './LockWarningDialog';
import { StyleSelector } from './StyleSelector';
import type { StoryState, StoryStep, StoryShot } from '@/types';
import type { VisualStyleKey, AspectRatioId } from '@/constants/visualStyles';
import { estimateProjectCost } from '@/utils/costEstimator';

import { Download, RefreshCcw, Undo2, Redo2, Lock, CheckCircle2, Circle, Loader2, AlertCircle, X } from 'lucide-react';

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
    // Storyboarder.ai-style workflow props
    onLockStory?: () => void;
    onUpdateVisualStyle?: (style: string) => void;
    onUpdateAspectRatio?: (ratio: string) => void;
    // Per-scene generation controls
    onGenerateShots?: (sceneIndex?: number) => void;
    onGenerateVisuals?: (sceneIndex?: number) => void;
    stageProgress?: StageProgress;
    // Error handling
    error?: string | null;
    onClearError?: () => void;
    onRetry?: () => void;
}

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
}) => {
    const [activeTab, setActiveTab] = useState<StoryStep>(storyState.currentStep);
    const [showLockDialog, setShowLockDialog] = useState(false);

    // Sync activeTab with currentStep when it changes (e.g., after generation)
    React.useEffect(() => {
        setActiveTab(storyState.currentStep);
    }, [storyState.currentStep]);

    // Keyboard shortcuts for Undo/Redo
    React.useEffect(() => {
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

    const tabs: { id: StoryStep; label: string; icon: string }[] = [
        { id: 'breakdown', label: 'Outline', icon: '📝' },
        { id: 'script', label: 'Script', icon: '🎬' },
        { id: 'characters', label: 'Cast', icon: '👤' },
        { id: 'shots', label: 'Shot List', icon: '🎥' },
        { id: 'style', label: 'Visual Style', icon: '🎨' },
        { id: 'storyboard', label: 'Storyboard', icon: '🖼️' },
    ];

    // Handle proceed button with lock dialog
    const handleProceed = () => {
        // Show lock dialog when on script step and not yet locked
        if (activeTab === 'script' && !storyState.isLocked) {
            setShowLockDialog(true);
        } else {
            // For all other cases (including locked script), proceed normally
            onNextStep();
        }
    };

    // Get the label for the proceed button based on current state
    const getProceedLabel = () => {
        if (activeTab === 'script' && !storyState.isLocked) {
            return 'Lock & Continue';
        }

        const currentTabIndex = tabs.findIndex(t => t.id === storyState.currentStep);
        const nextTab = tabs[currentTabIndex + 1];

        if (nextTab) {
            return `Proceed to ${nextTab.label}`;
        }

        return 'Complete';
    };

    // Check if proceed should be disabled based on current stage requirements
    const canProceed = () => {
        if (isProcessing) return false;

        // On characters step, story must be locked to proceed to shots
        if (activeTab === 'characters' && !storyState.isLocked) {
            return false;
        }

        return true;
    };

    const renderActiveStep = () => {
        switch (activeTab) {
            case 'idea':
                return (
                    <IdeaView
                        initialTopic={initialTopic}
                        onGenerate={(topic, genre) => {
                            if (onGenerateIdea) {
                                onGenerateIdea(topic, genre);
                            } else {
                                onNextStep();
                            }
                        }}
                        isProcessing={isProcessing}
                    />
                );
            case 'breakdown':
                // Detect if content is RTL (Arabic, Hebrew, etc.)
                const isRTL = storyState.breakdown.some(s =>
                    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s.heading + s.action)
                );
                return (
                    <div className="p-6 flex flex-col gap-6" dir={isRTL ? 'rtl' : 'ltr'}>
                        <h2 className="text-xl font-bold text-white" dir="ltr">Scene Breakdown</h2>
                        <div className="flex flex-col gap-4">
                            {storyState.breakdown.map((scene) => (
                                <div key={scene.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl group relative">
                                    <div className="flex justify-between items-start" dir="ltr">
                                        <div className="text-blue-500 font-mono text-sm mb-1">SCENE {scene.sceneNumber}</div>
                                        <button
                                            onClick={() => {
                                                const feedback = window.prompt(`How should we redo Scene ${scene.sceneNumber}? (Optional)`, "");
                                                if (feedback !== null) onRegenerateScene?.(scene.sceneNumber, feedback);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-all"
                                            title="Regenerate Scene"
                                            disabled={isProcessing}
                                        >
                                            <RefreshCcw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                                        </button>
                                    </div>
                                    <div className="text-white font-bold mb-2" dir="auto">{scene.heading}</div>
                                    <div className="text-zinc-400 text-sm whitespace-pre-wrap leading-relaxed" dir="auto">{scene.action}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'script':
                return <ScriptView script={storyState.script} />;
            case 'characters':
                return (
                    <CharacterView
                        characters={storyState.characters}
                        reports={storyState.consistencyReports}
                        onVerify={onVerifyConsistency}
                        isProcessing={isProcessing}
                    />
                );
            case 'shots':
                // Detect if content is RTL for shots view
                const isShotsRTL = storyState.breakdown.some(s =>
                    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s.heading + s.action)
                );
                return (
                    <div className="p-6 flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">Shot Breakdown</h2>
                                <p className="text-zinc-400 text-sm mt-1">
                                    {storyState.breakdown.length} scenes broken into {storyState.shots?.length || 0} shots
                                </p>
                            </div>
                            {storyState.isLocked && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Locked</span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-6">
                            {storyState.breakdown.map((scene, sceneIndex) => {
                                const sceneShots = storyState.shots?.filter(s => s.sceneId === scene.id) || [];
                                const hasShots = sceneShots.length > 0;
                                const sceneHasShots = storyState.scenesWithShots?.includes(scene.id);

                                return (
                                    <div key={scene.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                                        {/* Scene Header */}
                                        <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
                                            <div>
                                                <div className="text-blue-500 font-mono text-xs mb-1">SCENE {scene.sceneNumber}</div>
                                                <div className="text-white font-bold text-sm" dir="auto">{scene.heading}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {sceneHasShots ? (
                                                    <span className="flex items-center gap-1.5 text-xs text-green-400">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        {sceneShots.length} shots
                                                    </span>
                                                ) : storyState.isLocked && onGenerateShots ? (
                                                    <button
                                                        onClick={() => onGenerateShots(sceneIndex)}
                                                        disabled={isProcessing}
                                                        className="px-2.5 py-1 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all disabled:opacity-50"
                                                    >
                                                        Generate Shots
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-zinc-500">Pending</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Shots Grid */}
                                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {hasShots ? (
                                                sceneShots.map((shot) => (
                                                    <div
                                                        key={shot.id}
                                                        className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 space-y-2"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs font-bold text-white">
                                                                Shot {shot.shotNumber}
                                                            </span>
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                                                                {shot.shotType} • {shot.duration}s
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-zinc-500">
                                                            {shot.cameraAngle} • {shot.movement}
                                                        </div>
                                                        <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed" dir="auto">
                                                            {shot.description}
                                                        </p>
                                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                                                                {shot.emotion}
                                                            </span>
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                                                                {shot.lighting}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="col-span-full text-center py-8 text-zinc-500 text-sm">
                                                    {storyState.isLocked
                                                        ? 'Click "Generate Shots" to create the shot breakdown for this scene'
                                                        : 'Shots will be generated after locking the screenplay'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            case 'style':
                return (
                    <StyleSelector
                        selectedStyle={(storyState.visualStyle || 'CINEMATIC') as VisualStyleKey}
                        onSelectStyle={(style) => {
                            onUpdateVisualStyle?.(style);
                        }}
                        aspectRatio={(storyState.aspectRatio || '16:9') as AspectRatioId}
                        onSelectAspectRatio={(ratio) => {
                            onUpdateAspectRatio?.(ratio);
                        }}
                    />
                );
            case 'storyboard':
                return (
                    <StoryboardView
                        shots={storyState.shotlist}
                        scenes={storyState.breakdown}
                        scenesWithVisuals={storyState.scenesWithVisuals}
                        onGenerateVisuals={onGenerateVisuals}
                        isProcessing={isProcessing}
                    />
                );
            default:
                return null;
        }
    };

    // Hide header when on 'idea' step - IdeaView has its own UI
    const showHeader = storyState.currentStep !== 'idea';

    return (
        <div className="flex flex-col h-full bg-black">
            {/* Header / Nav - hidden on idea step */}
            {showHeader && (
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 sticky top-0 z-10 backdrop-blur-xl">
                    <div className="flex gap-2">
                        {tabs.map((tab, index) => {
                            const currentStepIndex = tabs.findIndex(t => t.id === storyState.currentStep);
                            const tabIndex = tabs.findIndex(t => t.id === tab.id);
                            const isCompleted = currentStepIndex > tabIndex;
                            const isCurrent = currentStepIndex === tabIndex;
                            const isActive = activeTab === tab.id;
                            const isPending = currentStepIndex < tabIndex;
                            const isProcessingThis = isProcessing && isCurrent;

                            // Show status icon based on state
                            const StatusIcon = () => {
                                if (isProcessingThis) {
                                    return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
                                }
                                if (isCompleted) {
                                    return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
                                }
                                if (isCurrent) {
                                    return <Circle className="w-3.5 h-3.5 text-blue-400" />;
                                }
                                return <Circle className="w-3.5 h-3.5 text-zinc-600" />;
                            };

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2
                                        ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}
                                        ${isPending ? 'opacity-40 cursor-not-allowed' : ''}
                                        ${isCompleted ? 'text-zinc-300' : ''}
                                    `}
                                    disabled={isPending}
                                >
                                    <StatusIcon />
                                    <span className="hidden sm:inline">{tab.label}</span>
                                    <span className="sm:hidden">{tab.icon}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-1.5 mr-3 border-r border-zinc-800 pr-3">
                        <button
                            onClick={onUndo}
                            disabled={!canUndo || isProcessing}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:hover:bg-transparent rounded-lg transition-all"
                            title="Undo (Ctrl+Z)"
                        >
                            <Undo2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onRedo}
                            disabled={!canRedo || isProcessing}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:hover:bg-transparent rounded-lg transition-all"
                            title="Redo (Ctrl+Y)"
                        >
                            <Redo2 className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {activeTab === 'script' && storyState.script && (
                            <button
                                onClick={onExportScript}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all flex items-center gap-2 text-sm font-bold"
                                title="Export Screenplay"
                            >
                                <Download className="w-4 h-4" />
                                Export
                            </button>
                        )}

                        <button
                            onClick={handleProceed}
                            disabled={!canProceed()}
                            className="bg-white text-black px-6 py-2 rounded-lg font-bold hover:bg-zinc-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isProcessing ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    {/* Show lock icon when about to lock */}
                                    {activeTab === 'script' && !storyState.isLocked && (
                                        <Lock className="w-4 h-4" />
                                    )}
                                    {getProceedLabel()}
                                    <span className="text-lg">→</span>
                                </>
                            )}
                        </button>
                    </div>

                </div>
            )}

            {/* Progress Bar */}
            {isProcessing && (
                <div className="h-1 w-full bg-zinc-800 overflow-hidden">
                    <div
                        className="h-full bg-blue-600 transition-all duration-500"
                        style={{ width: `${progress.percent}%` }}
                    />
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest text-center mt-1">
                        {progress.message}
                    </div>
                </div>
            )}

            {/* Stage Progress Summary - shown for shots and storyboard */}
            {stageProgress && (activeTab === 'shots' || activeTab === 'storyboard') && !isProcessing && (
                <div className="px-6 py-3 bg-zinc-900/30 border-b border-zinc-800">
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-zinc-500">Scenes:</span>
                                <span className="text-white font-bold">{stageProgress.totalScenes}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-zinc-500">Shots Generated:</span>
                                <span className={`font-bold ${stageProgress.shotsComplete ? 'text-green-400' : 'text-amber-400'}`}>
                                    {stageProgress.scenesWithShots}/{stageProgress.totalScenes} scenes
                                </span>
                                {stageProgress.shotsComplete && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                            </div>
                            {activeTab === 'storyboard' && (
                                <div className="flex items-center gap-2">
                                    <span className="text-zinc-500">Visuals Generated:</span>
                                    <span className={`font-bold ${stageProgress.visualsComplete ? 'text-green-400' : 'text-amber-400'}`}>
                                        {stageProgress.scenesWithVisuals}/{stageProgress.totalScenes} scenes
                                    </span>
                                    {stageProgress.visualsComplete && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                                </div>
                            )}
                        </div>

                        {/* Per-scene generation buttons */}
                        {activeTab === 'shots' && !stageProgress.shotsComplete && onGenerateShots && (
                            <button
                                onClick={() => onGenerateShots()}
                                className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all"
                            >
                                Generate All Shots
                            </button>
                        )}
                        {activeTab === 'storyboard' && !stageProgress.visualsComplete && onGenerateVisuals && (
                            <button
                                onClick={() => onGenerateVisuals()}
                                className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all"
                            >
                                Generate All Visuals
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Error Banner */}
            {error && (
                <div className="mx-6 mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm text-red-200 font-medium">Something went wrong</p>
                        <p className="text-xs text-red-300/80 mt-1">{error}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {onRetry && (
                            <button
                                onClick={onRetry}
                                className="px-3 py-1.5 text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-all flex items-center gap-1.5"
                            >
                                <RefreshCcw className="w-3 h-3" />
                                Retry
                            </button>
                        )}
                        {onClearError && (
                            <button
                                onClick={onClearError}
                                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto">
                {renderActiveStep()}
            </div>

            {/* Lock Warning Dialog */}
            <LockWarningDialog
                isOpen={showLockDialog}
                onClose={() => setShowLockDialog(false)}
                onConfirmLock={() => {
                    // Only lock the story - do NOT auto-advance
                    // User will click "Proceed" again to move to character generation
                    onLockStory?.();
                    setShowLockDialog(false);
                    // Note: We intentionally do NOT call onNextStep() here
                    // The user needs to review that the story is locked,
                    // then click Proceed to generate characters
                }}
                estimatedCost={estimateProjectCost(storyState)}
                sceneCount={storyState.breakdown.length}
                estimatedShots={storyState.breakdown.length * 5}
            />
        </div>
    );
};

export default StoryWorkspace;
