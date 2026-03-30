import React from 'react';
import { RefreshCcw } from 'lucide-react';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { cn } from '@/lib/utils';
import { BlurFade } from '@/components/motion-primitives/blur-fade';
import { TextEffect } from '@/components/motion-primitives/text-effect';

interface SceneCardProps {
  sceneNumber: number;
  heading: string;
  content: string;
  onRegenerate?: (sceneNumber: number, feedback: string) => void;
  isProcessing?: boolean;
  children?: React.ReactNode;
  className?: string;
  /** Stagger delay index for entrance animation */
  index?: number;
}

export const SceneCard = React.memo(function SceneCard({
  sceneNumber,
  heading,
  content,
  onRegenerate,
  isProcessing = false,
  children,
  className,
  index = 0,
}: SceneCardProps) {
  const handleRegenerate = () => {
    const feedback = window.prompt(
      `How should we redo Scene ${sceneNumber}? (Optional)`,
      ''
    );
    if (feedback !== null) onRegenerate?.(sceneNumber, feedback);
  };

  return (
    <BlurFade delay={index * 0.07} inView>
    <div className={cn('bg-zinc-900 border border-zinc-800 rounded-sm p-5', className)}>
      {/* Scene header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-blue-400">
            SCENE {String(sceneNumber).padStart(2, '0')}
          </span>
          <div className="w-6 h-px bg-zinc-700" />
        </div>
        {onRegenerate && (
          <button
            onClick={handleRegenerate}
            className="p-2 text-zinc-600 hover:text-blue-400 rounded-sm transition-colors duration-200 ease-out"
            disabled={isProcessing}
            aria-label={`Regenerate scene ${sceneNumber}`}
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Scene heading */}
      <h3 className="font-sans text-base font-medium text-zinc-100 tracking-tight mb-3" dir="auto">
        <TextEffect per="word" delay={index * 0.07 + 0.1}>{heading}</TextEffect>
      </h3>

      {/* Scene content with markdown rendering */}
      <MarkdownContent content={content} className="text-zinc-400 text-sm" />

      {/* Slot for additional content (shots, audio, etc.) */}
      {children && <div className="mt-4 pt-4 border-t border-zinc-800">{children}</div>}
    </div>
    </BlurFade>
  );
});

export default SceneCard;
