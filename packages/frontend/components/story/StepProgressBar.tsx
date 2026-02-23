import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check } from 'lucide-react';

type StepStatus = 'completed' | 'active' | 'pending' | 'processing';

interface StepTab {
  id: string;
  label: string;
}

interface StepProgressBarProps {
  tabs: StepTab[];
  currentTabId: string;
  onTabClick: (tabId: string) => void;
  getStepStatus: (tabId: string) => StepStatus;
  isProcessing: boolean;
  progress: { message: string; percent: number };
}

export function StepProgressBar({
  tabs,
  currentTabId,
  onTabClick,
  getStepStatus,
  isProcessing,
  progress,
}: StepProgressBarProps) {
  const currentIndex = tabs.findIndex((t) => t.id === currentTabId);

  return (
    <div className="w-full bg-zinc-950 border-b border-zinc-800">
      <div className="max-w-5xl mx-auto px-6 py-5">
        {/* Step track */}
        <div className="relative flex items-center justify-between">
          {/* Background track line */}
          <div className="absolute top-[14px] left-0 right-0 h-px bg-zinc-800" />

          {/* Completed portion of track */}
          <motion.div
            className="absolute top-[14px] left-0 h-px bg-emerald-500"
            initial={false}
            animate={{
              width: `${(currentIndex / Math.max(tabs.length - 1, 1)) * 100}%`,
            }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          />

          {tabs.map((tab, index) => {
            const status = getStepStatus(tab.id);
            const isActive = tab.id === currentTabId;
            const isCompleted = status === 'completed';
            const isProcessingStep = status === 'processing';
            const isAccessible = index <= currentIndex || isCompleted;

            return (
              <div key={tab.id} className="relative flex flex-col items-center z-10">
                <button
                  onClick={() => isAccessible && onTabClick(tab.id)}
                  disabled={!isAccessible}
                  className={[
                    'relative w-7 h-7 rounded-sm flex items-center justify-center font-mono text-xs font-medium',
                    'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                    isActive
                      ? 'bg-blue-500 text-white border border-blue-500'
                      : isCompleted
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-zinc-900 text-zinc-600 border border-zinc-800',
                    isAccessible && !isActive ? 'cursor-pointer hover:border-zinc-600' : '',
                    !isAccessible ? 'cursor-not-allowed opacity-40' : '',
                  ].join(' ')}
                >
                  <AnimatePresence mode="wait">
                    {isProcessingStep ? (
                      <motion.div
                        key="processing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      </motion.div>
                    ) : isCompleted ? (
                      <motion.div
                        key="completed"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      </motion.div>
                    ) : (
                      <motion.span
                        key="number"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        {index + 1}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>

                <span
                  className={[
                    'mt-2 text-xs font-medium tracking-tight whitespace-nowrap transition-colors duration-200',
                    isActive
                      ? 'text-white'
                      : isCompleted
                        ? 'text-emerald-400'
                        : 'text-zinc-600',
                  ].join(' ')}
                >
                  {tab.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Processing indicator */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="mt-4 pt-3 border-t border-zinc-800"
            >
              <div className="flex items-center gap-3">
                <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
                <span className="font-mono text-xs text-zinc-500 truncate">
                  {progress.message || 'Processing...'}
                </span>
                <div className="flex-1 h-1 bg-zinc-900 rounded-sm overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.percent}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>
                <span className="font-mono text-xs text-zinc-500 min-w-[3rem] text-right shrink-0">
                  {progress.percent}%
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default StepProgressBar;
