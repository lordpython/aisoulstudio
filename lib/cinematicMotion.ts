/**
 * Motion Library — "Precision Protocol"
 * Fast, snappy Framer Motion variants.
 * duration-200 ease-out — no slow, dramatic fades.
 */

import type { Variants, Transition } from "framer-motion";

// ==========================================
// CORE EASING CURVES
// ==========================================

export const cinematicEasing = {
  /** Default snappy ease-out */
  cinematic: [0.0, 0.0, 0.2, 1] as const,
  /** Quick deceleration */
  dramatic: [0.0, 0.0, 0.2, 1] as const,
  /** Sharp curtain */
  curtain: [0.4, 0, 0.2, 1] as const,
  /** Smooth utility */
  smooth: [0.4, 0, 0.2, 1] as const,
};

// ==========================================
// PAGE & SECTION TRANSITIONS
// ==========================================

/** Quick fade-in */
export const fadeFromBlack: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.2, ease: cinematicEasing.cinematic },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15 },
  },
};

/** Curtain rise — fast vertical reveal */
export const curtainRise: Variants = {
  initial: { y: 24, opacity: 0 },
  animate: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.2, ease: cinematicEasing.curtain },
  },
  exit: {
    y: -12,
    opacity: 0,
    transition: { duration: 0.15 },
  },
};

/** Spotlight reveal — fast scale */
export const spotlightReveal: Variants = {
  initial: { scale: 0.98, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: { duration: 0.2, ease: cinematicEasing.dramatic },
  },
  exit: {
    scale: 1.01,
    opacity: 0,
    transition: { duration: 0.15 },
  },
};

/** Step transition — horizontal slide */
export const stepTransition: Variants = {
  initial: { opacity: 0, x: 32 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: cinematicEasing.cinematic },
  },
  exit: {
    opacity: 0,
    x: -32,
    transition: { duration: 0.15 },
  },
};

// ==========================================
// LIST & GRID ANIMATIONS
// ==========================================

/** Stagger container */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1,
    },
  },
};

/** Stagger item */
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: cinematicEasing.dramatic },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.1 },
  },
};

/** Card flip animation */
export const cardFlip: Variants = {
  initial: { rotateY: -90, opacity: 0, transformPerspective: 1200 },
  animate: {
    rotateY: 0,
    opacity: 1,
    transition: { duration: 0.25, ease: cinematicEasing.dramatic },
  },
  exit: {
    rotateY: 90,
    opacity: 0,
    transition: { duration: 0.15 },
  },
};

// ==========================================
// ROUTE & PAGE TRANSITIONS
// ==========================================

/** Route transition */
export const routeTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: cinematicEasing.cinematic },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.15 },
  },
};

// ==========================================
// INTERACTIVE ELEMENTS
// ==========================================

export const cardHover = {
  whileHover: {
    scale: 1.01,
    y: -2,
    transition: { duration: 0.15, ease: cinematicEasing.smooth },
  },
  whileTap: { scale: 0.99, transition: { duration: 0.05 } },
};

export const cardLift = {
  whileHover: {
    y: -3,
    transition: { duration: 0.15, ease: cinematicEasing.smooth },
  },
  whileTap: { scale: 0.99, transition: { duration: 0.05 } },
};

export const buttonPress = {
  whileHover: { scale: 1.01, transition: { duration: 0.1 } },
  whileTap: { scale: 0.98, transition: { duration: 0.05 } },
};

export const glowHover = {
  whileHover: {
    boxShadow: "0 0 16px rgba(59,130,246,0.3)",
    transition: { duration: 0.15 },
  },
};

// ==========================================
// LOADING ANIMATIONS
// ==========================================

export const filmReelSpin: Variants = {
  animate: {
    rotate: 360,
    transition: { duration: 1.5, repeat: Infinity, ease: "linear" },
  },
};

export const dualReelSpin = {
  left: {
    animate: {
      rotate: 360,
      transition: { duration: 2, repeat: Infinity, ease: "linear" },
    },
  },
  right: {
    animate: {
      rotate: -360,
      transition: { duration: 1.5, repeat: Infinity, ease: "linear" },
    },
  },
};

export const progressStage: Variants = {
  pending: { opacity: 0.4, x: -4 },
  active: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.15, ease: cinematicEasing.dramatic },
  },
  complete: { opacity: 1, x: 0, scale: 1 },
};

export const shimmerEffect: Variants = {
  animate: {
    x: ["0%", "100%"],
    transition: { duration: 1.2, repeat: Infinity, ease: "linear" },
  },
};

export const pulseGlow: Variants = {
  animate: {
    opacity: [0.6, 1, 0.6],
    transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
  },
};

// ==========================================
// MODAL & OVERLAY ANIMATIONS
// ==========================================

export const backdropFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

export const modalScale: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 4 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.2, ease: cinematicEasing.dramatic },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 4,
    transition: { duration: 0.15 },
  },
};

// ==========================================
// TIMELINE ANIMATIONS
// ==========================================

export const thumbnailSelect: Variants = {
  selected: {
    scale: 1.03,
    boxShadow: "0 0 12px rgba(59,130,246,0.4)",
    transition: { duration: 0.15 },
  },
  unselected: {
    scale: 1,
    boxShadow: "none",
    transition: { duration: 0.1 },
  },
};

export const playhead: Variants = {
  animate: {
    scaleY: [1, 1.1, 1],
    transition: { duration: 0.4, repeat: Infinity, ease: "easeInOut" },
  },
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

export const getStaggerDelay = (index: number, baseDelay = 0.04): Transition => ({
  delay: index * baseDelay,
  duration: 0.2,
  ease: cinematicEasing.dramatic,
});

export const cinematicWipe = (progress: number): Variants => ({
  animate: {
    scaleX: progress / 100,
    transition: { duration: 0.15, ease: cinematicEasing.cinematic },
  },
});

export const reducedMotion: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.01 } },
  exit: { opacity: 0, transition: { duration: 0.01 } },
};
