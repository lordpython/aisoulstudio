import React from 'react';
import { motion } from 'framer-motion';
import type { ScreenplayScene } from '@/types';
import { staggerContainer, staggerItem } from '@/lib/cinematicMotion';
import { FileText } from 'lucide-react';

interface ScriptViewProps {
    script: { title: string; scenes: ScreenplayScene[] } | null;
    onUpdate?: (script: any) => void;
}

export const ScriptView: React.FC<ScriptViewProps> = ({ script, onUpdate }) => {
    if (!script) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] p-12">
                <FileText className="w-12 h-12 text-[var(--cinema-silver)]/20 mb-4" />
                <p className="font-script italic text-[var(--cinema-silver)]/40 text-lg">
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
            {/* Screenplay Container - Paper-like */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="
                    max-w-3xl mx-auto
                    bg-[var(--cinema-celluloid)]/50
                    border border-[var(--cinema-silver)]/5
                    rounded-lg
                    shadow-editorial
                    overflow-hidden
                "
                dir={isRTL ? 'rtl' : 'ltr'}
            >
                {/* Title Page Header */}
                <div className="p-8 border-b border-[var(--cinema-silver)]/10 text-center">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <div className="w-12 h-px bg-[var(--cinema-spotlight)]/30" />
                        <span className="font-mono text-[10px] text-[var(--cinema-silver)]/40 tracking-[0.3em]">
                            SCREENPLAY
                        </span>
                        <div className="w-12 h-px bg-[var(--cinema-spotlight)]/30" />
                    </div>
                    <h1
                        className="font-display text-4xl text-[var(--cinema-silver)] tracking-tight"
                        dir="auto"
                    >
                        {script.title}
                    </h1>
                </div>

                {/* Screenplay Content */}
                <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="p-8 space-y-8"
                >
                    {script.scenes.map((scene, sceneIdx) => (
                        <motion.div
                            key={scene.id}
                            variants={staggerItem}
                            className="relative"
                        >
                            {/* Scene Heading - Industry Format */}
                            <div
                                className={`
                                    relative mb-4 py-2
                                    ${isRTL
                                        ? 'border-r-4 pr-4 border-[var(--cinema-velvet)]'
                                        : 'border-l-4 pl-4 border-[var(--cinema-velvet)]'
                                    }
                                `}
                            >
                                {/* Scene Number Badge */}
                                <span className="font-mono text-xs text-[var(--cinema-spotlight)] tracking-widest mb-1 block">
                                    SCENE {String(scene.sceneNumber).padStart(2, '0')}
                                </span>
                                {/* Heading - Slug Line */}
                                <h2
                                    className="font-display text-xl text-[var(--cinema-silver)] uppercase tracking-wide"
                                    dir="auto"
                                >
                                    {scene.heading}
                                </h2>
                            </div>

                            {/* Action / Description */}
                            <div
                                className="font-script text-[var(--cinema-silver)]/70 text-lg italic leading-relaxed mb-6 px-4"
                                dir="auto"
                            >
                                {scene.action}
                            </div>

                            {/* Dialogue Block - Centered Industry Format */}
                            {scene.dialogue.length > 0 && (
                                <div className="space-y-6 my-6">
                                    {scene.dialogue.map((line, idx) => (
                                        <div
                                            key={`${scene.id}-dialogue-${idx}`}
                                            className="flex flex-col items-center"
                                        >
                                            {/* Character Name */}
                                            <div
                                                className="font-sans text-sm text-[var(--cinema-spotlight)] uppercase tracking-[0.2em] mb-2"
                                                dir="auto"
                                            >
                                                {line.speaker}
                                            </div>
                                            {/* Dialogue Text */}
                                            <div
                                                className="font-script text-[var(--cinema-silver)] text-center max-w-md leading-relaxed text-lg"
                                                dir="auto"
                                            >
                                                "{line.text}"
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Characters Present Tag */}
                            {scene.charactersPresent.length > 0 && (
                                <div
                                    className="flex items-center gap-2 mt-6 px-4"
                                    dir="ltr"
                                >
                                    <span className="font-mono text-[10px] text-[var(--cinema-silver)]/30 uppercase tracking-wider">
                                        Present:
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                        {scene.charactersPresent.map((char, i) => (
                                            <span
                                                key={i}
                                                className="px-2 py-0.5 text-[10px] font-mono text-[var(--cinema-silver)]/50 bg-[var(--cinema-void)]/50 rounded"
                                            >
                                                {char}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Scene Divider */}
                            {sceneIdx < script.scenes.length - 1 && (
                                <div className="flex items-center justify-center gap-4 mt-8 pt-8 border-t border-[var(--cinema-silver)]/5">
                                    <div className="w-2 h-2 rounded-full bg-[var(--cinema-silver)]/10" />
                                </div>
                            )}
                        </motion.div>
                    ))}
                </motion.div>

                {/* Footer */}
                <div className="p-6 border-t border-[var(--cinema-silver)]/5 text-center">
                    <span className="font-mono text-[10px] text-[var(--cinema-silver)]/20 tracking-widest">
                        {script.scenes.length} SCENE{script.scenes.length !== 1 ? 'S' : ''}
                    </span>
                </div>
            </motion.div>
        </div>
    );
};

export default ScriptView;
