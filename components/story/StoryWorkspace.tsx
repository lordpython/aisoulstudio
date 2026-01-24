import React, { useState } from 'react';
import { IdeaView } from './IdeaView';
import { ScriptView } from './ScriptView';
import { CharacterView } from './CharacterView';
import { StoryboardView } from './StoryboardView';
import type { StoryState, StoryStep } from '@/types';

import { Download, RefreshCcw, Undo2, Redo2 } from 'lucide-react';

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
    progress
}) => {
    const [activeTab, setActiveTab] = useState<StoryStep>(storyState.currentStep);

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
        { id: 'storyboard', label: 'Storyboard', icon: '🖼️' },
    ];

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
                return (
                    <div className="p-6 flex flex-col gap-6">
                        <h2 className="text-xl font-bold text-white">Scene Breakdown</h2>
                        <div className="flex flex-col gap-4">
                            {storyState.breakdown.map((scene) => (
                                <div key={scene.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl group relative">
                                    <div className="flex justify-between items-start">
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
                                    <div className="text-white font-bold mb-2 uppercase">{scene.heading}</div>
                                    <div className="text-zinc-400 text-sm whitespace-pre-wrap">{scene.action}</div>
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
            case 'storyboard':
                return <StoryboardView shots={storyState.shotlist} />;
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
                        {tabs.map((tab) => {
                            const isCompleted = tabs.findIndex(t => t.id === storyState.currentStep) >= tabs.findIndex(t => t.id === tab.id);
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                      px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2
                      ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}
                      ${!isCompleted && !isActive ? 'opacity-40 cursor-not-allowed' : ''}
                    `}
                                    disabled={!isCompleted && !isActive}
                                >
                                    <span>{tab.icon}</span>
                                    {tab.label}
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
                            onClick={onNextStep}
                            disabled={isProcessing}
                            className="bg-white text-black px-6 py-2 rounded-lg font-bold hover:bg-zinc-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isProcessing ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    Proceed to {tabs[tabs.findIndex(t => t.id === storyState.currentStep) + 1]?.label || 'Production'}
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

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto">
                {renderActiveStep()}
            </div>
        </div>
    );
};

export default StoryWorkspace;
