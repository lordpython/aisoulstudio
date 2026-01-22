/**
 * HomeView - Landing Page Component
 *
 * Provides a clear, guided experience for users to choose what they want to create
 * before entering the AI workspace. This helps the AI agent understand user intent.
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video,
  Music,
  AudioWaveform,
  Sparkles,
  Settings2,
  ChevronRight,
  Clock,
  Palette,
  Users,
  Globe,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ART_STYLES, VIDEO_PURPOSES, type VideoPurpose } from "@/constants";

// Creation mode types
export type CreationMode = "video" | "music" | "visualizer" | null;

// Preset configurations for AI agent
export interface CreationPreset {
  mode: CreationMode;
  // Video presets
  videoPurpose?: VideoPurpose;
  visualStyle?: string;
  duration?: number;
  topic?: string;
  // Music presets
  musicStyle?: string;
  instrumental?: boolean;
  musicPrompt?: string;
  lyrics?: string;
  musicModel?: "V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5";
  // Common
  targetAudience?: string;
  language?: string;
}

interface HomeViewProps {
  onStartCreation: (preset: CreationPreset) => void;
  onSwitchToVisualizer: () => void;
}

// Mode card data
const CREATION_MODES = [
  {
    id: "video" as const,
    title: "Create Video",
    description: "Generate AI videos from any topic with narration, visuals, and music",
    icon: Video,
    color: "from-violet-500 to-purple-600",
    features: ["AI Narration", "Visual Generation", "Background Music", "Auto SFX"],
  },
  {
    id: "music" as const,
    title: "Generate Music",
    description: "Create full songs, instrumentals, or background tracks with Suno AI",
    icon: Music,
    color: "from-pink-500 to-rose-600",
    features: ["Full Songs", "Instrumentals", "Custom Lyrics", "Multiple Styles"],
  },
  {
    id: "visualizer" as const,
    title: "Audio Visualizer",
    description: "Upload audio + SRT to create lyric videos with synced visuals",
    icon: AudioWaveform,
    color: "from-cyan-500 to-blue-600",
    features: ["Lyric Sync", "Visual Effects", "Waveform Display", "Custom Timing"],
  },
];

// Quick start presets
const VIDEO_PRESETS = [
  { id: "documentary", label: "Documentary", purpose: "documentary" as VideoPurpose, style: "Cinematic", duration: 60 },
  { id: "social", label: "Social Short", purpose: "social_short" as VideoPurpose, style: "Modern", duration: 30 },
  { id: "educational", label: "Educational", purpose: "educational" as VideoPurpose, style: "Clean", duration: 90 },
  { id: "storytelling", label: "Storytelling", purpose: "storytelling" as VideoPurpose, style: "Cinematic", duration: 120 },
  { id: "travel", label: "Travel", purpose: "travel" as VideoPurpose, style: "Vibrant", duration: 60 },
  { id: "motivational", label: "Motivational", purpose: "motivational" as VideoPurpose, style: "Inspiring", duration: 45 },
];

const MUSIC_PRESETS = [
  { id: "pop", label: "Pop Song", style: "Pop, Catchy, Upbeat", instrumental: false },
  { id: "cinematic", label: "Cinematic Score", style: "Cinematic, Orchestral, Epic", instrumental: true },
  { id: "lofi", label: "Lo-Fi Beats", style: "Lo-Fi, Chill, Relaxing", instrumental: true },
  { id: "rock", label: "Rock Anthem", style: "Rock, Powerful, Electric Guitar", instrumental: false },
  { id: "electronic", label: "Electronic", style: "Electronic, Synthwave, Energetic", instrumental: true },
  { id: "ambient", label: "Ambient", style: "Ambient, Atmospheric, Peaceful", instrumental: true },
];

export function HomeView({ onStartCreation, onSwitchToVisualizer }: HomeViewProps) {
  const [selectedMode, setSelectedMode] = useState<CreationMode>(null);
  const [showConfig, setShowConfig] = useState(false);

  // Video config state
  const [videoPurpose, setVideoPurpose] = useState<VideoPurpose>("documentary");
  const [visualStyle, setVisualStyle] = useState("Cinematic");
  const [duration, setDuration] = useState(60);
  const [topic, setTopic] = useState("");

  // Music config state
  const [musicStyle, setMusicStyle] = useState("Pop, Catchy, Upbeat");
  const [instrumental, setInstrumental] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [musicModel, setMusicModel] = useState<"V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5">("V5");

  // Character limits based on model - reactive to model changes
  const charLimits = useMemo(() => {
    if (musicModel === "V4") {
      return { prompt: 3000, style: 200, title: 80 };
    } else if (musicModel === "V4_5ALL") {
      return { prompt: 5000, style: 1000, title: 80 };
    } else {
      // V4_5, V4_5PLUS, V5
      return { prompt: 5000, style: 1000, title: 100 };
    }
  }, [musicModel]);

  const handleModeSelect = (mode: CreationMode) => {
    if (mode === "visualizer") {
      onSwitchToVisualizer();
      return;
    }
    setSelectedMode(mode);
    setShowConfig(true);
  };

  const handlePresetSelect = (preset: any) => {
    if (selectedMode === "video") {
      setVideoPurpose(preset.purpose);
      setVisualStyle(preset.style);
      setDuration(preset.duration);
    } else if (selectedMode === "music") {
      setMusicStyle(preset.style);
      setInstrumental(preset.instrumental);
    }
  };

  const handleStartCreation = () => {
    const preset: CreationPreset = {
      mode: selectedMode,
    };

    if (selectedMode === "video") {
      preset.videoPurpose = videoPurpose;
      preset.visualStyle = visualStyle;
      preset.duration = duration;
      preset.topic = topic;
    } else if (selectedMode === "music") {
      preset.musicStyle = musicStyle;
      preset.instrumental = instrumental;
      preset.musicPrompt = musicPrompt;
      preset.musicModel = musicModel;
      if (!instrumental && lyrics) {
        preset.lyrics = lyrics;
      }
    }

    onStartCreation(preset);
  };

  const handleBack = () => {
    setShowConfig(false);
    setSelectedMode(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-[128px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold">LyricLens</span>
          </div>

          {showConfig && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="text-white/60 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center p-6">
          <AnimatePresence mode="wait">
            {!showConfig ? (
              /* Mode Selection */
              <motion.div
                key="mode-select"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl w-full"
              >
                {/* Title */}
                <div className="text-center mb-12">
                  <h1 className="text-4xl md:text-5xl font-bold mb-4">
                    What would you like to create?
                  </h1>
                  <p className="text-lg text-white/60 max-w-2xl mx-auto">
                    Choose a creation mode to get started. Our AI will guide you through the process.
                  </p>
                </div>

                {/* Mode Cards */}
                <div className="grid md:grid-cols-3 gap-6">
                  {CREATION_MODES.map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <motion.button
                        key={mode.id}
                        onClick={() => handleModeSelect(mode.id)}
                        whileHover={{ scale: 1.02, y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        className={cn(
                          "group relative p-6 rounded-2xl text-left transition-all duration-300",
                          "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20",
                          "backdrop-blur-sm"
                        )}
                      >
                        {/* Icon */}
                        <div className={cn(
                          "w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4",
                          mode.color
                        )}>
                          <Icon className="w-7 h-7 text-white" />
                        </div>

                        {/* Title & Description */}
                        <h3 className="text-xl font-semibold mb-2">{mode.title}</h3>
                        <p className="text-sm text-white/60 mb-4">{mode.description}</p>

                        {/* Features */}
                        <div className="flex flex-wrap gap-2">
                          {mode.features.map((feature) => (
                            <span
                              key={feature}
                              className="px-2 py-1 text-xs rounded-full bg-white/10 text-white/70"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>

                        {/* Arrow indicator */}
                        <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight className="w-5 h-5 text-white/60" />
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              /* Configuration Panel */
              <motion.div
                key="config"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-3xl w-full"
              >
                {/* Title */}
                <div className="text-center mb-8">
                  <div className={cn(
                    "w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center mx-auto mb-4",
                    selectedMode === "video" ? "from-violet-500 to-purple-600" : "from-pink-500 to-rose-600"
                  )}>
                    {selectedMode === "video" ? (
                      <Video className="w-8 h-8 text-white" />
                    ) : (
                      <Music className="w-8 h-8 text-white" />
                    )}
                  </div>
                  <h2 className="text-3xl font-bold mb-2">
                    {selectedMode === "video" ? "Configure Your Video" : "Configure Your Music"}
                  </h2>
                  <p className="text-white/60">
                    {selectedMode === "video"
                      ? "Choose a preset or customize your video settings"
                      : "Choose a preset or customize your music style"
                    }
                  </p>
                </div>

                {/* Quick Presets */}
                <div className="mb-8">
                  <Label className="text-sm text-white/60 mb-3 block">Quick Presets</Label>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {(selectedMode === "video" ? VIDEO_PRESETS : MUSIC_PRESETS).map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset)}
                        className={cn(
                          "px-3 py-2 rounded-lg text-sm font-medium transition-all",
                          "bg-white/5 hover:bg-white/10 border border-white/10",
                          ((selectedMode === "video" && videoPurpose === preset.purpose) ||
                            (selectedMode === "music" && musicStyle === preset.style)) &&
                          "bg-violet-500/20 border-violet-500/50"
                        )}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Configuration Form */}
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10 mb-6">
                  {selectedMode === "video" ? (
                    <div className="space-y-6">
                      {/* Topic Input */}
                      <div>
                        <Label className="text-sm text-white/80 mb-2 block">
                          What's your video about? (optional)
                        </Label>
                        <Input
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                          placeholder="e.g., The history of coffee, A day in Tokyo..."
                          className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                        />
                        <p className="text-xs text-white/40 mt-1">
                          Leave empty to describe it to the AI later
                        </p>
                      </div>

                      {/* Purpose & Style */}
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm text-white/80 mb-2 block">
                            <Users className="w-4 h-4 inline mr-2" />
                            Video Purpose
                          </Label>
                          <Select value={videoPurpose} onValueChange={(v) => setVideoPurpose(v as VideoPurpose)}>
                            <SelectTrigger className="bg-white/5 border-white/10 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10">
                              {VIDEO_PURPOSES.map((p) => (
                                <SelectItem key={p.value} value={p.value} className="text-white focus:bg-white/10 focus:text-white">
                                  <span>{p.icon} {p.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm text-white/80 mb-2 block">
                            <Palette className="w-4 h-4 inline mr-2" />
                            Visual Style
                          </Label>
                          <Select value={visualStyle} onValueChange={setVisualStyle}>
                            <SelectTrigger className="bg-white/5 border-white/10 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10">
                              {ART_STYLES.map((style) => (
                                <SelectItem key={style} value={style} className="text-white focus:bg-white/10 focus:text-white">
                                  <span>{style}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Duration */}
                      <div>
                        <Label className="text-sm text-white/80 mb-2 block">
                          <Clock className="w-4 h-4 inline mr-2" />
                          Target Duration: {duration}s
                        </Label>
                        <Slider
                          value={[duration]}
                          onValueChange={(v) => setDuration(v[0])}
                          min={15}
                          max={180}
                          step={15}
                          className="py-4"
                        />
                        <div className="flex justify-between text-xs text-white/40">
                          <span>15s (Short)</span>
                          <span>60s</span>
                          <span>180s (Long)</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Model Selection */}
                      <div>
                        <Label className="text-sm text-white/80 mb-2 block">
                          AI Model
                        </Label>
                        <div className="grid grid-cols-5 gap-2">
                          {[
                            { id: "V5", label: "V5", desc: "Latest" },
                            { id: "V4_5PLUS", label: "V4.5+", desc: "Rich tones" },
                            { id: "V4_5ALL", label: "V4.5 All", desc: "Structure" },
                            { id: "V4_5", label: "V4.5", desc: "Smart" },
                            { id: "V4", label: "V4", desc: "Vocals" },
                          ].map((model) => (
                            <button
                              key={model.id}
                              onClick={() => setMusicModel(model.id as any)}
                              className={cn(
                                "p-2 rounded-lg text-center transition-all",
                                musicModel === model.id
                                  ? "bg-pink-500/30 border-2 border-pink-500"
                                  : "bg-white/5 border border-white/10 hover:bg-white/10"
                              )}
                            >
                              <p className="text-sm font-medium">{model.label}</p>
                              <p className="text-xs text-white/50">{model.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Music Prompt */}
                      <div>
                        <Label className="text-sm text-white/80 mb-2 block">
                          What kind of music? (optional)
                        </Label>
                        <Input
                          value={musicPrompt}
                          onChange={(e) => setMusicPrompt(e.target.value.slice(0, charLimits.prompt))}
                          placeholder="e.g., A summer beach vibe, Epic battle theme..."
                          className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                        />
                        <p className="text-xs text-white/40 mt-1">
                          Leave empty to describe it to the AI later
                        </p>
                      </div>

                      {/* Style */}
                      <div>
                        <Label className="text-sm text-white/80 mb-2 block">
                          <Palette className="w-4 h-4 inline mr-2" />
                          Music Style
                        </Label>
                        <Input
                          value={musicStyle}
                          onChange={(e) => setMusicStyle(e.target.value.slice(0, charLimits.style))}
                          placeholder="e.g., Pop, Upbeat, Catchy"
                          className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                        />
                        <p className="text-xs text-white/40 mt-1 text-right">
                          {musicStyle.length}/{charLimits.style}
                        </p>
                      </div>

                      {/* Instrumental Toggle */}
                      <div className="flex items-center justify-between p-4 rounded-xl bg-white/5">
                        <div>
                          <p className="font-medium">Instrumental Only</p>
                          <p className="text-sm text-white/60">No vocals, just music</p>
                        </div>
                        <button
                          onClick={() => setInstrumental(!instrumental)}
                          className={cn(
                            "w-12 h-6 rounded-full transition-colors relative",
                            instrumental ? "bg-violet-500" : "bg-white/20"
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                              instrumental ? "left-7" : "left-1"
                            )}
                          />
                        </button>
                      </div>

                      {/* Lyrics Input - shown when not instrumental */}
                      {!instrumental && (
                        <div>
                          <Label className="text-sm text-white/80 mb-2 block">
                            <Music className="w-4 h-4 inline mr-2" />
                            Lyrics
                          </Label>
                          <textarea
                            value={lyrics}
                            onChange={(e) => setLyrics(e.target.value.slice(0, charLimits.prompt))}
                            placeholder="Write your own lyrics, two verses (8 lines) for the best result"
                            rows={5}
                            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white placeholder:text-white/40 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                          />
                          <p className="text-xs text-white/40 mt-1 text-right">
                            {lyrics.length}/{charLimits.prompt}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Start Button */}
                <Button
                  onClick={handleStartCreation}
                  size="lg"
                  className={cn(
                    "w-full h-14 text-lg font-semibold rounded-xl",
                    "bg-gradient-to-r shadow-lg",
                    selectedMode === "video"
                      ? "from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                      : "from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700"
                  )}
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Start Creating
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="p-6 text-center text-sm text-white/40">
          Powered by Gemini AI & Suno
        </footer>
      </div>
    </div>
  );
}

export default HomeView;
