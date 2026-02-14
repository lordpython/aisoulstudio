import React from 'react';
import { RefreshCcw } from 'lucide-react';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { cn } from '@/lib/utils';

interface SceneCardProps {
  sceneNumber: number;
  heading: string;
  content: string;
  onRegenerate?: (sceneNumber: number, feedback: string) => void;
  isProcessing?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function SceneCard({
  sceneNumber,
  heading,
  content,
  onRegenerate,
  isProcessing = false,
  children,
  className,
}: SceneCardProps) {
  const handleRegenerate = () => {
    const feedback = window.prompt(
      `How should we redo Scene ${sceneNumber}? (Optional)`,
      ''
    );
    if (feedback !== null) onRegenerate?.(sceneNumber, feedback);
  };

  return (
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
        {heading}
      </h3>

      {/* Scene content with markdown rendering */}
      <MarkdownContent content={content} className="text-zinc-400 text-sm" />

      {/* Slot for additional content (shots, audio, etc.) */}
      {children && <div className="mt-4 pt-4 border-t border-zinc-800">{children}</div>}
    </div>
  );
}

export default SceneCard;
