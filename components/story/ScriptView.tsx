import React from 'react';
import type { ScreenplayScene } from '@/types';

interface ScriptViewProps {
    script: { title: string; scenes: ScreenplayScene[] } | null;
    onUpdate?: (script: any) => void;
}

export const ScriptView: React.FC<ScriptViewProps> = ({ script, onUpdate }) => {
    if (!script) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
                <p>No script generated yet. Proceed to next step to create screenplay.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 p-6 max-w-3xl mx-auto font-mono text-zinc-200">
            <h1 className="text-3xl font-bold text-center mb-12 uppercase tracking-widest text-white border-b border-zinc-700 pb-4">
                {script.title}
            </h1>

            {script.scenes.map((scene) => (
                <div key={scene.id} className="flex flex-col gap-4">
                    <div className="font-bold text-white uppercase mt-8 border-l-4 border-blue-500 pl-4">
                        {scene.sceneNumber}. {scene.heading}
                    </div>

                    <div className="text-zinc-400 italic">
                        {scene.action}
                    </div>

                    <div className="flex flex-col gap-2 pl-8 pr-8">
                        {scene.dialogue.map((line, idx) => (
                            <div key={`${scene.id}-dialogue-${idx}`} className="flex flex-col items-center mb-4">
                                <div className="font-bold text-white uppercase text-sm mb-1">{line.speaker}</div>
                                <div className="text-center max-w-md">{line.text}</div>
                            </div>
                        ))}
                    </div>

                    <div className="text-xs text-zinc-600 uppercase tracking-tighter mt-4 flex gap-2">
                        Characters Present: {scene.charactersPresent.join(', ')}
                    </div>

                    <div className="h-px bg-zinc-800 w-full mt-4" />
                </div>
            ))}
        </div>
    );
};

export default ScriptView;
