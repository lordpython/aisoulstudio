/**
 * StoryWorkspace.tsx
 * Main orchestrator for the story mode pipeline.
 */

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
import { SceneCard } from './SceneCard';
import { StepProgressBar } from './StepProgressBar';
import type { StoryState, StoryStep, CharacterProfile } from '@/types';
import type { VisualStyleKey, AspectRatioId } from '@/constants/visualStyles';
import { estimateProjectCost } from '@/utils/costEstimator';
import { Download, RefreshCcw, Undo2, Redo2, Lock, CheckCircle2, Circle, Loader2, AlertCircle, X, Film, Mic, Video, Play, Check, History, ImageIcon, MessageCircle, GripVertical } from 'lucide-react';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { ExportOptionsPanel } from './ExportOptionsPanel';
import { useLanguage } from '@/i18n/useLanguage';
import { FormatSelector } from '@/components/FormatSelector';
import { PipelineProgress } from '@/components/PipelineProgress';
import { CheckpointApproval } from '@/components/CheckpointApproval';
import { ReferenceDocumentUpload } from '@/components/ReferenceDocumentUpload';
import { formatRegistry } from '@/services/formatRegistry';
import type { UseFormatPipelineReturn } from '@/hooks/useFormatPipeline';

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
    onGenerateScreenplay?: () => void;
    onGenerateCharacters?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    isProcessing: boolean;
    progress: { message: string; percent: number };
    onLockStory?: () => void;
    onUpdateVisualStyle?: (style: string) => void;
    onUpdateAspectRatio?: (ratio: string) => void;
    onUpdateImageProvider?: (provider: 'gemini' | 'deapi') => void;
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
    onGenerateNarration?: () => void;
    onAnimateShots?: (shotIndex?: number) => void;
    onExportFinalVideo?: () => Promise<Blob | null | undefined>;
    onDownloadVideo?: () => void;
    allScenesHaveNarration?: () => boolean;
    allShotsHaveAnimation?: () => boolean;
    onApplyTemplate?: (state: Partial<StoryState>) => void;
    onImportProject?: (state: StoryState) => void;
    projectId?: string;
    /** Format pipeline hook for multi-format support */
    formatPipelineHook?: UseFormatPipelineReturn;
    /** Called when user clicks "Start Production" in FormatSelector */
    onFormatExecute?: () => void;
}

type MainStep = 'idea' | 'breakdown' | 'storyboard';

const quickFade = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15 },
};

function deriveEquipment(movement: string): string {
    const m = movement.toLowerCase();
    if (m === 'static') return 'Tripod';
    if (m.includes('dolly')) return 'Dolly';
    if (m.includes('track')) return 'Steady cam';
    if (m.includes('handheld')) return 'Handheld';
    if (m.includes('pan') || m.includes('tilt')) return 'Tripod';
    return 'Steady cam';
}

function deriveFocalLength(shotType: string): string {
    const s = shotType.toLowerCase();
    if (s.includes('extreme')) return '85mm';
    if (s.includes('close')) return '50mm';
    if (s.includes('medium')) return '35mm';
    if (s.includes('wide') || s.includes('long')) return '24mm';
    if (s.includes('pov') || s.includes('shoulder')) return '40mm';
    return '35mm';
}

