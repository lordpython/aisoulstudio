import { useRef, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface IntroAnimationProps {
  onComplete: () => void;
}

export const IntroAnimation: React.FC<IntroAnimationProps> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      onComplete();
      return;
    }

    const skipTimer = setTimeout(() => setShowSkipButton(true), 500);
    return () => clearTimeout(skipTimer);
  }, [onComplete]);

  const handleComplete = () => {
    setFading(true);
    setTimeout(onComplete, 400);
  };

  return (
    <AnimatePresence>
      {!fading && (
        <motion.div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <video
            ref={videoRef}
            src="/assets/grok-video-a3612b1a-ba58-4437-9515-779c1ee1fe9e.mp4"
            autoPlay
            muted
            playsInline
            onEnded={handleComplete}
            className="w-full h-full object-cover"
          />

          {showSkipButton && (
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={handleComplete}
              aria-label="Skip introduction animation"
              className="absolute top-6 right-6 px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-700/50 backdrop-blur-sm rounded-lg transition-all duration-200 border border-slate-700/50 hover:border-slate-600 z-10"
            >
              Skip
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
