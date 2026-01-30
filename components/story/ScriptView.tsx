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

    // Detect if content is RTL (Arabic, Hebrew, etc.)
    const isRTL = script.scenes.some(s =>
        /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
            s.heading + s.action + s.dialogue.map(d => d.text).join('')
        )
    );

    return (
        <div className="flex flex-col gap-8 p-6 max-w-3xl mx-auto text-zinc-200" dir={isRTL ? 'rtl' : 'ltr'}>
            <h1 className="text-3xl font-bold text-center mb-12 tracking-widest text-white border-b border-zinc-700 pb-4" dir="auto">
                {script.title}
            </h1>

            {script.scenes.map((scene) => (
                <div key={scene.id} className="flex flex-col gap-4">
                    <div className={`font-bold text-white mt-8 ${isRTL ? 'border-r-4 pr-4' : 'border-l-4 pl-4'} border-blue-500`} dir="ltr">
                        <span className="font-mono">{scene.sceneNumber}.</span>{' '}
                        <span dir="auto">{scene.heading}</span>
                    </div>

                    <div className="text-zinc-400 italic leading-relaxed" dir="auto">
                        {scene.action}
                    </div>

                    <div className="flex flex-col gap-2 px-8">
                        {scene.dialogue.map((line, idx) => (
                            <div key={`${scene.id}-dialogue-${idx}`} className="flex flex-col items-center mb-4">
                                <div className="font-bold text-white uppercase text-sm mb-1" dir="auto">{line.speaker}</div>
                                <div className="text-center max-w-md leading-relaxed" dir="auto">{line.text}</div>
                            </div>
                        ))}
                    </div>

                    {scene.charactersPresent.length > 0 && (
                        <div className="text-xs text-zinc-600 uppercase tracking-tighter mt-4 flex gap-2" dir="ltr">
                            Characters Present: {scene.charactersPresent.join(', ')}
                        </div>
                    )}

                    <div className="h-px bg-zinc-800 w-full mt-4" />
                </div>
            ))}
        </div>
    );
};

export default ScriptView;