export const StoryWorkspace: React.FC<StoryWorkspaceProps> = ({
    storyState,
    onNextStep,
    onGenerateIdea,
    initialTopic,
    onExportScript,
    onRegenerateScene,
    onVerifyConsistency,
    onGenerateScreenplay,
    onGenerateCharacters,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    isProcessing,
    progress,
    onLockStory,
    onUpdateVisualStyle,
    onUpdateAspectRatio,
    onUpdateImageProvider,
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
    onGenerateNarration,
    onAnimateShots,
    onExportFinalVideo,
    onDownloadVideo,
    allScenesHaveNarration,
    allShotsHaveAnimation,
    onApplyTemplate,
    onImportProject,
    projectId,
    formatPipelineHook,
    onFormatExecute,
}) => {
    const { t } = useLanguage();

    const getHighLevelStep = (step: StoryStep): MainStep => {
        if (step === 'idea') return 'idea';
        if (['breakdown', 'script', 'characters'].includes(step)) return 'breakdown';
        return 'storyboard';
    };

    const [activeMainTab, setActiveMainTab] = useState<MainStep>(getHighLevelStep(storyState.currentStep));
    const [subTab, setSubTab] = useState<StoryStep>(storyState.currentStep);
    const [showLockDialog, setShowLockDialog] = useState(false);
    const [showVersionHistory, setShowVersionHistory] = useState(false);

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
                        if (canRedo && onRedo) { e.preventDefault(); onRedo(); }
                    } else {
                        if (canUndo && onUndo) { e.preventDefault(); onUndo(); }
                    }
                } else if (e.key === 'y') {
                    if (canRedo && onRedo) { e.preventDefault(); onRedo(); }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onUndo, onRedo, canUndo, canRedo]);

    const mainTabs: { id: MainStep; label: string; number: string }[] = [
        { id: 'idea', label: t('story.storyIdea'), number: '1' },
        { id: 'breakdown', label: t('story.breakdown'), number: '2' },
        { id: 'storyboard', label: t('story.storyboard'), number: '3' },
    ];

    const handleProceed = () => {
        if (subTab === 'script' && !storyState.isLocked) {
            setShowLockDialog(true);
        } else {
            onNextStep();
        }
    };

    const handleTabNavigation = (tabId: StoryStep) => {
        if (tabId === 'script' && !storyState.script && !isProcessing) {
            onGenerateScreenplay?.();
        } else if (tabId === 'characters' && storyState.characters.length === 0 && !isProcessing) {
            onGenerateCharacters?.();
        }
        setSubTab(tabId);
    };

    const isBreakdownProcessing = isProcessing && activeMainTab === 'breakdown' && storyState.breakdown.length === 0;
    const isStoryboardProcessing = isProcessing && activeMainTab === 'storyboard' && (!storyState.shots || storyState.shots.length === 0);

    const getStepCompletionStatus = (stepId: StoryStep): 'completed' | 'active' | 'pending' | 'processing' => {
        const storyboardOrder: StoryStep[] = ['shots', 'style', 'storyboard', 'narration', 'animation', 'export'];
        const breakdownOrder: StoryStep[] = ['breakdown', 'script', 'characters'];
        const currentOrder = activeMainTab === 'storyboard' ? storyboardOrder : breakdownOrder;
        const currentIndex = currentOrder.indexOf(subTab);
        const stepIndex = currentOrder.indexOf(stepId);

        if (stepId === subTab) return isProcessing ? 'processing' : 'active';

        if (activeMainTab === 'storyboard') {
            switch (stepId) {
                case 'shots': return (storyState.shots?.length ?? 0) > 0 ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
                case 'style': return storyState.visualStyle ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
                case 'storyboard': return (storyState.scenesWithVisuals?.length ?? 0) > 0 ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
                case 'narration': return (storyState.narrationSegments?.length ?? 0) > 0 ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
                case 'animation': return (storyState.animatedShots?.length ?? 0) > 0 ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
                case 'export': return storyState.finalVideoUrl ? 'completed' : 'pending';
            }
        } else {
            switch (stepId) {
                case 'breakdown': return storyState.breakdown.length > 0 ? 'completed' : 'pending';
                case 'script': return storyState.script ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
                case 'characters': return storyState.characters.length > 0 ? 'completed' : 'pending';
            }
        }
        return stepIndex < currentIndex ? 'completed' : 'pending';
    };

    const renderSubNav = (tabs: { id: StoryStep; label: string }[]) => (
        <StepProgressBar
            tabs={tabs}
            currentTabId={subTab}
            onTabClick={(tabId) => handleTabNavigation(tabId as StoryStep)}
            getStepStatus={(tabId) => getStepCompletionStatus(tabId as StoryStep)}
            isProcessing={isProcessing}
            progress={progress}
        />
    );

    const renderMainContent = () => {
        if (activeMainTab === 'idea') {
            // If format pipeline hook is provided, use the multi-format flow
            if (formatPipelineHook) {
                const fpHook = formatPipelineHook;
                const isMovieAnimation = fpHook.selectedFormat === 'movie-animation';

                // State 1: Pipeline is running (non-movie format) → PipelineProgress
                if (fpHook.isRunning && !isMovieAnimation) {
                    return (
                        <motion.div key="pipeline-progress" {...quickFade} className="h-full flex items-center justify-center p-8">
                            <PipelineProgress
                                executionProgress={fpHook.executionProgress}
                                tasks={fpHook.tasks}
                                currentPhase={fpHook.currentPhase}
                                isRunning={fpHook.isRunning}
                                onCancel={fpHook.cancel}
                                isCancelling={fpHook.isCancelling}
                            />
                        </motion.div>
                    );
                }

                // State 2: Pipeline completed (success) → result view with asset preview
                if (!fpHook.isRunning && fpHook.result?.success) {
                    const pr = fpHook.result.partialResults ?? {};
                    const screenplay = (pr.screenplay ?? []) as { id: string; heading: string; action: string; dialogue?: { speaker: string; text: string }[] }[];
                    const visuals = (pr.visuals ?? []) as { sceneId: string; imageUrl: string }[];
                    const narrations = (pr.narrationSegments ?? []) as { sceneId: string; audioBlob: Blob; audioDuration: number; transcript: string }[];
                    const totalDuration = pr.totalDuration as number | undefined;
                    const research = pr.research as { sources?: { title: string }[]; citations?: { text: string }[] } | undefined;
                    const formatName = fpHook.selectedFormat ? formatRegistry.getFormat(fpHook.selectedFormat)?.name : 'video';

                    // Build a visual/narration lookup by sceneId for quick access
                    const visualMap = new Map(visuals.map(v => [v.sceneId, v.imageUrl]));
                    const narrationMap = new Map(narrations.map(n => [n.sceneId, n]));

                    return (
                        <motion.div key="pipeline-complete" {...quickFade} className="h-full overflow-y-auto">
                            <div className="w-full max-w-4xl mx-auto px-6 py-8">
                                {/* Header */}
                                <div className="text-center mb-8">
                                    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                                        <Check className="w-7 h-7 text-emerald-400" />
                                    </div>
                                    <h2 className="text-2xl font-medium text-zinc-100 mb-1">Production Complete</h2>
                                    <p className="text-zinc-500 text-sm">
                                        {formatName} — {screenplay.length} scene{screenplay.length !== 1 ? 's' : ''}
                                        {totalDuration != null && ` — ${Math.round(totalDuration)}s`}
                                        {narrations.length > 0 && ` — ${narrations.length} narration${narrations.length !== 1 ? 's' : ''}`}
                                    </p>
                                </div>

                                {/* Stats bar */}
                                <div className="flex flex-wrap justify-center gap-3 mb-8">
                                    <span className="px-3 py-1.5 bg-zinc-800/80 border border-zinc-700/50 rounded-sm text-xs font-mono text-zinc-300 flex items-center gap-1.5">
                                        <Film className="w-3.5 h-3.5 text-blue-400" />
                                        {screenplay.length} scenes
                                    </span>
                                    <span className="px-3 py-1.5 bg-zinc-800/80 border border-zinc-700/50 rounded-sm text-xs font-mono text-zinc-300 flex items-center gap-1.5">
                                        <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                                        {visuals.length} visuals
                                    </span>
                                    <span className="px-3 py-1.5 bg-zinc-800/80 border border-zinc-700/50 rounded-sm text-xs font-mono text-zinc-300 flex items-center gap-1.5">
                                        <Mic className="w-3.5 h-3.5 text-amber-400" />
                                        {narrations.length} narrations
                                    </span>
                                    {totalDuration != null && (
                                        <span className="px-3 py-1.5 bg-zinc-800/80 border border-zinc-700/50 rounded-sm text-xs font-mono text-zinc-300 flex items-center gap-1.5">
                                            <Play className="w-3.5 h-3.5 text-emerald-400" />
                                            {Math.floor(totalDuration / 60)}:{String(Math.round(totalDuration % 60)).padStart(2, '0')}
                                        </span>
                                    )}
                                    {research?.sources && (
                                        <span className="px-3 py-1.5 bg-zinc-800/80 border border-zinc-700/50 rounded-sm text-xs font-mono text-zinc-300">
                                            {research.sources.length} sources
                                        </span>
                                    )}
                                </div>

                                {/* Scene cards with visuals and audio */}
                                {screenplay.length > 0 && (
                                    <div className="space-y-4 mb-8">
                                        {screenplay.map((scene, i) => {
                                            const imageUrl = visualMap.get(scene.id);
                                            const narration = narrationMap.get(scene.id);
                                            return (
                                                <div key={scene.id} className="bg-zinc-900/60 border border-zinc-800 rounded-sm overflow-hidden">
                                                    <div className="flex flex-col sm:flex-row">
                                                        {/* Visual thumbnail */}
                                                        {imageUrl && (
                                                            <div className="sm:w-48 sm:shrink-0 aspect-video sm:aspect-auto sm:h-auto bg-zinc-950">
                                                                <img
                                                                    src={imageUrl}
                                                                    alt={`Scene ${i + 1}`}
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            </div>
                                                        )}
                                                        {/* Scene content */}
                                                        <div className="flex-1 p-4 min-w-0">
                                                            <div className="flex items-start gap-2 mb-1.5">
                                                                <span className="font-mono text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                                                                    {String(i + 1).padStart(2, '0')}
                                                                </span>
                                                                <h4 className="text-sm font-medium text-zinc-200 leading-tight">{scene.heading}</h4>
                                                            </div>
                                                            <p className="text-xs text-zinc-400 line-clamp-3 mb-2" dir="auto">{scene.action}</p>

                                                            {/* Dialogue preview */}
                                                            {scene.dialogue && scene.dialogue.length > 0 && (
                                                                <div className="mb-2">
                                                                    {scene.dialogue.slice(0, 2).map((d, di) => (
                                                                        <p key={di} className="text-[11px] text-zinc-500 truncate">
                                                                            <span className="text-zinc-400 font-medium">{d.speaker}:</span> {d.text}
                                                                        </p>
                                                                    ))}
                                                                    {scene.dialogue.length > 2 && (
                                                                        <p className="text-[10px] text-zinc-600">+{scene.dialogue.length - 2} more</p>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Audio player for narration */}
                                                            {narration && (
                                                                <div className="flex items-center gap-2 mt-2">
                                                                    <Mic className="w-3 h-3 text-amber-400 shrink-0" />
                                                                    <audio
                                                                        controls
                                                                        className="h-7 w-full max-w-xs [&::-webkit-media-controls-panel]:bg-zinc-800 [&::-webkit-media-controls-panel]:rounded-sm"
                                                                        src={URL.createObjectURL(narration.audioBlob)}
                                                                    />
                                                                    <span className="text-[10px] text-zinc-500 font-mono shrink-0">{narration.audioDuration.toFixed(1)}s</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Completed task summary (collapsed) */}
                                {fpHook.tasks.length > 0 && (
                                    <details className="mb-8 group">
                                        <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400 transition-colors font-mono text-center">
                                            Pipeline tasks
                                        </summary>
                                        <div className="mt-3">
                                            <PipelineProgress
                                                executionProgress={fpHook.executionProgress}
                                                tasks={fpHook.tasks}
                                                currentPhase="Complete"
                                                isRunning={false}
                                                onCancel={() => {}}
                                                summaryOnly
                                            />
                                        </div>
                                    </details>
                                )}

                                {/* Actions */}
                                <div className="flex items-center justify-center gap-3">
                                    {/* Download all visuals */}
                                    {visuals.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                visuals.forEach((v, i) => {
                                                    const a = document.createElement('a');
                                                    a.href = v.imageUrl;
                                                    a.download = `scene_${i + 1}.png`;
                                                    a.click();
                                                });
                                            }}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm font-mono text-sm font-medium border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors duration-200"
                                        >
                                            <Download className="w-4 h-4" />
                                            Download Images
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={fpHook.reset}
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm font-mono text-sm font-medium bg-white text-black hover:bg-zinc-200 transition-colors duration-200"
                                    >
                                        <RefreshCcw className="w-4 h-4" />
                                        Start New Production
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    );
                }

                // State 3: Pipeline failed or cancelled → error view with retry
                if (!fpHook.isRunning && (fpHook.error || fpHook.result?.success === false)) {
                    const errorMsg = fpHook.error || fpHook.result?.error || 'Pipeline failed';
                    const wasCancelled = fpHook.tasks.some(t => t.status === 'cancelled');
                    return (
                        <motion.div key="pipeline-error" {...quickFade} className="h-full flex items-center justify-center p-8">
                            <div className="w-full max-w-2xl mx-auto text-center">
                                <div className={`w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center ${wasCancelled ? 'bg-zinc-500/10 border border-zinc-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                                    {wasCancelled
                                        ? <X className="w-8 h-8 text-zinc-400" />
                                        : <AlertCircle className="w-8 h-8 text-red-400" />
                                    }
                                </div>
                                <h2 className="text-2xl font-medium text-zinc-100 mb-2">
                                    {wasCancelled ? 'Production Cancelled' : 'Production Failed'}
                                </h2>
                                <p className="text-zinc-400 text-sm mb-4">{errorMsg}</p>
                                {/* Task summary showing what completed */}
                                {fpHook.tasks.length > 0 && (
                                    <div className="mb-8">
                                        <PipelineProgress
                                            executionProgress={fpHook.executionProgress}
                                            tasks={fpHook.tasks}
                                            currentPhase={wasCancelled ? 'Cancelled' : 'Failed'}
                                            isRunning={false}
                                            onCancel={() => {}}
                                            summaryOnly
                                        />
                                    </div>
                                )}
                                <div className="flex items-center justify-center gap-3">
                                    <button
                                        type="button"
                                        onClick={fpHook.reset}
                                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-sm font-mono text-sm font-medium border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors duration-200"
                                    >
                                        <RefreshCcw className="w-4 h-4" />
                                        Start Over
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    );
                }

                // State 4: movie-animation selected → IdeaView with synced idea/genre
                if (isMovieAnimation) {
                    return (
                        <motion.div key="idea" {...quickFade} className="h-full">
                            <IdeaView
                                initialTopic={fpHook.idea || initialTopic}
                                onGenerate={(topic, genre) => onGenerateIdea?.(topic, genre)}
                                onApplyTemplate={onApplyTemplate}
                                isProcessing={isProcessing}
                            />
                        </motion.div>
                    );
                }

                // State 5: FormatSelector (no format yet, or a non-movie format selected but idle)
                const selectedMeta = fpHook.selectedFormat ? formatRegistry.getFormat(fpHook.selectedFormat) : null;
                return (
                    <motion.div key="format-selector" {...quickFade} className="h-full overflow-y-auto">
                        {/* Error banner from previous failed attempt */}
                        {fpHook.error && !fpHook.isRunning && !fpHook.result && (
                            <div className="mx-6 mt-6 p-4 rounded-sm bg-red-500/10 border border-red-500/30 flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-sm text-zinc-100 font-medium">Something went wrong</p>
                                    <p className="text-xs text-zinc-500 mt-1">{fpHook.error}</p>
                                </div>
                            </div>
                        )}
                        <FormatSelector
                            selectedFormat={fpHook.selectedFormat}
                            onFormatSelect={fpHook.setFormat}
                            selectedGenre={fpHook.selectedGenre}
                            onGenreSelect={fpHook.setGenre}
                            idea={fpHook.idea}
                            onIdeaChange={fpHook.setIdea}
                            onExecute={() => onFormatExecute?.()}
                            isProcessing={fpHook.isRunning}
                        />
                        {/* Reference document upload for research formats */}
                        {selectedMeta?.requiresResearch && (
                            <div className="px-6 pb-12 max-w-3xl mx-auto">
                                <div className="mb-3">
                                    <span className="font-mono text-[11px] font-medium tracking-[0.15em] uppercase text-zinc-500">
                                        Reference Documents (Optional)
                                    </span>
                                </div>
                                <ReferenceDocumentUpload
                                    documents={fpHook.referenceDocuments}
                                    onDocumentsChange={fpHook.setReferenceDocuments}
                                />
                            </div>
                        )}
                    </motion.div>
                );
            }

            // Fallback: no format pipeline hook — existing IdeaView (backward compat)
            return (
                <motion.div key="idea" {...quickFade} className="h-full">
                    <IdeaView
                        initialTopic={initialTopic}
                        onGenerate={(topic, genre) => onGenerateIdea?.(topic, genre)}
                        onApplyTemplate={onApplyTemplate}
                        isProcessing={isProcessing}
                    />
                </motion.div>
            );
        }

        if (activeMainTab === 'breakdown') {
            if (isBreakdownProcessing) {
                return (
                    <motion.div key="breakdown-progress" {...quickFade}>
                        <BreakdownProgress currentStage="creating" />
                    </motion.div>
                );
            }

            const breakdownTabs: { id: StoryStep; label: string }[] = [
                { id: 'breakdown', label: t('story.sceneBreakdown') },
                { id: 'script', label: t('story.script') },
                { id: 'characters', label: t('story.cast') },
            ];

            return (
                <motion.div key="breakdown" {...quickFade} className="flex flex-col h-full">
                    {renderSubNav(breakdownTabs)}
                    <div className="flex-1 overflow-y-auto bg-black">
                        <AnimatePresence mode="wait">
                            {subTab === 'breakdown' && (
                                <motion.div key="scene-breakdown" {...quickFade} className="p-8 max-w-5xl mx-auto w-full">
                                    <h2 className="font-sans text-2xl font-medium tracking-tight text-zinc-100 mb-8">
                                        {t('story.sceneBreakdown')}
                                    </h2>
                                    <div className="space-y-4">
                                        {storyState.breakdown.map((scene) => (
                                            <SceneCard
                                                key={scene.id}
                                                sceneNumber={scene.sceneNumber}
                                                heading={scene.heading}
                                                content={scene.action}
                                                onRegenerate={(num, feedback) => onRegenerateScene?.(num, feedback)}
                                                isProcessing={isProcessing}
                                            />
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                            {subTab === 'script' && (
                                <motion.div key="script" {...quickFade}>
                                    <ScriptView script={storyState.script} />
                                </motion.div>
                            )}
                            {subTab === 'characters' && (
                                <motion.div key="characters" {...quickFade}>
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
                    <motion.div key="storyboard-progress" {...quickFade}>
                        <StoryboardProgress currentStage={storyState.shots?.length ? 'storyboard' : 'shotlist'} />
                    </motion.div>
                );
            }

            const storyboardTabs: { id: StoryStep; label: string }[] = [
                { id: 'shots', label: t('story.shotList') },
                { id: 'style', label: t('story.visualStyle') },
                { id: 'storyboard', label: t('story.storyboard') },
                { id: 'narration', label: t('story.narration') },
                { id: 'animation', label: t('story.animation') },
                { id: 'export', label: t('story.export') },
            ];

            return (
                <motion.div key="storyboard" {...quickFade} className="flex flex-col h-full">
                    {renderSubNav(storyboardTabs)}
                    <div className={`flex-1 bg-black ${subTab === 'storyboard' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
                        <AnimatePresence mode="wait">
                            {subTab === 'shots' && (
                                <motion.div key="shots" {...quickFade} className="p-6">
                                    <div className="flex justify-between items-center mb-8">
                                        <h2 className="font-sans text-2xl font-medium tracking-tight text-zinc-100">
                                            {t('story.shotBreakdown')}
                                        </h2>
                                        {storyState.isLocked && (
                                            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-blue-500/10 text-blue-400 rounded-sm border border-blue-500/30">
                                                <Lock className="w-4 h-4" />
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-mono font-bold tracking-wide">{t('story.locked')}</span>
                                                    <span className="text-[10px] text-zinc-500">Structure finalized</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-8">
                                        {storyState.breakdown.map((scene, idx) => {
                                            const sceneShots = storyState.shots?.filter(s => s.sceneId === scene.id) || [];
                                            const moodLighting = sceneShots[0]?.lighting || '';
                                            return (
                                                <div key={scene.id} className="rounded-sm overflow-hidden border border-zinc-800">
                                                    {/* Scene Header */}
                                                    <div className="px-5 py-3 bg-zinc-950 flex items-center justify-between border-b border-zinc-800">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-sm border border-blue-500/20 shrink-0">
                                                                SCENE {scene.sceneNumber}
                                                            </span>
                                                            <span className="font-mono text-sm font-medium text-zinc-100 truncate" dir="auto">
                                                                {scene.heading}
                                                            </span>
                                                            {moodLighting && (
                                                                <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 shrink-0">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70" />
                                                                    {moodLighting}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {!sceneShots.length && onGenerateShots && (
                                                            <button
                                                                onClick={() => onGenerateShots(idx)}
                                                                className="text-xs px-4 py-1.5 rounded-sm bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors duration-200 shrink-0 ml-4"
                                                            >
                                                                {t('story.generateShots')}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Shots Table */}
                                                    {sceneShots.length > 0 ? (
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left border-collapse">
                                                                <thead>
                                                                    <tr className="border-b border-zinc-800 bg-zinc-900/60">
                                                                        <th className="py-2 px-2 w-6" />
                                                                        <th className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 w-16">Scene</th>
                                                                        <th className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 w-14">Shot</th>
                                                                        <th className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 min-w-[220px]">Description</th>
                                                                        <th className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 w-20">Dialogue</th>
                                                                        <th className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 w-16">ERT</th>
                                                                        <th className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 w-28">Size</th>
                                                                        <th className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 w-28">Perspective</th>
                                                                        <th className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 w-28">Movement</th>
                                                                        <th className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 w-28">Equipment</th>
                                                                        <th className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 w-28">Focal Length</th>
                                                                        <th className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 w-24">Aspect Ratio</th>
                                                                        <th className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 w-16">Notes</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {sceneShots.map((shot) => {
                                                                        const equipment = deriveEquipment(shot.movement);
                                                                        const focalLength = deriveFocalLength(shot.shotType);
                                                                        const hasDialogue = !!shot.scriptSegment;
                                                                        return (
                                                                            <tr
                                                                                key={shot.id}
                                                                                className="border-b border-zinc-800/50 hover:bg-zinc-800/25 transition-colors group"
                                                                            >
                                                                                <td className="py-3 px-2 text-zinc-700 group-hover:text-zinc-500">
                                                                                    <GripVertical className="w-3.5 h-3.5" />
                                                                                </td>
                                                                                <td className="py-3 px-3 font-mono text-xs text-zinc-500">
                                                                                    {scene.sceneNumber}
                                                                                </td>
                                                                                <td className="py-3 px-3 font-mono text-xs text-blue-400 font-bold">
                                                                                    {shot.shotNumber}
                                                                                </td>
                                                                                <td className="py-3 px-3 text-xs text-zinc-300 leading-relaxed" dir="auto">
                                                                                    {shot.description}
                                                                                </td>
                                                                                <td className="py-3 px-3">
                                                                                    <button
                                                                                        className={`p-1.5 rounded-sm transition-colors ${hasDialogue ? 'text-blue-400 hover:text-blue-300' : 'text-zinc-700 hover:text-zinc-500'}`}
                                                                                        title={shot.scriptSegment || undefined}
                                                                                    >
                                                                                        <MessageCircle className="w-3.5 h-3.5" />
                                                                                    </button>
                                                                                </td>
                                                                                <td className="py-3 px-3 text-xs text-zinc-400 whitespace-nowrap">
                                                                                    {shot.duration} sec
                                                                                </td>
                                                                                <td className="py-3 px-3 text-xs text-zinc-400 whitespace-nowrap">
                                                                                    {shot.shotType}
                                                                                </td>
                                                                                <td className="py-3 px-3 text-xs text-zinc-400 whitespace-nowrap">
                                                                                    {shot.cameraAngle}
                                                                                </td>
                                                                                <td className="py-3 px-3 text-xs text-zinc-400 whitespace-nowrap">
                                                                                    {shot.movement}
                                                                                </td>
                                                                                <td className="py-3 px-3 text-xs text-zinc-400 whitespace-nowrap">
                                                                                    {equipment}
                                                                                </td>
                                                                                <td className="py-3 px-3 text-xs text-zinc-400 whitespace-nowrap">
                                                                                    {focalLength}
                                                                                </td>
                                                                                <td className="py-3 px-3 text-xs text-zinc-400 whitespace-nowrap">
                                                                                    {storyState.aspectRatio || '16:9'}
                                                                                </td>
                                                                                <td className="py-3 px-3">
                                                                                    <button className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors whitespace-nowrap">
                                                                                        Add+
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    ) : (
                                                        <div className="text-center py-12">
                                                            <ImageIcon className="w-12 h-12 mx-auto mb-4 text-zinc-800" />
                                                            <p className="text-zinc-600 text-sm">
                                                                {t('story.noShotsGenerated')}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            )}
                            {subTab === 'style' && (
                                <motion.div key="style" {...quickFade}>
                                    <StyleSelector
                                        selectedStyle={(storyState.visualStyle || 'CINEMATIC') as VisualStyleKey}
                                        onSelectStyle={(style) => onUpdateVisualStyle?.(style)}
                                        aspectRatio={(storyState.aspectRatio || '16:9') as AspectRatioId}
                                        onSelectAspectRatio={(ratio) => onUpdateAspectRatio?.(ratio)}
                                        imageProvider={storyState.imageProvider || 'gemini'}
                                        onSelectImageProvider={onUpdateImageProvider}
                                    />
                                </motion.div>
                            )}
                            {subTab === 'storyboard' && (
                                <motion.div key="storyboard-view" {...quickFade} className="h-full">
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
                                <motion.div key="narration-view" {...quickFade} className="p-8 max-w-5xl mx-auto w-full">
                                    <div className="flex justify-between items-center mb-8">
                                        <h2 className="font-sans text-2xl font-medium tracking-tight text-zinc-100">
                                            {t('story.narration')}
                                        </h2>
                                        {onGenerateNarration && (
                                            <button
                                                onClick={onGenerateNarration}
                                                disabled={isProcessing}
                                                className="px-5 py-2.5 rounded-sm text-sm font-medium flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors duration-200"
                                            >
                                                <Mic className="w-4 h-4" />
                                                {allScenesHaveNarration?.() ? t('story.regenerateNarration') : t('story.generateNarration')}
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-zinc-500 text-sm mb-6">
                                        {t('story.narrationDescription')}
                                    </p>
                                    <div className="space-y-4">
                                        {storyState.narrationSegments?.map((segment, idx) => (
                                            <div
                                                key={segment.sceneId}
                                                className="bg-zinc-900 border border-zinc-800 p-5 rounded-sm"
                                            >
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="font-mono text-xs text-blue-400">
                                                        SCENE {String(idx + 1).padStart(2, '0')}
                                                    </span>
                                                    <span className="font-mono text-xs text-zinc-600">
                                                        {segment.duration.toFixed(1)}s
                                                    </span>
                                                </div>
                                                <p className="text-zinc-400 text-sm mb-3" dir="auto">
                                                    {segment.text}
                                                </p>
                                                {segment.audioUrl && (
                                                    <audio src={segment.audioUrl} controls className="w-full h-8 opacity-80" />
                                                )}
                                            </div>
                                        ))}
                                        {(!storyState.narrationSegments || storyState.narrationSegments.length === 0) && (
                                            <div className="text-center py-16 text-zinc-600">
                                                <Mic className="w-12 h-12 mx-auto mb-4 opacity-30" />
                                                <p className="text-sm">{t('story.noNarrationYet')}</p>
                                                <p className="text-xs mt-2 text-zinc-700">{t('story.clickGenerateNarration')}</p>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                            {subTab === 'animation' && (
                                <motion.div key="animation-view" {...quickFade} className="p-8 max-w-6xl mx-auto w-full">
                                    <div className="flex justify-between items-center mb-8">
                                        <h2 className="font-sans text-2xl font-medium tracking-tight text-zinc-100">
                                            {t('story.animation')}
                                        </h2>
                                        {onAnimateShots && (
                                            <button
                                                onClick={() => onAnimateShots()}
                                                disabled={isProcessing}
                                                className="px-5 py-2.5 rounded-sm text-sm font-medium flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors duration-200"
                                            >
                                                <Video className="w-4 h-4" />
                                                {allShotsHaveAnimation?.() ? t('story.regenerateAll') : t('story.animateAllShots')}
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-zinc-500 text-sm mb-6">
                                        {t('story.animationDescription')}
                                    </p>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {storyState.shotlist.map((shot, idx) => {
                                            const animated = storyState.animatedShots?.find(a => a.shotId === shot.id);
                                            return (
                                                <div
                                                    key={shot.id}
                                                    className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden group"
                                                >
                                                    <div className="aspect-video bg-zinc-950 relative">
                                                        {animated?.videoUrl ? (
                                                            <video
                                                                src={animated.videoUrl}
                                                                className="w-full h-full object-cover"
                                                                loop muted playsInline
                                                                onMouseEnter={(e) => e.currentTarget.play()}
                                                                onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                                                            />
                                                        ) : shot.imageUrl ? (
                                                            <img src={shot.imageUrl} alt={shot.description} className="w-full h-full object-cover opacity-60" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Video className="w-8 h-8 text-zinc-800" />
                                                            </div>
                                                        )}
                                                        {!animated && shot.imageUrl && onAnimateShots && (
                                                            <button
                                                                onClick={() => onAnimateShots(idx)}
                                                                disabled={isProcessing}
                                                                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                                            >
                                                                <Play className="w-8 h-8 text-white" />
                                                            </button>
                                                        )}
                                                        {animated && (
                                                            <div className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-500/80 text-white text-[10px] rounded-sm uppercase tracking-wider font-mono">
                                                                {t('story.animated')}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-3">
                                                        <span className="font-mono text-[10px] text-blue-400">
                                                            SHOT {shot.shotNumber}
                                                        </span>
                                                        <p className="text-xs text-zinc-500 truncate mt-1">
                                                            {shot.description}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {storyState.shotlist.length === 0 && (
                                            <div className="col-span-full text-center py-16 text-zinc-600">
                                                <Video className="w-12 h-12 mx-auto mb-4 opacity-30" />
                                                <p className="text-sm">{t('story.noShotsToAnimate')}</p>
                                                <p className="text-xs mt-2 text-zinc-700">{t('story.generateStoryboardFirst')}</p>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                            {subTab === 'export' && (
                                <motion.div key="export-view" {...quickFade} className="p-8 max-w-3xl mx-auto w-full">
                                    <h2 className="font-sans text-2xl font-medium tracking-tight text-zinc-100 mb-8 text-center">
                                        {t('story.exportVideo')}
                                    </h2>
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-8">
                                        {/* Preview */}
                                        {storyState.finalVideoUrl ? (
                                            <div className="mb-8">
                                                <video src={storyState.finalVideoUrl} controls className="w-full rounded-sm" />
                                            </div>
                                        ) : (
                                            <div className="aspect-video bg-zinc-950 rounded-sm flex items-center justify-center mb-8 border border-zinc-800">
                                                <Film className="w-16 h-16 text-zinc-800" />
                                            </div>
                                        )}
                                        {/* Stats */}
                                        <div className="grid grid-cols-3 gap-4 mb-8">
                                            <div className="text-center p-4 bg-zinc-950 rounded-sm border border-zinc-800">
                                                <div className="text-2xl font-sans font-medium text-blue-400">
                                                    {storyState.breakdown.length}
                                                </div>
                                                <div className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">{t('story.scenes')}</div>
                                            </div>
                                            <div className="text-center p-4 bg-zinc-950 rounded-sm border border-zinc-800">
                                                <div className="text-2xl font-sans font-medium text-orange-400">
                                                    {storyState.shotlist.length}
                                                </div>
                                                <div className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">{t('story.shots')}</div>
                                            </div>
                                            <div className="text-center p-4 bg-zinc-950 rounded-sm border border-zinc-800">
                                                <div className="text-2xl font-sans font-medium text-emerald-400">
                                                    {storyState.narrationSegments?.reduce((sum, s) => sum + s.duration, 0).toFixed(0) || 0}s
                                                </div>
                                                <div className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">{t('story.duration')}</div>
                                            </div>
                                        </div>
                                        {/* Actions */}
                                        <div className="flex flex-col gap-3">
                                            {!storyState.finalVideoUrl ? (
                                                <button
                                                    onClick={onExportFinalVideo}
                                                    disabled={isProcessing || !storyState.narrationSegments?.length}
                                                    className="w-full py-4 rounded-sm text-sm font-medium flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors duration-200"
                                                >
                                                    {isProcessing ? (
                                                        <><Loader2 className="w-5 h-5 animate-spin" />{t('story.renderingVideo')}</>
                                                    ) : (
                                                        <><Film className="w-5 h-5" />{t('story.exportVideo')}</>
                                                    )}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={onDownloadVideo}
                                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-sm text-sm font-medium flex items-center justify-center gap-2 transition-colors duration-200"
                                                >
                                                    <Download className="w-5 h-5" />
                                                    {t('story.downloadVideo')}
                                                </button>
                                            )}
                                            {!storyState.narrationSegments?.length && (
                                                <p className="text-center text-xs text-orange-400">
                                                    {t('story.generateNarrationBeforeExport')}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-6">
                                        <ExportOptionsPanel
                                            storyState={storyState}
                                            onImportProject={onImportProject}
                                            onExportVideo={onExportFinalVideo}
                                        />
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
        <div className="flex flex-col h-full bg-black font-sans relative overflow-hidden">
            {/* Main Top Navigation */}
            <div className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-950">
                {/* Step Navigation */}
                <div className="flex items-center gap-1">
                    {mainTabs.map((tab, index) => {
                        const isActive = activeMainTab === tab.id;
                        const stepOrder: MainStep[] = ['idea', 'breakdown', 'storyboard'];
                        const currentIdx = stepOrder.indexOf(getHighLevelStep(storyState.currentStep));
                        const tabIdx = stepOrder.indexOf(tab.id);
                        const isAccessible = tabIdx <= currentIdx;
                        const isCompleted = tabIdx < currentIdx;

                        return (
                            <React.Fragment key={tab.id}>
                                <button
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
                                        relative flex items-center gap-2.5 px-4 py-2 rounded-sm transition-all duration-200
                                        ${isActive ? 'bg-zinc-800 border border-zinc-700' : 'border border-transparent'}
                                        ${!isAccessible ? 'opacity-40 cursor-not-allowed' : isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100'}
                                    `}
                                >
                                    <span className={`
                                        w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-mono font-bold shrink-0 transition-all duration-200
                                        ${isActive ? 'bg-white text-black' : isCompleted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}
                                    `}>
                                        {isCompleted ? <Check className="w-3 h-3" /> : tab.number}
                                    </span>
                                    <span className={`
                                        font-sans text-[13px] font-medium whitespace-nowrap transition-colors duration-200
                                        ${isActive ? 'text-zinc-100' : isCompleted ? 'text-emerald-400/80' : 'text-zinc-400'}
                                    `}>
                                        {tab.label}
                                    </span>
                                </button>

                                {index < mainTabs.length - 1 && (
                                    <div className={`w-6 h-px mx-0.5 shrink-0 ${isCompleted ? 'bg-emerald-500/30' : 'bg-zinc-800'}`} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                    {activeMainTab !== 'idea' && (
                        <div className="flex items-center gap-0.5 mr-1">
                            <button
                                onClick={onUndo}
                                disabled={!canUndo}
                                className="p-1.5 rounded-sm text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 disabled:opacity-20 transition-all duration-200"
                                title="Undo (Ctrl+Z)"
                            >
                                <Undo2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={onRedo}
                                disabled={!canRedo}
                                className="p-1.5 rounded-sm text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 disabled:opacity-20 transition-all duration-200"
                                title="Redo (Ctrl+Y)"
                            >
                                <Redo2 className="w-3.5 h-3.5" />
                            </button>
                            {projectId && (
                                <button
                                    onClick={() => setShowVersionHistory(true)}
                                    className="p-1.5 rounded-sm text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all duration-200"
                                    title="Version History"
                                >
                                    <History className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <div className="w-px h-4 bg-zinc-800 mx-1" />
                        </div>
                    )}

                    {/* Context-sensitive action button */}
                    {activeMainTab === 'breakdown' && subTab === 'breakdown' && storyState.breakdown.length > 0 && (
                        <button
                            onClick={() => handleTabNavigation('script')}
                            disabled={isProcessing}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-sm font-sans text-[12px] font-medium bg-white text-black hover:bg-zinc-200 disabled:opacity-40 transition-all duration-200"
                        >
                            {isProcessing ? t('studio.generating') : t('story.createScript')}
                        </button>
                    )}
                    {activeMainTab === 'breakdown' && subTab === 'script' && (
                        <div className="flex items-center gap-2">
                            {onExportScript && (
                                <button
                                    onClick={onExportScript}
                                    className="p-1.5 rounded-sm text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all duration-200"
                                    title="Export"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <button
                                onClick={handleProceed}
                                className="flex items-center gap-2 px-4 py-1.5 rounded-sm font-sans text-[12px] font-medium bg-white text-black hover:bg-zinc-200 transition-all duration-200"
                            >
                                {!storyState.isLocked && <Lock className="w-3 h-3" />}
                                {storyState.isLocked ? t('story.continueToCast') : t('story.lockScript')}
                            </button>
                        </div>
                    )}
                    {activeMainTab === 'breakdown' && subTab === 'characters' && (
                        <button
                            onClick={onNextStep}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-sm font-sans text-[12px] font-medium bg-white text-black hover:bg-zinc-200 transition-all duration-200"
                        >
                            {t('story.createShotList')}
                        </button>
                    )}
                    {activeMainTab === 'storyboard' && subTab === 'shots' && (
                        <button
                            onClick={() => setSubTab('style')}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-sm font-sans text-[12px] font-medium bg-white text-black hover:bg-zinc-200 transition-all duration-200"
                        >
                            {t('story.selectStyle')}
                        </button>
                    )}
                    {activeMainTab === 'storyboard' && subTab === 'style' && (
                        <button
                            onClick={onNextStep}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-sm font-sans text-[12px] font-medium bg-white text-black hover:bg-zinc-200 transition-all duration-200"
                        >
                            {t('story.generateStoryboard')}
                        </button>
                    )}
                    {activeMainTab === 'storyboard' && subTab === 'storyboard' && storyState.scenesWithVisuals?.length && (
                        <button
                            onClick={() => setSubTab('narration')}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-sm font-sans text-[12px] font-medium bg-white text-black hover:bg-zinc-200 transition-all duration-200"
                        >
                            <Mic className="w-3 h-3" />
                            {t('story.addNarration')}
                        </button>
                    )}
                    {activeMainTab === 'storyboard' && subTab === 'narration' && storyState.narrationSegments?.length && (
                        <button
                            onClick={() => setSubTab('animation')}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-sm font-sans text-[12px] font-medium bg-white text-black hover:bg-zinc-200 transition-all duration-200"
                        >
                            <Video className="w-3 h-3" />
                            {t('story.animateShots')}
                        </button>
                    )}
                    {activeMainTab === 'storyboard' && subTab === 'animation' && (
                        <button
                            onClick={() => setSubTab('export')}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-sm font-sans text-[12px] font-medium bg-white text-black hover:bg-zinc-200 transition-all duration-200"
                        >
                            <Film className="w-3 h-3" />
                            {t('story.export')}
                        </button>
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            {isProcessing && (
                <div className="h-0.5 w-full overflow-hidden relative z-10 bg-zinc-900">
                    <motion.div
                        className="h-full bg-blue-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress.percent}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
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
                        transition={{ duration: 0.15 }}
                        className="relative z-10 mx-6 mt-4 p-4 rounded-sm bg-red-500/10 border border-red-500/30 flex items-start gap-3"
                    >
                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm text-zinc-100 font-medium">{t('common.somethingWentWrong')}</p>
                            <p className="text-xs text-zinc-500 mt-1">{error}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {onRetry && (
                                <button
                                    onClick={onRetry}
                                    className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-sm transition-colors duration-200 flex items-center gap-1.5"
                                >
                                    <RefreshCcw className="w-3 h-3" />
                                    {t('common.retry')}
                                </button>
                            )}
                            {onClearError && (
                                <button onClick={onClearError} className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors duration-200">
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

            {/* Stage Progress Helper */}
            {stageProgress && activeMainTab === 'storyboard' && !isProcessing && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed bottom-6 right-6 z-50"
                >
                    <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
                        <div className="flex items-center gap-4 font-mono text-xs">
                            <span className="text-zinc-500">
                                SCENES: <span className="text-zinc-300">{stageProgress.totalScenes}</span>
                            </span>
                            <span className="w-px h-4 bg-zinc-800" />
                            <div className="flex items-center gap-2">
                                <span className={stageProgress.shotsComplete ? "text-emerald-400" : "text-blue-400"}>
                                    SHOTS: {stageProgress.scenesWithShots}/{stageProgress.totalScenes}
                                </span>
                                {stageProgress.shotsComplete
                                    ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    : <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                                }
                            </div>
                            <span className="w-px h-4 bg-zinc-800" />
                            <div className="flex items-center gap-2">
                                <span className={stageProgress.visualsComplete ? "text-emerald-400" : "text-orange-400"}>
                                    VISUALS: {stageProgress.scenesWithVisuals}/{stageProgress.totalScenes}
                                </span>
                                {stageProgress.visualsComplete
                                    ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    : <Circle className="w-3 h-3 text-orange-400" />
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

            {/* Version History Panel */}
            <AnimatePresence>
                {showVersionHistory && projectId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                        onClick={() => setShowVersionHistory(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.97, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.97, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="w-full max-w-xl h-[70vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <VersionHistoryPanel
                                projectId={projectId}
                                currentState={storyState}
                                onRestore={(state) => {
                                    onImportProject?.(state);
                                    setShowVersionHistory(false);
                                }}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Checkpoint Approval Overlay */}
            <AnimatePresence>
                {formatPipelineHook?.activeCheckpoint && (() => {
                    const cp = formatPipelineHook.activeCheckpoint;
                    const d = cp.data ?? {};
                    const phase = cp.phase;

                    // Build preview content from checkpoint data
                    let previewContent: React.ReactNode = null;
                    const scenes = d.scenes as { heading: string; action: string }[] | undefined;
                    const visuals = d.visuals as { sceneId: string; imageUrl: string }[] | undefined;

                    if (scenes && scenes.length > 0) {
                        previewContent = (
                            <div className="space-y-2">
                                {d.sceneCount ? <p className="text-xs text-zinc-500 mb-2">{String(d.sceneCount)} scenes {d.estimatedDuration ? `· ${d.estimatedDuration}` : ''}</p> : null}
                                {scenes.map((s, i) => (
                                    <div key={i} className="flex gap-3 items-start">
                                        <span className="font-mono text-[10px] text-blue-400 shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                                        <div className="min-w-0">
                                            <p className="text-sm text-zinc-200 font-medium">{s.heading}</p>
                                            <p className="text-xs text-zinc-500 line-clamp-2" dir="auto">{s.action}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    }

                    if (visuals && visuals.length > 0) {
                        previewContent = (
                            <div>
                                {d.visualCount != null && <p className="text-xs text-zinc-500 mb-2">{d.visualCount as number}/{d.totalScenes as number ?? '?'} visuals generated</p>}
                                <div className="grid grid-cols-3 gap-2">
                                    {visuals.map((v, i) => (
                                        <div key={i} className="aspect-video bg-zinc-950 rounded-sm overflow-hidden border border-zinc-800">
                                            <img src={v.imageUrl} alt={`Scene ${i + 1}`} className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    }

                    if (phase.includes('final') || phase.includes('assembly')) {
                        const stats = [
                            d.sceneCount != null && `${d.sceneCount} scenes`,
                            d.visualCount != null && `${d.visualCount} visuals`,
                            d.narrationCount != null && `${d.narrationCount} narrations`,
                            d.totalDuration != null && `${Math.round(d.totalDuration as number)}s total`,
                        ].filter(Boolean);
                        if (stats.length > 0 && !scenes && !visuals) {
                            previewContent = (
                                <div className="flex flex-wrap gap-3">
                                    {stats.map((s, i) => (
                                        <span key={i} className="px-2.5 py-1 bg-zinc-800 rounded-sm text-xs font-mono text-zinc-300">{s}</span>
                                    ))}
                                </div>
                            );
                        }
                    }

                    if (d.sourceCount != null && !scenes && !visuals) {
                        previewContent = (
                            <div className="space-y-1">
                                <p className="text-sm text-zinc-300">{d.sourceCount as number} sources found</p>
                                {d.confidence != null && <p className="text-xs text-zinc-500">Confidence: {Math.round((d.confidence as number) * 100)}%</p>}
                            </div>
                        );
                    }

                    return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                        >
                            <motion.div
                                initial={{ scale: 0.97, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.97, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className={`w-full ${visuals && visuals.length > 0 ? 'max-w-3xl' : 'max-w-2xl'} max-h-[80vh] overflow-y-auto`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="bg-zinc-900 border border-zinc-700 rounded-sm p-6">
                                    <CheckpointApproval
                                        checkpointId={cp.checkpointId}
                                        phase={cp.phase}
                                        title={`Review: ${cp.phase.replace(/-/g, ' ')}`}
                                        description={previewContent ? undefined : "Review the generated content before the pipeline continues to the next phase."}
                                        previewData={previewContent}
                                        onApprove={() => formatPipelineHook.approveCheckpoint()}
                                        onRequestChanges={(_id, changeRequest) => formatPipelineHook.rejectCheckpoint(changeRequest)}
                                    />
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>
        </div>
    );
};

export default StoryWorkspace;
