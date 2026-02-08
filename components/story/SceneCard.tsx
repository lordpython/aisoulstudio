import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCcw } from 'lucide-react';
import { staggerItem } from '@/lib/cinematicMotion';
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
    <motion.div
      variants={staggerItem}
      className={cn('surface-card p-6', className)}
    >
      {/* Scene header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <span className="text-caption-mono text-[var(--cinema-spotlight)]">
            SCENE {String(sceneNumber).padStart(2, '0')}
          </span>
          <div className="w-8 h-px bg-[var(--cinema-velvet)]" />
        </div>
        {onRegenerate && (
          <button
            onClick={handleRegenerate}
            className="p-2 text-[var(--cinema-silver)]/30 hover:text-[var(--cinema-spotlight)] rounded-lg transition-colors duration-200"
            disabled={isProcessing}
            aria-label={`Regenerate scene ${sceneNumber}`}
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Scene heading */}
      <h3 className="heading-card mb-3" dir="auto">
        {heading}
      </h3>

      {/* Scene content with markdown rendering */}
      <MarkdownContent content={content} className="text-[var(--cinema-silver)]/70" />

      {/* Slot for additional content (shots, audio, etc.) */}
      {children && <div className="mt-4 pt-4 border-t border-white/[0.06]">{children}</div>}
    </motion.div>
  );
}

export default SceneCard;
