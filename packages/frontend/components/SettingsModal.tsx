import React from "react";
import {
  Music,
  Speech,
  Smartphone,
  Monitor,
  Sparkles,
  Film,
  Zap,
  Target,
  User,
  X,
  Settings,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { ART_STYLES, VIDEO_PURPOSES, type VideoPurpose } from "@/constants";
// cn utility removed - not used in this component

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: "music" | "story";
  videoPurpose: VideoPurpose;
  generationMode: "image" | "video";
  videoProvider: "veo" | "deapi";
  veoVideoCount: number;
  aspectRatio: string;
  selectedStyle: string;
  globalSubject: string;
  onContentTypeChange: (type: "music" | "story") => void;
  onVideoPurposeChange: (purpose: VideoPurpose) => void;
  onGenerationModeChange: (mode: "image" | "video") => void;
  onVideoProviderChange: (provider: "veo" | "deapi") => void;
  onVeoVideoCountChange: (count: number) => void;
  onAspectRatioChange: (ratio: string) => void;
  onStyleChange: (style: string) => void;
  onGlobalSubjectChange: (subject: string) => void;
  targetAudience?: string;
  onTargetAudienceChange?: (audience: string) => void;
}

const SettingRow = ({ icon: Icon, label, children }: { icon: React.ElementType, label: string, children: React.ReactNode }) => (
  <div className="group relative">
    <div className="absolute -inset-2 bg-white/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
    <div className="relative flex items-center justify-between gap-4 p-1">
      <div className="flex items-center gap-3 text-muted-foreground group-hover:text-foreground transition-colors">
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
          <Icon size={16} />
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="w-[200px]">
        {children}
      </div>
    </div>
  </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  contentType,
  videoPurpose,
  generationMode,
  videoProvider,
  veoVideoCount,
  aspectRatio,
  selectedStyle,
  globalSubject,
  onContentTypeChange,
  onVideoPurposeChange,
  onGenerationModeChange,
  onVideoProviderChange,
  onVeoVideoCountChange,
  onAspectRatioChange,
  onStyleChange,
  targetAudience, // Added prop
  onTargetAudienceChange, // Added prop
  onGlobalSubjectChange,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl bg-background/80 backdrop-blur-2xl border-white/10 p-0 overflow-hidden gap-0 shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Settings size={16} className="text-primary" />
            </div>
            <DialogTitle className="text-lg font-semibold tracking-tight">Studio Configuration</DialogTitle>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto no-scrollbar">

          {/* Section: Project Basics */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground/50 uppercase tracking-widest px-1">Core Settings</h3>

            <SettingRow icon={contentType === "music" ? Music : Speech} label="Content Mode">
              <Select value={contentType} onValueChange={onContentTypeChange}>
                <SelectTrigger className="h-9 bg-black/20 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="music">Music Video</SelectItem>
                  <SelectItem value="story">Story / Speech</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow icon={aspectRatio === "16:9" ? Monitor : Smartphone} label="Aspect Ratio">
              <Select value={aspectRatio} onValueChange={onAspectRatioChange}>
                <SelectTrigger className="h-9 bg-black/20 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9 Landscape</SelectItem>
                  <SelectItem value="9:16">9:16 Portrait</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow icon={Target} label="Video Purpose">
              <Select value={videoPurpose} onValueChange={onVideoPurposeChange}>
                <SelectTrigger className="h-9 bg-black/20 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIDEO_PURPOSES.map((purpose) => (
                    <SelectItem key={purpose.value} value={purpose.value}>
                      {purpose.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow icon={User} label="Target Audience">
              <Input
                value={targetAudience || ""}
                onChange={(e) => onTargetAudienceChange?.(e.target.value)}
                placeholder="e.g. Children, Professionals, General"
                className="h-9 bg-black/20 border-white/10"
              />
            </SettingRow>
          </section>

          {/* Section: Output Pipeline */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground/50 uppercase tracking-widest px-1">Rendering Engine</h3>

            <SettingRow icon={Film} label="Output Format">
              <Select value={generationMode} onValueChange={onGenerationModeChange}>
                <SelectTrigger className="h-9 bg-black/20 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Static Images</SelectItem>
                  <SelectItem value="video">Motion Loops</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <AnimatePresence>
              {generationMode === "video" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <SettingRow icon={Zap} label="Video Engine">
                    <Select value={videoProvider} onValueChange={onVideoProviderChange}>
                      <SelectTrigger className="h-9 bg-black/20 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="veo">Google Veo (Premium)</SelectItem>
                        <SelectItem value="deapi">DeAPI (Fast)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>

                  {videoProvider === "veo" && (
                    <SettingRow icon={Video} label="Pro Video Scenes">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="5"
                          value={veoVideoCount}
                          onChange={(e) => onVeoVideoCountChange(Number(e.target.value))}
                          className="w-24 h-2 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                        />
                        <span className="text-sm font-mono w-6 text-center">{veoVideoCount}</span>
                      </div>
                    </SettingRow>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Section: Aesthetics */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground/50 uppercase tracking-widest px-1">Art Direction</h3>

            <SettingRow icon={Sparkles} label="Visual Style">
              <Select value={selectedStyle} onValueChange={onStyleChange}>
                <SelectTrigger className="h-9 bg-black/20 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {ART_STYLES.map((style) => (
                    <SelectItem key={style} value={style}>{style}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow icon={User} label="Main Subject">
              <Input
                value={globalSubject}
                onChange={(e) => onGlobalSubjectChange(e.target.value)}
                placeholder="e.g. A red robot"
                className="h-9 bg-black/20 border-white/10"
              />
            </SettingRow>
          </section>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-white/5 flex justify-end">
          <Button onClick={onClose} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
