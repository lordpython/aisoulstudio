/**
 * QuickExport Component
 * 
 * One-click export with visual presets instead of technical options.
 * Users pick a platform, we handle the codec details.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Smartphone,
  Monitor,
  Youtube,
  Instagram,
  Film,
  Check,
  Loader2,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ExportPreset {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  resolution: string;
  format: string;
  color: string;
  // Export config
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
  quality: "fast" | "balanced" | "high";
}

const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "social",
    name: "Social Media",
    description: "TikTok, Reels, Shorts",
    icon: <Smartphone className="w-5 h-5 sm:w-6 sm:h-6" />,
    resolution: "1080p",
    format: "MP4 (H.264)",
    color: "from-pink-500 to-rose-500",
    width: 1080,
    height: 1920,
    orientation: "portrait",
    quality: "balanced",
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Full HD, optimized",
    icon: <Youtube className="w-5 h-5 sm:w-6 sm:h-6" />,
    resolution: "1080p",
    format: "MP4 (H.264)",
    color: "from-red-500 to-red-600",
    width: 1920,
    height: 1080,
    orientation: "landscape",
    quality: "high",
  },
  {
    id: "4k",
    name: "4K Master",
    description: "Highest quality",
    icon: <Monitor className="w-5 h-5 sm:w-6 sm:h-6" />,
    resolution: "4K",
    format: "MP4 (H.265)",
    color: "from-purple-500 to-violet-500",
    width: 3840,
    height: 2160,
    orientation: "landscape",
    quality: "high",
  },
  {
    id: "fast",
    name: "Quick Export",
    description: "Fast rendering",
    icon: <Film className="w-5 h-5 sm:w-6 sm:h-6" />,
    resolution: "720p",
    format: "MP4",
    color: "from-slate-500 to-slate-600",
    width: 1280,
    height: 720,
    orientation: "landscape",
    quality: "fast",
  },
];

/** Export configuration returned to parent */
export interface QuickExportConfig {
  presetId: string;
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
  quality: "fast" | "balanced" | "high";
}

interface QuickExportProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (config: QuickExportConfig, onProgress: (percent: number) => void) => Promise<void>;
  videoTitle?: string;
  duration?: number;
  className?: string;
}

export const QuickExport: React.FC<QuickExportProps> = ({
  isOpen,
  onClose,
  onExport,
  videoTitle = "Your Video",
  duration = 60,
  className,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>("youtube");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportComplete, setExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    const preset = EXPORT_PRESETS.find(p => p.id === selectedPreset);
    if (!preset) return;

    setIsExporting(true);
    setExportProgress(0);
    setExportError(null);

    // Progress callback for real-time updates from the export process
    const handleProgress = (percent: number) => {
      setExportProgress(Math.min(99, percent)); // Cap at 99 until complete
    };

    try {
      await onExport(
        {
          presetId: preset.id,
          width: preset.width,
          height: preset.height,
          orientation: preset.orientation,
          quality: preset.quality,
        },
        handleProgress
      );

      setExportProgress(100);
      setExportComplete(true);
    } catch (error: any) {
      console.error("Export failed:", error);
      setExportError(error.message || "Export failed. Please try again.");
      setIsExporting(false);
    }
  };

  const handleReset = () => {
    setIsExporting(false);
    setExportProgress(0);
    setExportComplete(false);
    setExportError(null);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 100 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 100 }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "w-full sm:max-w-lg bg-card border border-border/50 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto",
            className
          )}
        >
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-border/30 sticky top-0 bg-card z-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold">Export Video</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  {videoTitle} • {formatDuration(duration)}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-muted/30 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6">
            {exportError ? (
              /* Error State */
              <div className="py-6 sm:py-8 text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
                  <X className="w-7 h-7 sm:w-8 sm:h-8 text-red-500" />
                </div>

                <h3 className="text-base sm:text-lg font-semibold mb-2">Export Failed</h3>
                <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6 px-4">
                  {exportError}
                </p>

                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={handleReset}
                    variant="outline"
                    className="rounded-xl"
                  >
                    Try Again
                  </Button>
                  <Button
                    onClick={onClose}
                    variant="ghost"
                    className="rounded-xl"
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : !isExporting && !exportComplete ? (
              <>
                {/* Preset Grid */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
                  {EXPORT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset.id)}
                      className={cn(
                        "relative p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all text-left group",
                        selectedPreset === preset.id
                          ? "border-primary bg-primary/5"
                          : "border-border/30 hover:border-border/50 hover:bg-muted/20"
                      )}
                    >
                      {/* Gradient Background */}
                      <div
                        className={cn(
                          "absolute inset-0 rounded-xl sm:rounded-2xl opacity-0 transition-opacity bg-gradient-to-br",
                          preset.color,
                          selectedPreset === preset.id && "opacity-10"
                        )}
                      />

                      <div className="relative">
                        <div
                          className={cn(
                            "w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center mb-2 sm:mb-3 transition-colors",
                            selectedPreset === preset.id
                              ? "bg-primary/20 text-primary"
                              : "bg-muted/30 text-muted-foreground group-hover:text-foreground"
                          )}
                        >
                          {preset.icon}
                        </div>

                        <h3 className="font-semibold text-sm sm:text-base mb-0.5 sm:mb-1">{preset.name}</h3>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          {preset.description}
                        </p>

                        <div className="mt-2 sm:mt-3 flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs">
                          <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-muted/30">
                            {preset.resolution}
                          </span>
                          <span className="text-muted-foreground hidden sm:inline">
                            {preset.format}
                          </span>
                        </div>
                      </div>

                      {/* Selected Check */}
                      {selectedPreset === preset.id && (
                        <div className="absolute top-2 sm:top-3 right-2 sm:right-3 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 sm:w-4 sm:h-4 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Export Button */}
                <Button
                  onClick={handleExport}
                  size="lg"
                  className="w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90"
                >
                  <Download className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  Export Now
                </Button>
              </>
            ) : isExporting && !exportComplete ? (
              /* Exporting State */
              <div className="py-6 sm:py-8 text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-6 rounded-full border-4 border-primary/20 border-t-primary"
                />

                <h3 className="text-base sm:text-lg font-semibold mb-2">Exporting...</h3>
                <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">
                  This may take a few minutes
                </p>

                {/* Progress Bar */}
                <div className="h-2 bg-muted/30 rounded-full overflow-hidden mb-2">
                  <motion.div
                    className="h-full bg-gradient-to-r from-primary to-purple-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${exportProgress}%` }}
                  />
                </div>
                <span className="text-xs sm:text-sm font-mono text-muted-foreground">
                  {Math.round(exportProgress)}%
                </span>
              </div>
            ) : (
              /* Complete State */
              <div className="py-6 sm:py-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-6 rounded-full bg-green-500/20 flex items-center justify-center"
                >
                  <Check className="w-7 h-7 sm:w-8 sm:h-8 text-green-500" />
                </motion.div>

                <h3 className="text-base sm:text-lg font-semibold mb-2">Export Complete!</h3>
                <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">
                  Your video has been downloaded
                </p>

                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={() => {
                      handleReset();
                    }}
                    variant="outline"
                    className="rounded-xl"
                  >
                    Export Another
                  </Button>
                  <Button
                    onClick={onClose}
                    className="rounded-xl"
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default QuickExport;
