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
    <div className="w-full bg-gradient-to-b from-[var(--cinema-celluloid)]/30 to-transparent border-b border-[var(--cinema-silver)]/5">
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Progress Steps */}
        <div className="relative flex items-center justify-between">
          {/* Background Progress Track - Modern elevated design */}
          <div 
            className="absolute top-[22px] left-0 right-0 h-1 rounded-full overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%)',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
            }}
          />

          {/* Active Progress Line - Gold cinematic style */}
          <motion.div
            className="absolute top-[22px] left-0 h-1 rounded-full overflow-hidden"
            initial={false}
            animate={{
              width: `${(currentIndex / Math.max(tabs.length - 1, 1)) * 100}%`,
            }}
            transition={{ 
              duration: 0.8, 
              ease: [0.34, 1.56, 0.64, 1] // Bouncy cinematic easing
            }}
          >
            <div 
              className="absolute inset-0 rounded-full"
              style={{
                background: 'linear-gradient(90deg, #D4AF37 0%, #F4D03F 50%, #D4AF37 100%)',
                boxShadow: '0 0 20px rgba(212, 175, 55, 0.6), 0 0 40px rgba(212, 175, 55, 0.3)',
              }}
            />
            {/* Shimmer animation */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
              }}
              animate={{
                x: ['-100%', '200%'],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          </motion.div>

          {tabs.map((tab, index) => {
            const status = getStepStatus(tab.id);
            const isActive = tab.id === currentTabId;
            const isCompleted = status === 'completed';
            const isProcessingStep = status === 'processing';
            const isPending = status === 'pending';
            const isAccessible = index <= currentIndex || isCompleted;

            return (
              <div key={tab.id} className="relative flex flex-col items-center z-10">
                {/* Step Indicator - Enhanced modern design */}
                <motion.button
                  onClick={() => isAccessible && onTabClick(tab.id)}
                  disabled={!isAccessible}
                  className={`
                    relative rounded-full flex items-center justify-center font-mono font-bold
                    transition-all duration-300
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cinema-void)]
                    ${
                      isActive
                        ? 'w-14 h-14 text-[var(--cinema-void)] shadow-2xl'
                        : isCompleted
                          ? 'w-12 h-12 text-emerald-400'
                          : 'w-11 h-11 text-[var(--cinema-silver)]/60'
                    }
                    ${isAccessible && !isActive ? 'hover:scale-110 cursor-pointer' : ''}
                    ${!isAccessible ? 'cursor-not-allowed opacity-40' : ''}
                  `}
                  style={{
                    background: isActive
                      ? 'radial-gradient(circle, #F4D03F 0%, #D4AF37 100%)'
                      : isCompleted
                        ? 'radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)'
                        : 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
                    border: isActive
                      ? '3px solid rgba(244, 208, 63, 0.5)'
                      : isCompleted
                        ? '2px solid rgba(16, 185, 129, 0.5)'
                        : '2px solid rgba(255,255,255,0.15)',
                    boxShadow: isActive
                      ? '0 0 30px rgba(212, 175, 55, 0.5), 0 0 60px rgba(212, 175, 55, 0.2), 0 4px 12px rgba(0,0,0,0.3)'
                      : isCompleted
                        ? '0 0 20px rgba(16, 185, 129, 0.3), 0 2px 8px rgba(0,0,0,0.2)'
                        : '0 2px 8px rgba(0,0,0,0.2)',
                  }}
                  whileHover={isAccessible && !isActive ? { scale: 1.15 } : {}}
                  whileTap={isAccessible ? { scale: 0.9 } : {}}
                  animate={isActive ? { 
                    scale: [1, 1.05, 1],
                  } : {}}
                  transition={{
                    scale: {
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                  }}
                >
                  <AnimatePresence mode="wait">
                    {isProcessingStep ? (
                      <motion.div
                        key="processing"
                        initial={{ opacity: 0, rotate: -180 }}
                        animate={{ opacity: 1, rotate: 0 }}
                        exit={{ opacity: 0, rotate: 180 }}
                      >
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </motion.div>
                    ) : isCompleted ? (
                      <motion.div
                        key="completed"
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      >
                        <Check className="w-6 h-6 stroke-[3]" />
                      </motion.div>
                    ) : (
                      <motion.span
                        key="number"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={isActive ? 'text-lg' : 'text-base'}
                      >
                        {index + 1}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {/* Multiple pulse rings for active step */}
                  {isActive && (
                    <>
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{
                          border: '2px solid rgba(244, 208, 63, 0.6)',
                        }}
                        animate={{
                          scale: [1, 1.4, 1.4],
                          opacity: [0.6, 0, 0],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: 'easeOut',
                        }}
                      />
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{
                          border: '2px solid rgba(244, 208, 63, 0.4)',
                        }}
                        animate={{
                          scale: [1, 1.6, 1.6],
                          opacity: [0.4, 0, 0],
                        }}
                        transition={{
                          duration: 2,
                          delay: 0.3,
                          repeat: Infinity,
                          ease: 'easeOut',
                        }}
                      />
                    </>
                  )}
                </motion.button>

                {/* Step Label - Enhanced typography */}
                <motion.span
                  className={`
                    mt-4 text-sm font-editorial font-medium tracking-wide whitespace-nowrap
                    transition-all duration-300
                    ${
                      isActive
                        ? 'text-[#F4D03F]'
                        : isCompleted
                          ? 'text-emerald-400'
                          : 'text-[var(--cinema-silver)]/60'
                    }
                  `}
                  style={{
                    textShadow: isActive 
                      ? '0 0 20px rgba(244, 208, 63, 0.5)' 
                      : isCompleted
                        ? '0 0 10px rgba(16, 185, 129, 0.3)'
                        : 'none',
                  }}
                  animate={{ 
                    y: isActive ? -3 : 0,
                    scale: isActive ? 1.05 : 1,
                  }}
                >
                  {tab.label}
                </motion.span>
              </div>
            );
          })}
        </div>

        {/* Phase Transition Indicator - Enhanced */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 pt-4 border-t border-[var(--cinema-silver)]/10"
            >
              <div className="flex items-center justify-center gap-4">
                <Loader2 className="w-5 h-5 text-[#F4D03F] animate-spin" />
                <span className="text-sm text-[var(--cinema-silver)]/80 font-script italic">
                  {progress.message || 'Processing...'}
                </span>
                <div 
                  className="w-40 h-2 rounded-full overflow-hidden"
                  style={{
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
                  }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, #D4AF37 0%, #F4D03F 50%, #D4AF37 100%)',
                      boxShadow: '0 0 10px rgba(212, 175, 55, 0.5)',
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.percent}%` }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span className="text-xs text-[var(--cinema-silver)]/70 font-mono font-bold min-w-[3rem] text-right">
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
