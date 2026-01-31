/**
 * Cinematic Motion Library
 * Framer Motion variants for the Story Mode UI redesign
 * Film noir vibes, dramatic lighting, theatrical presentation
 */

import type { Variants, Transition } from "framer-motion";

// ==========================================
// CORE EASING CURVES
// ==========================================

export const cinematicEasing = {
  cinematic: [0.22, 1, 0.36, 1] as const,
  dramatic: [0.16, 1, 0.3, 1] as const,
  curtain: [0.65, 0, 0.35, 1] as const,
  smooth: [0.4, 0, 0.2, 1] as const,
};

// ==========================================
// PAGE & SECTION TRANSITIONS
// ==========================================

/** Fade in from darkness - like a film reel starting */
export const fadeFromBlack: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.8, ease: cinematicEasing.cinematic },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.4 },
  },
};

/** Curtain rise effect - theatrical reveal */
export const curtainRise: Variants = {
  initial: { y: 60, opacity: 0 },
  animate: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.6, ease: cinematicEasing.curtain },
  },
  exit: {
    y: -30,
    opacity: 0,
    transition: { duration: 0.3 },
  },
};

/** Spotlight reveal - scale up with blur */
export const spotlightReveal: Variants = {
  initial: {
    scale: 0.95,
    opacity: 0,
    filter: "blur(10px)",
  },
  animate: {
    scale: 1,
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: cinematicEasing.dramatic },
  },
  exit: {
    scale: 1.02,
    opacity: 0,
    filter: "blur(4px)",
    transition: { duration: 0.3 },
  },
};

/** Step transition for workflow navigation */
export const stepTransition: Variants = {
  initial: {
    opacity: 0,
    x: 80,
    filter: "blur(4px)",
  },
  animate: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: cinematicEasing.cinematic },
  },
  exit: {
    opacity: 0,
    x: -80,
    filter: "blur(4px)",
    transition: { duration: 0.4 },
  },
};

// ==========================================
// LIST & GRID ANIMATIONS
// ==========================================

/** Stagger container for lists/grids */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.15,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
};

/** Stagger item - pairs with staggerContainer */
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: cinematicEasing.dramatic },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2 },
  },
};

/** Card flip animation for reveals */
export const cardFlip: Variants = {
  initial: {
    rotateY: -90,
    opacity: 0,
    transformPerspective: 1200,
  },
  animate: {
    rotateY: 0,
    opacity: 1,
    transition: { duration: 0.6, ease: cinematicEasing.dramatic },
  },
  exit: {
    rotateY: 90,
    opacity: 0,
    transition: { duration: 0.3 },
  },
};

// ==========================================
// INTERACTIVE ELEMENTS
// ==========================================

/** Scale on hover/tap for cards */
export const cardHover = {
  whileHover: {
    scale: 1.02,
    y: -4,
    transition: { duration: 0.3, ease: cinematicEasing.smooth },
  },
  whileTap: {
    scale: 0.98,
    transition: { duration: 0.1 },
  },
};

/** Button press animation */
export const buttonPress = {
  whileHover: {
    scale: 1.02,
    transition: { duration: 0.2 },
  },
  whileTap: {
    scale: 0.96,
    transition: { duration: 0.1 },
  },
};

/** Glow pulse on hover */
export const glowHover = {
  whileHover: {
    boxShadow: "0 0 30px oklch(0.75 0.15 80 / 0.5)",
    transition: { duration: 0.3 },
  },
};

// ==========================================
// LOADING ANIMATIONS
// ==========================================

/** Film reel spinner - continuous rotation */
export const filmReelSpin: Variants = {
  animate: {
    rotate: 360,
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "linear",
    },
  },
};

/** Dual film reels - for loading states */
export const dualReelSpin = {
  left: {
    animate: {
      rotate: 360,
      transition: { duration: 3, repeat: Infinity, ease: "linear" },
    },
  },
  right: {
    animate: {
      rotate: -360,
      transition: { duration: 2.5, repeat: Infinity, ease: "linear" },
    },
  },
};

/** Progress stage animation */
export const progressStage: Variants = {
  pending: {
    opacity: 0.4,
    x: -10,
  },
  active: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: cinematicEasing.dramatic },
  },
  complete: {
    opacity: 1,
    x: 0,
    scale: 1,
  },
};

/** Shimmer effect for skeleton loading */
export const shimmerEffect: Variants = {
  animate: {
    x: ["0%", "100%"],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "linear",
    },
  },
};

/** Pulse glow for processing states */
export const pulseGlow: Variants = {
  animate: {
    opacity: [0.5, 1, 0.5],
    scale: [1, 1.02, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// ==========================================
// MODAL & OVERLAY ANIMATIONS
// ==========================================

/** Backdrop fade */
export const backdropFade: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.3 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2 },
  },
};

/** Modal scale entrance */
export const modalScale: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: 10,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.3, ease: cinematicEasing.dramatic },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    transition: { duration: 0.2 },
  },
};

// ==========================================
// TIMELINE ANIMATIONS
// ==========================================

/** Timeline thumbnail selection */
export const thumbnailSelect: Variants = {
  selected: {
    scale: 1.05,
    boxShadow: "0 0 20px oklch(0.75 0.15 80 / 0.5)",
    transition: { duration: 0.3 },
  },
  unselected: {
    scale: 1,
    boxShadow: "none",
    transition: { duration: 0.2 },
  },
};

/** Playhead animation */
export const playhead: Variants = {
  animate: {
    scaleY: [1, 1.2, 1],
    transition: {
      duration: 0.5,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Creates a stagger delay based on index
 */
export const getStaggerDelay = (index: number, baseDelay = 0.1): Transition => ({
  delay: index * baseDelay,
  duration: 0.4,
  ease: cinematicEasing.dramatic,
});

/**
 * Creates cinematic wipe transition
 */
export const cinematicWipe = (progress: number): Variants => ({
  animate: {
    scaleX: progress / 100,
    transition: { duration: 0.3, ease: cinematicEasing.cinematic },
  },
});

/**
 * Reduced motion variants - respects user preferences
 */
export const reducedMotion: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.01 } },
  exit: { opacity: 0, transition: { duration: 0.01 } },
};
