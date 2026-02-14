import React from 'react';
import type { ScreenplayScene } from '@/types';
import { FileText, GripVertical } from 'lucide-react';

interface ScriptViewProps {
    script: { title: string; scenes: ScreenplayScene[] } | null;
    onUpdate?: (script: any) => void;
}

export const ScriptView: React.FC<ScriptViewProps> = ({ script, onUpdate }) => {
    if (!script) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] p-12">
                <FileText className="w-12 h-12 text-zinc-700 mb-4" />
                <p className="text-zinc-500 text-sm">
                    No script generated yet. Proceed to create your screenplay.
                </p>
            </div>
        );
    }

    // Detect if content is RTL (Arabic, Hebrew, etc.)
    const isRTL = script.scenes.some(s =>
        /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
            s.heading + s.action + s.dialogue.map(d => d.text).join('')
        )
    );

    return (
        <div className="py-8 px-4">
            {/* Screenplay Container */}
            <div
                className="max-w-3xl mx-auto bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden"
                dir={isRTL ? 'rtl' : 'ltr'}
            >
                {/* Title Page Header */}
                <div className="p-8 border-b border-zinc-800 text-center">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <div className="w-12 h-px bg-zinc-800" />
                        <span className="font-mono text-[10px] text-zinc-600 tracking-[0.3em]">
                            SCREENPLAY
                        </span>
                        <div className="w-12 h-px bg-zinc-800" />
                    </div>
                    <h1
                        className="font-sans text-3xl font-medium tracking-tight text-zinc-100"
                        dir="auto"
                    >
                        {script.title}
                    </h1>
                </div>

                {/* Screenplay Content */}
                <div className="p-8 space-y-8">
                    {script.scenes.map((scene, sceneIdx) => (
                        <div
                            key={scene.id}
                            className="group relative"
                            data-scene-id={scene.id}
                            data-scene-index={sceneIdx}
                        >
                            {/* Scene Heading */}
                            <div
                                className={`
                                    relative mb-4 py-2 flex items-start gap-2
                                    ${isRTL
                                        ? 'border-r-2 pr-4 border-blue-500'
                                        : 'border-l-2 pl-4 border-blue-500'
                                    }
                                `}
                            >
                                {/* Drag Handle */}
                                <div className="text-zinc-700 hover:text-zinc-400 cursor-grab active:cursor-grabbing transition-colors duration-200 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100">
                                    <GripVertical className="w-4 h-4" />
                                </div>

                                <div>
                                    <span className="font-mono text-xs text-blue-400 tracking-widest mb-1 block">
                                        SCENE {String(scene.sceneNumber).padStart(2, '0')}
                                    </span>
                                    <h2
                                        className="font-sans text-lg font-medium text-zinc-100 uppercase tracking-wide"
                                        dir="auto"
                                    >
                                        {scene.heading}
                                    </h2>
                                </div>
                            </div>

                            {/* Action / Description */}
                            <div
                                className="text-zinc-400 text-sm leading-relaxed mb-6 px-4"
                                dir="auto"
                            >
                                {scene.action}
                            </div>

                            {/* Dialogue Block */}
                            {scene.dialogue.length > 0 && (
                                <div className="space-y-6 my-6">
                                    {scene.dialogue.map((line, idx) => (
                                        <div
                                            key={`${scene.id}-dialogue-${idx}`}
                                            className="flex flex-col items-center"
                                        >
                                            <div
                                                className="font-mono text-xs text-blue-400 uppercase tracking-widest mb-2"
                                                dir="auto"
                                            >
                                                {line.speaker}
                                            </div>
                                            <div
                                                className="text-zinc-300 text-sm text-center max-w-md leading-relaxed"
                                                dir="auto"
                                            >
                                                &ldquo;{line.text}&rdquo;
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Characters Present Tags */}
                            {scene.charactersPresent.length > 0 && (
                                <div
                                    className="flex items-center gap-2 mt-6 px-4"
                                    dir="ltr"
                                >
                                    <span className="font-mono text-[10px] text-zinc-700 uppercase tracking-wider">
                                        Present:
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                        {scene.charactersPresent.map((char, i) => (
                                            <span
                                                key={i}
                                                className="bg-zinc-950 rounded-sm px-2 py-0.5 text-[10px] font-mono text-zinc-600 border border-zinc-800"
                                            >
                                                {char}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Scene Divider */}
                            {sceneIdx < script.scenes.length - 1 && (
                                <div className="mt-8 pt-8 border-t border-zinc-800" />
                            )}
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-zinc-800 text-center">
                    <span className="font-mono text-[10px] text-zinc-700 tracking-widest">
                        {script.scenes.length} SCENE{script.scenes.length !== 1 ? 'S' : ''}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ScriptView;
