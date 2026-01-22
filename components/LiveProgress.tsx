/**
 * LiveProgress Component
 * 
 * Engaging progress display that shows AI work in real-time.
 * Features:
 * - Personality-driven status messages
 * - Live scene thumbnail previews with loading skeletons
 * - Smooth animations
 * - Mobile responsive design
 * - Accessible aria-live regions for screen readers
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Wand2,
  Image as ImageIcon,
  Volume2,
  Film,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Scene {
  id: string;
  name: string;
  status: "pending" | "working" | "done";
  thumbnail?: string;
  description?: string;
}

interface LiveProgressProps {
  stage: "planning" | "narrating" | "visualizing" | "composing" | "done";
  progress: number; // 0-100
  currentScene?: number;
  totalScenes?: number;
  scenes?: Scene[];
  currentDescription?: string;
  className?: string;
}

// Fun status messages for each stage
const STAGE_MESSAGES = {
  planning: [
    "Crafting your story...",
    "Weaving narrative threads...",
    "Imagining the perfect scenes...",
    "Building your vision...",
  ],
  narrating: [
    "Finding the perfect voice...",
    "Recording narration...",
    "Adding vocal magic...",
    "Bringing words to life...",
  ],
  visualizing: [
    "Painting your scenes...",
    "Generating visuals...",
    "Creating cinematic frames...",
    "Rendering your imagination...",
  ],
  composing: [
    "Mixing the final cut...",
    "Adding finishing touches...",
    "Polishing your masterpiece...",
    "Almost there...",
  ],
  done: [
    "Your video is ready!",
    "Masterpiece complete!",
    "Creation finished!",
  ],
};

const STAGE_LABELS = {
  planning: "Planning",
  narrating: "Narrating",
  visualizing: "Visualizing",
  composing: "Composing",
  done: "Complete",
};

const STAGE_ICONS = {
  planning: Wand2,
  narrating: Volume2,
  visualizing: ImageIcon,
  composing: Film,
  done: Check,
};

const STAGE_COLORS = {
  planning: "text-purple-400",
  narrating: "text-cyan-400",
  visualizing: "text-amber-400",
  composing: "text-green-400",
  done: "text-green-400",
};

export const LiveProgress: React.FC<LiveProgressProps> = ({
  stage,
  progress,
  currentScene = 0,
  totalScenes = 0,
  scenes = [],
  currentDescription,
  className,
}) => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [displayedDescription, setDisplayedDescription] = useState("");

  // Rotate through messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % STAGE_MESSAGES[stage].length);
    }, 3000);
    return () => clearInterval(interval);
  }, [stage]);

  // Typewriter effect for description
  useEffect(() => {
    if (!currentDescription) {
      setDisplayedDescription("");
      return;
    }

    let index = 0;
    setDisplayedDescription("");

    const interval = setInterval(() => {
      if (index < currentDescription.length) {
        setDisplayedDescription(currentDescription.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [currentDescription]);

  const StageIcon = STAGE_ICONS[stage];
  const stageColor = STAGE_COLORS[stage];

  // Generate skeleton scenes if none provided yet
  const displayScenes: Scene[] = scenes.length > 0
    ? scenes
    : totalScenes > 0
      ? Array.from({ length: totalScenes }, (_, i) => ({
        id: `skeleton-${i}`,
        name: `Scene ${i + 1}`,
        status: (i < currentScene ? "done" : i === currentScene ? "working" : "pending") as "pending" | "working" | "done",
        thumbnail: undefined,
        description: undefined,
      }))
      : [];

  // Generate accessible status description
  const getAccessibleStatus = () => {
    const stageLabel = STAGE_LABELS[stage];
    const progressText = `${Math.round(progress)}% complete`;
    const sceneText = totalScenes > 0 ? `, scene ${currentScene} of ${totalScenes}` : "";
    return `${stageLabel} stage: ${progressText}${sceneText}. ${STAGE_MESSAGES[stage][messageIndex]}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      role="status"
      aria-live="polite"
      aria-label={getAccessibleStatus()}
      className={cn(
        "w-full max-w-2xl mx-auto glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-8 overflow-hidden",
        className
      )}
    >
      {/* Stage Icon & Message */}
      <div className="text-center mb-6 sm:mb-8">
        <motion.div
          key={stage}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cn(
            "inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl mb-3 sm:mb-4",
            stage === "done" ? "bg-green-500/20" : "bg-primary/10"
          )}
        >
          {stage === "done" ? (
            <Check className="w-6 h-6 sm:w-8 sm:h-8 text-green-400" />
          ) : (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <StageIcon className={cn("w-6 h-6 sm:w-8 sm:h-8", stageColor)} />
            </motion.div>
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.h2
            key={messageIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-xl sm:text-2xl font-bold mb-2"
          >
            {STAGE_MESSAGES[stage][messageIndex]}
          </motion.h2>
        </AnimatePresence>

        {/* Current Description (typewriter) */}
        {displayedDescription && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm sm:text-base text-muted-foreground italic max-w-md mx-auto px-2"
          >
            "{displayedDescription}"
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="inline-block w-0.5 h-4 bg-primary ml-1 align-middle"
            />
          </motion.p>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-6 sm:mb-8">
        <div className="flex justify-between text-xs sm:text-sm mb-2">
          <span className="text-muted-foreground">
            {totalScenes > 0 ? `Scene ${currentScene} of ${totalScenes}` : "Processing..."}
          </span>
          <span className="font-mono text-primary">{Math.round(progress)}%</span>
        </div>

        <div
          className="h-1.5 sm:h-2 bg-muted/30 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progress: ${Math.round(progress)}%`}
        >
          <motion.div
            className="h-full bg-linear-to-r from-primary to-purple-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Scene Thumbnails with Skeletons */}
      {displayScenes.length > 0 && (
        <div
          className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-hide"
          role="list"
          aria-label="Scene progress"
        >
          {displayScenes.map((scene, index) => (
            <motion.div
              key={scene.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              role="listitem"
              aria-label={`Scene ${index + 1}: ${scene.status === "done" ? "completed" : scene.status === "working" ? "in progress" : "pending"}`}
              className={cn(
                "relative shrink-0 w-20 h-14 sm:w-24 sm:h-16 rounded-lg sm:rounded-xl overflow-hidden border-2 transition-all",
                scene.status === "done"
                  ? "border-green-500/50"
                  : scene.status === "working"
                    ? "border-primary animate-pulse"
                    : "border-border/30 opacity-50"
              )}
            >
              {scene.thumbnail ? (
                <img
                  src={scene.thumbnail}
                  alt={scene.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className={cn(
                  "w-full h-full flex items-center justify-center",
                  scene.status === "working" ? "bg-primary/10" : "bg-muted/30"
                )}>
                  {scene.status === "working" ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : scene.status === "done" ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{index + 1}</span>
                  )}
                </div>
              )}

              {/* Status Badge */}
              {scene.status === "done" && scene.thumbnail && (
                <div className="absolute top-1 right-1 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Stage Steps */}
      <nav
        className="flex justify-center gap-1.5 sm:gap-2 mt-4 sm:mt-6"
        aria-label="Production stages"
      >
        {(["planning", "narrating", "visualizing", "composing"] as const).map((s, index) => {
          const isActive = s === stage;
          const isPast = ["planning", "narrating", "visualizing", "composing"].indexOf(stage) > index;
          const Icon = STAGE_ICONS[s];

          return (
            <React.Fragment key={s}>
              <div
                className={cn(
                  "w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all",
                  isPast
                    ? "bg-green-500/20 text-green-400"
                    : isActive
                      ? "bg-primary/20 text-primary"
                      : "bg-muted/20 text-muted-foreground"
                )}
                aria-label={`${STAGE_LABELS[s]}: ${isPast ? "completed" : isActive ? "in progress" : "pending"}`}
                aria-current={isActive ? "step" : undefined}
              >
                {isPast ? (
                  <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                ) : (
                  <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
                )}
              </div>
              {index < 3 && (
                <div
                  className={cn(
                    "w-4 sm:w-8 h-0.5 self-center rounded-full transition-colors",
                    isPast ? "bg-green-500/50" : "bg-muted/30"
                  )}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Screen reader announcement for status changes */}
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {stage === "done" && "Video production complete!"}
      </div>
    </motion.div>
  );
};

export default LiveProgress;
