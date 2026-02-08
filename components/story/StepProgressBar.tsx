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
    <div className="w-full bg-gradient-to-b from-[var(--cinema-celluloid)] to-[var(--cinema-void)] border-b border-[var(--cinema-silver)]/5">
      <div className="max-w-5xl mx-auto px-8 py-6">
        {/* Progress Steps */}
        <div className="relative flex items-center justify-between">
          {/* Background Progress Line */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-[var(--cinema-silver)]/10" />

          {/* Active Progress Line */}
          <motion.div
            className="absolute top-5 left-0 h-0.5 bg-gradient-to-r from-[var(--cinema-spotlight)] via-[var(--cinema-editorial)] to-emerald-500"
            initial={false}
            animate={{
              width: `${(currentIndex / Math.max(tabs.length - 1, 1)) * 100}%`,
            }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 12px var(--glow-spotlight)' }}
          />

          {tabs.map((tab, index) => {
            const status = getStepStatus(tab.id);
            const isActive = tab.id === currentTabId;
            const isCompleted = status === 'completed';
            const isProcessingStep = status === 'processing';
            const isPending = status === 'pending';
            const isAccessible = index <= currentIndex || isCompleted;

            return (
              <div key={tab.id} className="relative flex flex-col items-center z-10">
                {/* Step Indicator */}
                <motion.button
                  onClick={() => isAccessible && onTabClick(tab.id)}
                  disabled={!isAccessible}
                  className={`
                    relative w-10 h-10 rounded-full flex items-center justify-center
                    transition-all duration-300 border-2
                    ${
                      isActive
                        ? 'bg-[var(--cinema-spotlight)] border-[var(--cinema-spotlight)] text-[var(--cinema-void)] scale-110'
                        : isCompleted
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                          : isPending
                            ? 'bg-[var(--cinema-void)] border-[var(--cinema-silver)]/30 text-[var(--cinema-silver)]/70'
                            : 'bg-[var(--cinema-celluloid)] border-[var(--cinema-silver)]/40 text-[var(--cinema-silver)]/70'
                    }
                    ${isAccessible && !isActive ? 'hover:border-[var(--cinema-spotlight)]/50 hover:scale-105 cursor-pointer' : ''}
                    ${!isAccessible ? 'cursor-not-allowed' : ''}
                  `}
                  whileHover={isAccessible && !isActive ? { scale: 1.08 } : {}}
                  whileTap={isAccessible ? { scale: 0.95 } : {}}
                >
                  <AnimatePresence mode="wait">
                    {isProcessingStep ? (
                      <motion.div
                        key="processing"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                      >
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </motion.div>
                    ) : isCompleted ? (
                      <motion.div
                        key="completed"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                      >
                        <Check className="w-5 h-5" />
                      </motion.div>
                    ) : (
                      <motion.span
                        key="number"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        className="font-mono text-sm font-bold"
                      >
                        {index + 1}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {/* Pulse ring for active step */}
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-[var(--cinema-spotlight)]"
                      initial={{ scale: 1, opacity: 0.5 }}
                      animate={{ scale: 1.5, opacity: 0 }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  )}
                </motion.button>

                {/* Step Label */}
                <motion.span
                  className={`
                    mt-3 text-xs font-medium tracking-wide whitespace-nowrap
                    transition-all duration-300
                    ${
                      isActive
                        ? 'text-[var(--cinema-spotlight)]'
                        : isCompleted
                          ? 'text-emerald-400'
                          : 'text-[var(--cinema-silver)]'
                    }
                  `}
                  animate={{ y: isActive ? -2 : 0 }}
                >
                  {tab.label}
                </motion.span>

                {/* Status Badge */}
                <AnimatePresence>
                  {isCompleted && !isActive && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center"
                    >
                      <Check className="w-2.5 h-2.5 text-white" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Phase Transition Indicator */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 pt-4 border-t border-[var(--cinema-silver)]/5"
            >
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="w-4 h-4 text-[var(--cinema-spotlight)] animate-spin" />
                <span className="text-sm text-[var(--cinema-silver)]/80 font-script italic">
                  {progress.message || 'Processing...'}
                </span>
                <div className="w-32 h-1.5 bg-[var(--cinema-silver)]/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[var(--cinema-spotlight)] to-[var(--cinema-editorial)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.percent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="text-xs text-[var(--cinema-silver)]/70 font-mono">
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
