import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Sparkles } from 'lucide-react';

interface IntroAnimationProps {
  onComplete: () => void;
  duration?: number;
}

export const IntroAnimation: React.FC<IntroAnimationProps> = ({ 
  onComplete, 
  duration = 2000 // Shortened from 4000ms for faster start
}) => {
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [particles] = useState(() => 
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: (i - 6) * 8,
      y: Math.sin(i * 0.5) * 20,
      z: Math.cos(i * 0.3) * 15,
      color: ['#3B82F6', '#8B5CF6', '#06B6D4', '#F59E0B'][i % 4],
      delay: i * 0.1
    }))
  );

  useEffect(() => {
    const subtitleTimer = setTimeout(() => setShowSubtitle(true), duration * 0.4);
    const skipButtonTimer = setTimeout(() => setShowSkipButton(true), 500);
    const completeTimer = setTimeout(onComplete, duration);

    return () => {
      clearTimeout(subtitleTimer);
      clearTimeout(skipButtonTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete, duration]);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-900/20 to-slate-900 flex items-center justify-center overflow-hidden">
      {/* Background particles */}
      <div className="absolute inset-0">
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className="absolute w-2 h-2 rounded-full"
            style={{
              backgroundColor: particle.color,
              boxShadow: `0 0 20px ${particle.color}`,
              left: `calc(50% + ${particle.x}px)`,
              top: `calc(50% + ${particle.y}px)`,
            }}
            initial={{ 
              opacity: 0, 
              scale: 0,
              y: particle.z 
            }}
            animate={{ 
              opacity: [0, 1, 1, 0],
              scale: [0, 1, 1, 0],
              y: [particle.z, particle.z - 20, particle.z + 20, particle.z],
            }}
            transition={{
              duration: duration / 1000,
              delay: particle.delay,
              ease: "easeInOut",
              repeat: Infinity,
              repeatType: "reverse"
            }}
          />
        ))}
      </div>

      {/* Skip Button */}
      <AnimatePresence>
        {showSkipButton && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={onComplete}
            aria-label="Skip introduction animation"
            className="absolute top-6 right-6 px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-700/50 backdrop-blur-sm rounded-lg transition-all duration-200 border border-slate-700/50 hover:border-slate-600"
          >
            Skip
          </motion.button>
        )}
      </AnimatePresence>

      {/* Main content container */}
      <div className="relative z-10 text-center">
        {/* Main logo */}
        <motion.div
          className="relative mb-6"
          initial={{ scale: 0, rotateZ: -180 }}
          animate={{ scale: 1, rotateZ: 360 }}
          transition={{
            scale: { duration: 1, ease: "backOut" },
            rotateZ: { duration: duration / 1000, ease: "linear" }
          }}
        >
          {/* Logo background glow */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-blue-500/30 via-purple-500/20 to-blue-500/30 blur-3xl rounded-full"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          
          {/* Main logo text */}
          <div className="relative flex items-center justify-center gap-3">
            <motion.div
              className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30"
              whileHover={{ scale: 1.05 }}
              animate={{
                boxShadow: [
                  "0 0 20px rgba(59, 130, 246, 0.3)",
                  "0 0 40px rgba(139, 92, 246, 0.5)",
                  "0 0 20px rgba(59, 130, 246, 0.3)"
                ]
              }}
              transition={{
                boxShadow: { duration: 2, repeat: Infinity }
              }}
            >
              <Music className="text-white w-6 h-6" />
            </motion.div>
            
            <motion.h1
              className="text-6xl md:text-8xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent tracking-tight"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              LyricLens
            </motion.h1>
          </div>
        </motion.div>

        {/* Subtitle */}
        <AnimatePresence>
          {showSubtitle && (
            <motion.div
              className="flex items-center justify-center gap-2"
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.8 }}
              transition={{ duration: 0.6, ease: "backOut" }}
            >
              <Sparkles className="text-orange-400 w-5 h-5" />
              <span className="text-2xl md:text-3xl font-semibold text-orange-400 tracking-wide">
                AI Video Studio
              </span>
              <Sparkles className="text-orange-400 w-5 h-5" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading indicator */}
        <motion.div
          className="mt-12 flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
        >
          <div className="flex space-x-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-blue-400 rounded-full"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.5, 1, 0.5]
                }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.2
                }}
              />
            ))}
          </div>
        </motion.div>
      </div>

      {/* Ambient light effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
    </div>
  );
};
