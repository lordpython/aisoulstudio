/**
 * SmartDefaults Component
 * 
 * Shows AI-picked settings with minimal UI.
 * Users see what AI chose and can tweak with one click.
 * Replaces overwhelming forms with smart suggestions.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ChevronDown,
  Check,
  Palette,
  Clock,
  Users,
  Film,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ART_STYLES, VIDEO_PURPOSES, type VideoPurpose } from "@/constants";

interface SmartDefaultsProps {
  topic: string;
  suggestedStyle: string;
  suggestedPurpose: VideoPurpose;
  suggestedDuration: number;
  suggestedAudience: string;
  onStyleChange: (style: string) => void;
  onPurposeChange: (purpose: VideoPurpose) => void;
  onDurationChange: (duration: number) => void;
  onAudienceChange: (audience: string) => void;
  onConfirm: () => void;
  isGenerating?: boolean;
  className?: string;
}

// Style presets with visual previews
const STYLE_PRESETS = [
  { id: "Cinematic", name: "Cinematic", emoji: "🎬", color: "from-amber-500 to-orange-500" },
  { id: "Photorealistic", name: "Photorealistic", emoji: "📷", color: "from-emerald-500 to-teal-500" },
  { id: "Anime", name: "Anime", emoji: "🎨", color: "from-pink-500 to-rose-500" },
  { id: "Watercolor", name: "Watercolor", emoji: "🖌️", color: "from-sky-500 to-indigo-500" },
  { id: "Film Noir", name: "Film Noir", emoji: "🌑", color: "from-slate-600 to-slate-800" },
  { id: "Fantasy", name: "Fantasy", emoji: "✨", color: "from-purple-500 to-violet-500" },
];

const DURATION_PRESETS = [
  { value: 30, label: "30s", description: "Quick clip" },
  { value: 60, label: "1 min", description: "Standard" },
  { value: 120, label: "2 min", description: "Extended" },
  { value: 180, label: "3 min", description: "Long form" },
];

export const SmartDefaults: React.FC<SmartDefaultsProps> = ({
  topic,
  suggestedStyle,
  suggestedPurpose,
  suggestedDuration,
  suggestedAudience,
  onStyleChange,
  onPurposeChange,
  onDurationChange,
  onAudienceChange,
  onConfirm,
  isGenerating = false,
  className,
}) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const currentStyle = STYLE_PRESETS.find(s => s.id === suggestedStyle) || STYLE_PRESETS[0]!;
  const currentPurpose = VIDEO_PURPOSES.find(p => p.value === suggestedPurpose);
  const currentDuration = DURATION_PRESETS.find(d => d.value === suggestedDuration) || DURATION_PRESETS[1]!;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("w-full max-w-lg mx-auto px-4 sm:px-0", className)}
    >
      {/* Header */}
      <div className="text-center mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-3 sm:mb-4">
          <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
          <span className="text-xs sm:text-sm font-medium text-primary">AI picked for you</span>
        </div>

        <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto px-2">
          Based on "{topic.slice(0, 50)}{topic.length > 50 ? '...' : ''}"
        </p>
      </div>

      {/* Settings Cards */}
      <div className="space-y-3">
        {/* Style */}
        <SettingCard
          icon={<Palette className="w-4 h-4" />}
          label="Style"
          value={currentStyle.name}
          emoji={currentStyle.emoji}
          isExpanded={expandedSection === "style"}
          onToggle={() => toggleSection("style")}
        >
          <div className="grid grid-cols-3 gap-2 p-3">
            {STYLE_PRESETS.map((style) => (
              <button
                key={style.id}
                onClick={() => {
                  onStyleChange(style.id);
                  setExpandedSection(null);
                }}
                className={cn(
                  "relative p-3 rounded-xl transition-all text-center",
                  suggestedStyle === style.id
                    ? "border-primary bg-primary/10 border"
                    : "glass-button border-transparent"
                )}
              >
                <span className="text-2xl mb-1 block">{style.emoji}</span>
                <span className="text-xs font-medium">{style.name}</span>
                {suggestedStyle === style.id && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </SettingCard>

        {/* Duration */}
        <SettingCard
          icon={<Clock className="w-4 h-4" />}
          label="Duration"
          value={currentDuration.label}
          subtitle={currentDuration.description}
          isExpanded={expandedSection === "duration"}
          onToggle={() => toggleSection("duration")}
        >
          <div className="flex gap-2 p-3">
            {DURATION_PRESETS.map((duration) => (
              <button
                key={duration.value}
                onClick={() => {
                  onDurationChange(duration.value);
                  setExpandedSection(null);
                }}
                className={cn(
                  "flex-1 p-3 rounded-xl transition-all text-center",
                  suggestedDuration === duration.value
                    ? "border-primary bg-primary/10 border"
                    : "glass-button border-transparent"
                )}
              >
                <span className="text-lg font-bold block">{duration.label}</span>
                <span className="text-xs text-muted-foreground">{duration.description}</span>
              </button>
            ))}
          </div>
        </SettingCard>

        {/* Purpose */}
        <SettingCard
          icon={<Film className="w-4 h-4" />}
          label="Purpose"
          value={currentPurpose?.label || "Documentary"}
          emoji={currentPurpose?.icon}
          isExpanded={expandedSection === "purpose"}
          onToggle={() => toggleSection("purpose")}
        >
          <div className="grid grid-cols-2 gap-2 p-3 max-h-48 overflow-y-auto">
            {VIDEO_PURPOSES.slice(0, 8).map((purpose) => (
              <button
                key={purpose.value}
                onClick={() => {
                  onPurposeChange(purpose.value as VideoPurpose);
                  setExpandedSection(null);
                }}
                className={cn(
                  "p-2 rounded-xl transition-all text-left flex items-center gap-2",
                  suggestedPurpose === purpose.value
                    ? "border-primary bg-primary/10 border"
                    : "glass-button border-transparent"
                )}
              >
                <span className="text-lg">{purpose.icon}</span>
                <span className="text-xs font-medium truncate">{purpose.label}</span>
              </button>
            ))}
          </div>
        </SettingCard>
      </div>

      {/* Confirm Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-6 sm:mt-8"
      >
        <Button
          onClick={onConfirm}
          disabled={isGenerating}
          size="lg"
          className="w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg bg-linear-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 shadow-lg shadow-primary/20 hover-glow"
        >
          {isGenerating ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full mr-2"
              />
              Creating your video...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Looks good, generate!
            </>
          )}
        </Button>
      </motion.div>
    </motion.div>
  );
};

// Reusable setting card component
interface SettingCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  emoji?: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const SettingCard: React.FC<SettingCardProps> = ({
  icon,
  label,
  value,
  subtitle,
  emoji,
  isExpanded,
  onToggle,
  children,
}) => {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center text-muted-foreground">
            {icon}
          </div>
          <div className="text-left">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
            <div className="flex items-center gap-2">
              {emoji && <span>{emoji}</span>}
              <span className="font-semibold">{value}</span>
              {subtitle && <span className="text-xs text-muted-foreground">• {subtitle}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-primary font-medium">change</span>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border/20"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SmartDefaults;
