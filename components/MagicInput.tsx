/**
 * MagicInput Component - 2026 Redesign
 * 
 * The "Invisible Interface" entry point.
 * Focuses on typography, negative space, and intent detection.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Upload,
  Youtube,
  ArrowRight,
  Music,
  Wand2,
  Loader2,
  X,
  Monitor,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MagicInputProps {
  onAudioFile: (file: File, aspectRatio: string) => void;
  onYoutubeUrl: (url: string, aspectRatio: string) => void;
  onTopicSubmit: (topic: string) => void;
  onLoadDemo?: () => void;
  disabled?: boolean;
  className?: string;
}

type DetectedIntent = "idle" | "audio" | "youtube" | "topic";

export const MagicInput: React.FC<MagicInputProps> = ({
  onAudioFile,
  onYoutubeUrl,
  onTopicSubmit,
  onLoadDemo,
  disabled = false,
  className,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [detectedIntent, setDetectedIntent] = useState<DetectedIntent>("idle");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAspectPicker, setShowAspectPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);

  // Auto-detect intent from input
  useEffect(() => {
    const value = inputValue.trim();
    
    if (!value) {
      setDetectedIntent("idle");
      return;
    }

    if (
      value.includes("youtube.com/watch") ||
      value.includes("youtu.be/") ||
      value.includes("youtube.com/shorts")
    ) {
      setDetectedIntent("youtube");
      return;
    }

    setDetectedIntent("topic");
  }, [inputValue]);

  // Handle file drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("audio/")) {
        setDetectedIntent("audio");
        setShowAspectPicker(true);
        pendingFileRef.current = file;
      }
    },
    [disabled]
  );

  // Handle file input
  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setDetectedIntent("audio");
        setShowAspectPicker(true);
        pendingFileRef.current = file;
      }
    },
    []
  );

  // Handle submit based on detected intent
  const handleSubmit = useCallback(() => {
    if (disabled || isProcessing) return;

    setIsProcessing(true);

    try {
      switch (detectedIntent) {
        case "audio":
          if (pendingFileRef.current) {
            onAudioFile(pendingFileRef.current, aspectRatio);
            pendingFileRef.current = null;
          }
          break;
        case "youtube":
          onYoutubeUrl(inputValue.trim(), aspectRatio);
          break;
        case "topic":
          onTopicSubmit(inputValue.trim());
          break;
      }
    } finally {
      setIsProcessing(false);
      setInputValue("");
      setDetectedIntent("idle");
      setShowAspectPicker(false);
    }
  }, [detectedIntent, inputValue, aspectRatio, onAudioFile, onYoutubeUrl, onTopicSubmit, disabled, isProcessing]);

  // Handle keyboard submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && detectedIntent !== "idle" && !showAspectPicker) {
      if (detectedIntent === "youtube" || detectedIntent === "audio") {
        setShowAspectPicker(true);
      } else {
        handleSubmit();
      }
    }
  };

  // Get intent-specific UI elements
  const getIntentConfig = () => {
    switch (detectedIntent) {
      case "youtube":
        return {
          icon: Youtube,
          color: "text-destructive",
          gradient: "from-destructive/20 to-orange-500/20",
          label: "Import from YouTube",
          placeholder: "Paste YouTube URL...",
        };
      case "topic":
        return {
          icon: Wand2,
          color: "text-primary",
          gradient: "from-primary/20 to-purple-500/20",
          label: "Generate AI Video",
          placeholder: "Describe your video idea...",
        };
      case "audio":
        return {
          icon: Music,
          color: "text-cyan-400",
          gradient: "from-cyan-500/20 to-blue-500/20",
          label: "Create Lyric Video",
          placeholder: "Audio file ready",
        };
      default:
        return {
          icon: Sparkles,
          color: "text-muted-foreground",
          gradient: "from-primary/10 to-transparent",
          label: "Create Video",
          placeholder: "Drop audio, paste link, or type idea...",
        };
    }
  };

  const config = getIntentConfig();
  const IconComponent = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className={cn("w-full max-w-4xl mx-auto px-4 relative", className)}
    >
      {/* Dynamic Background Glow */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-r blur-[100px] transition-colors duration-1000 opacity-30 pointer-events-none",
        config.gradient
      )} />

      {/* Hero Text */}
      <div className="text-center mb-16 relative z-10">
        <motion.h1 
          className="text-5xl md:text-7xl font-bold tracking-tighter mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <span className="text-foreground">Create</span>
          <span className="text-muted-foreground/30 mx-4 font-light italic">something</span>
          <span className="text-gradient-primary">Impossible.</span>
        </motion.h1>
        
        <motion.p 
          className="text-lg text-muted-foreground/60 max-w-xl mx-auto font-light tracking-wide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          The AI studio for music visualization and storytelling.
        </motion.p>
      </div>

      {/* The Magic Input Field */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "relative group transition-all duration-500 z-20",
          isDragging && "scale-[1.02]"
        )}
      >
        <div
          className={cn(
            "relative glass-panel rounded-3xl transition-all duration-300 overflow-hidden shadow-2xl shadow-black/20",
            isDragging ? "ring-2 ring-primary bg-primary/5" : "hover:ring-1 hover:ring-white/10"
          )}
        >
          <div className="flex items-center gap-6 p-2 pr-3">
            {/* Intent Icon */}
            <div className="pl-4">
               <IconComponent className={cn("w-6 h-6 transition-colors duration-300", config.color)} />
            </div>

            {/* Text Input */}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={config.placeholder}
              disabled={disabled || detectedIntent === "audio"}
              className="flex-1 bg-transparent border-none outline-none text-xl md:text-2xl text-foreground placeholder:text-muted-foreground/30 font-light h-16"
              autoFocus
            />

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-xl hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
                title="Upload audio"
              >
                <Upload className="w-5 h-5" />
              </button>
              
              <AnimatePresence mode="wait">
                {detectedIntent !== "idle" && !showAspectPicker && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                  >
                    <Button
                      onClick={() => {
                        if (detectedIntent === "youtube" || detectedIntent === "audio") {
                          setShowAspectPicker(true);
                        } else {
                          handleSubmit();
                        }
                      }}
                      disabled={disabled || isProcessing}
                      className={cn(
                        "h-12 px-6 rounded-xl font-medium text-lg shadow-lg transition-all hover:scale-105",
                        detectedIntent === "youtube" && "bg-destructive text-white hover:bg-destructive/90",
                        detectedIntent === "topic" && "bg-primary text-primary-foreground hover:bg-primary/90",
                        detectedIntent === "audio" && "bg-cyan-500 text-white hover:bg-cyan-600"
                      )}
                    >
                      {isProcessing ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <ArrowRight className="w-6 h-6" />
                      )}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileInput}
            className="hidden"
          />

          {/* Aspect Ratio Picker (Slide Down) */}
          <AnimatePresence>
            {showAspectPicker && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-white/5 bg-black/20"
              >
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground pl-2">Select Format</span>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex bg-black/20 p-1 rounded-lg">
                      {[
                        { id: "16:9", icon: Monitor, label: "Landscape" },
                        { id: "9:16", icon: Smartphone, label: "Portrait" },
                      ].map((ratio) => (
                        <button
                          key={ratio.id}
                          onClick={() => setAspectRatio(ratio.id as any)}
                          className={cn(
                            "px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all",
                            aspectRatio === ratio.id
                              ? "bg-primary/20 text-primary shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <ratio.icon className="w-4 h-4" />
                          {ratio.label}
                        </button>
                      ))}
                    </div>

                    <Button
                      onClick={handleSubmit}
                      disabled={isProcessing}
                      className="h-10 px-6 rounded-lg font-medium"
                    >
                      Start Creation
                    </Button>
                    
                    <button
                      onClick={() => {
                        setShowAspectPicker(false);
                        setDetectedIntent("idle");
                        setInputValue("");
                        pendingFileRef.current = null;
                      }}
                      className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Quick Suggestions */}
      <div className="mt-8 flex justify-center gap-6 opacity-60 hover:opacity-100 transition-opacity">
        {onLoadDemo && (
          <button
            onClick={onLoadDemo}
            className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Load Demo Project
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default MagicInput;
