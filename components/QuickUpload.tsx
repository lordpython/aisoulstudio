import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Music, Monitor, Smartphone, Sparkles, ChevronRight, Youtube, Loader2, FileVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SERVER_URL } from "@/services/ffmpeg";
import { MusicGeneratorModal } from "./MusicGeneratorModal";
import { MusicChatModalV2 } from "./MusicChatModalV2";
import { isSunoConfigured } from "@/services/sunoService";
import type { SunoGeneratedTrack, SunoGenerationConfig, SunoTaskStatus } from "@/services/sunoService";
import {
  generateMusic as sunoGenerateMusic,
  waitForCompletion,
  generateLyrics as sunoGenerateLyrics,
  getLyricsStatus,
  getCredits,
} from "@/services/sunoService";

interface QuickUploadProps {
  onFileSelect: (file: File, aspectRatio: string) => void;
  onLoadDemo: (aspectRatio: string) => void;
  onSwitchToProduction?: () => void;
  disabled?: boolean;
}

export const QuickUpload: React.FC<QuickUploadProps> = ({
  onFileSelect,
  onLoadDemo,
  onSwitchToProduction,
  disabled = false,
}) => {
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [activeTab, setActiveTab] = useState<"upload" | "youtube" | "production" | "music">("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [showMusicModal, setShowMusicModal] = useState(false);
  const [showMusicChat, setShowMusicChat] = useState(false);

  // Music generation state
  const [musicState, setMusicState] = useState<{
    isGenerating: boolean;
    taskId: string | null;
    status: SunoTaskStatus | null;
    progress: number;
    generatedTracks: SunoGeneratedTrack[];
    selectedTrackId: string | null;
    lyrics: string | null;
    lyricsTaskId: string | null;
    credits: number | null;
    error: string | null;
  }>({
    isGenerating: false,
    taskId: null,
    status: null,
    progress: 0,
    generatedTracks: [],
    selectedTrackId: null,
    lyrics: null,
    lyricsTaskId: null,
    credits: null,
    error: null,
  });

  // Music generation handlers
  const handleGenerateMusic = useCallback(async (config: Partial<SunoGenerationConfig> & { prompt: string }) => {
    if (!isSunoConfigured()) {
      setMusicState(prev => ({
        ...prev,
        error: "Suno API key not configured. Add VITE_SUNO_API_KEY to .env.local",
      }));
      return;
    }

    setMusicState(prev => ({
      ...prev,
      isGenerating: true,
      taskId: null,
      status: "PENDING",
      progress: 0,
      generatedTracks: [],
      error: null,
    }));

    try {
      const taskId = await sunoGenerateMusic(config);
      setMusicState(prev => ({ ...prev, taskId, status: "PROCESSING", progress: 25 }));
      const tracks = await waitForCompletion(taskId);
      setMusicState(prev => ({
        ...prev,
        isGenerating: false,
        status: "SUCCESS",
        progress: 100,
        generatedTracks: tracks,
        selectedTrackId: tracks.length > 0 ? tracks[0].id : null,
      }));
    } catch (err) {
      setMusicState(prev => ({
        ...prev,
        isGenerating: false,
        status: "FAILED",
        progress: 0,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const handleGenerateLyrics = useCallback(async (prompt: string) => {
    if (!isSunoConfigured()) return;

    setMusicState(prev => ({ ...prev, lyricsTaskId: null, lyrics: null, error: null }));

    try {
      const taskId = await sunoGenerateLyrics(prompt);
      setMusicState(prev => ({ ...prev, lyricsTaskId: taskId }));

      const pollIntervalMs = 5000;
      const maxWaitMs = 2 * 60 * 1000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitMs) {
        const result = await getLyricsStatus(taskId);
        if (result.status === "SUCCESS" && result.text) {
          setMusicState(prev => ({ ...prev, lyrics: result.text || null }));
          return;
        }
        if (result.status === "FAILED") {
          throw new Error(result.errorMessage || "Lyrics generation failed");
        }
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
      throw new Error("Lyrics generation timed out");
    } catch (err) {
      setMusicState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const handleSelectTrack = useCallback((trackId: string) => {
    setMusicState(prev => ({ ...prev, selectedTrackId: trackId }));
  }, []);

  const handleAddToTimeline = useCallback(() => {
    const selectedTrack = musicState.generatedTracks.find(t => t.id === musicState.selectedTrackId);
    if (selectedTrack) {
      // Download the track or copy URL to clipboard
      window.open(selectedTrack.audio_url, '_blank');
    }
    setShowMusicModal(false);
  }, [musicState.generatedTracks, musicState.selectedTrackId]);

  const handleRefreshCredits = useCallback(async () => {
    if (!isSunoConfigured()) return;
    try {
      const result = await getCredits();
      // Only update if we got a valid credits value (not -1 for unknown)
      if (result.credits >= 0) {
        setMusicState(prev => ({ ...prev, credits: result.credits }));
      }
    } catch {
      // Silently fail - credits display is optional
      console.warn("[QuickUpload] Could not fetch Suno credits");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("audio/")) {
        onFileSelect(file, aspectRatio);
      }
    },
    [disabled, onFileSelect, aspectRatio]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file, aspectRatio);
      }
    },
    [onFileSelect, aspectRatio]
  );

  const handleYoutubeImport = async () => {
    if (!youtubeUrl.trim() || isImporting) return;

    setIsImporting(true);
    try {
      const response = await fetch(`${SERVER_URL}/api/import/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl }),
      });

      if (!response.ok) {
        throw new Error("Failed to import from YouTube");
      }

      const blob = await response.blob();
      const file = new File([blob], "youtube_audio.mp3", {
        type: "audio/mpeg",
      });
      onFileSelect(file, aspectRatio);
    } catch (error) {
      console.error(error);
      alert(
        "Failed to import YouTube video. Make sure the backend server is running (npm run server) and yt-dlp is installed.",
      );
    } finally {
      setIsImporting(false);
      setYoutubeUrl("");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="max-w-2xl mx-auto mt-12 flex flex-col items-center px-4 relative z-10"
    >
      {/* Background Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-[600px] max-h-[600px] -z-10 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-[100px] opacity-50 animate-pulse-slow" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/20 rounded-full blur-[100px] opacity-50 animate-pulse-slow delay-1000" />
      </div>

      {/* Header */}
      <div className="text-center mb-12">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-background/50 backdrop-blur-md border border-white/10 shadow-xl shadow-primary/5"
        >
          <Sparkles className="w-8 h-8 text-primary" aria-hidden="true" />
        </motion.div>
        <h1 className="text-5xl md:text-6xl font-bold mb-4 tracking-tight bg-clip-text text-transparent bg-linear-to-b from-foreground to-foreground/70">
          Create Your <span className="text-transparent bg-clip-text bg-linear-to-r from-primary via-purple-500 to-accent">Video</span>
        </h1>
        <p className="text-xl text-muted-foreground/80 max-w-lg mx-auto leading-relaxed">
          Transform your audio into cinematic visual storytelling with the power of AI.
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full bg-card/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden ring-1 ring-white/5">

        {/* Navigation Tabs - Segmented Control */}
        <nav 
          className="p-2 bg-black/20 m-2 rounded-2xl flex relative"
          role="tablist"
          aria-label="Video creation options"
        >
          <div className="absolute inset-0 rounded-2xl border border-white/5 pointer-events-none" aria-hidden="true" />
          {[
            { id: "upload", icon: Upload, label: "Upload File", color: "text-foreground" },
            { id: "youtube", icon: Youtube, label: "YouTube", color: "text-red-500" },
            { id: "music", icon: Music, label: "Song Generator", color: "text-cyan-400" },
            { id: "production", icon: FileVideo, label: "Studio Mode", color: "text-purple-400" }
          ].map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`${tab.id}-panel`}
              id={`${tab.id}-tab`}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-1 py-3 text-sm font-semibold transition-all relative z-10 rounded-xl flex items-center justify-center gap-2",
                activeTab === tab.id ? "text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="active-tab"
                  className="absolute inset-0 bg-background/80 shadow-[0_0_20px_rgba(0,0,0,0.1)] rounded-xl -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <tab.icon size={16} className={cn(activeTab === tab.id ? tab.color : "opacity-70")} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Content Area */}
        <div className="p-8 min-h-[340px] flex flex-col">

          {/* Aspect Ratio Config (Hidden in Studio Mode and Music) */}
          {activeTab !== "production" && activeTab !== "music" && (
            <div className="flex justify-center mb-10">
              <div 
                className="inline-flex bg-muted/30 p-1.5 rounded-full border border-white/5"
                role="radiogroup"
                aria-label="Video aspect ratio"
              >
                {[
                  { id: "16:9", icon: Monitor, label: "Landscape" },
                  { id: "9:16", icon: Smartphone, label: "Portrait" }
                ].map((ratio) => (
                  <button
                    key={ratio.id}
                    role="radio"
                    aria-checked={aspectRatio === ratio.id}
                    aria-label={`${ratio.label} (${ratio.id})`}
                    onClick={() => setAspectRatio(ratio.id as any)}
                    className={cn(
                      "px-6 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2",
                      aspectRatio === ratio.id
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                        : "text-muted-foreground hover:text-foreground/80 hover:bg-white/5"
                    )}
                  >
                    <ratio.icon size={14} aria-hidden="true" /> {ratio.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {activeTab === "upload" && (
                <motion.div
                  key="upload"
                  id="upload-panel"
                  role="tabpanel"
                  aria-labelledby="upload-tab"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center"
                >
                  <button
                    type="button"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => !disabled && document.getElementById("audio-input")?.click()}
                    disabled={disabled}
                    aria-label="Click to upload audio file or drag and drop. Supports MP3, WAV, M4A formats."
                    className={cn(
                      "w-full h-56 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group relative overflow-hidden",
                      isDragging
                        ? "border-primary bg-primary/10 shadow-[0_0_40px_rgba(var(--primary),0.2)]"
                        : "border-border/40 hover:border-primary/50 hover:bg-primary/5 hover:shadow-lg",
                      disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden="true" />

                    <input
                      id="audio-input"
                      type="file"
                      accept="audio/*"
                      onChange={handleFileInput}
                      className="hidden"
                      disabled={disabled}
                      aria-label="Select audio file"
                    />

                    <div className={cn(
                      "w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-all duration-300 shadow-md",
                      isDragging ? "bg-primary text-primary-foreground scale-110" : "bg-muted/50 text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary group-hover:scale-110"
                    )}>
                      <Upload size={32} aria-hidden="true" />
                    </div>

                    <h3 className="font-semibold text-lg mb-2 text-foreground/90">Click to upload or drag audio</h3>
                    <p className="text-sm text-muted-foreground/70">
                      Supports MP3, WAV, M4A
                    </p>
                  </button>
                </motion.div>
              )}

              {activeTab === "youtube" && (
                <motion.div
                  key="youtube"
                  id="youtube-panel"
                  role="tabpanel"
                  aria-labelledby="youtube-tab"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6 max-w-md mx-auto w-full py-4"
                >
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <Youtube className={cn("w-5 h-5 transition-colors", youtubeUrl ? "text-red-500" : "text-muted-foreground")} aria-hidden="true" />
                    </div>
                    <Input
                      type="text"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      aria-label="YouTube video URL"
                      className="pl-12 h-14 bg-background/30 border-white/10 focus:border-red-500/50 focus:ring-red-500/20 rounded-xl text-lg shadow-inner"
                      disabled={isImporting || disabled}
                      onKeyDown={(e) => e.key === "Enter" && handleYoutubeImport()}
                    />
                  </div>

                  <Button
                    onClick={handleYoutubeImport}
                    disabled={!youtubeUrl || isImporting}
                    aria-label={isImporting ? "Importing from YouTube..." : "Import audio from YouTube"}
                    className={cn(
                      "w-full h-14 rounded-xl text-white font-semibold text-lg shadow-lg transition-all",
                      "bg-linear-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 hover:shadow-red-500/25 hover:scale-[1.02] active:scale-[0.98]"
                    )}
                  >
                    {isImporting ? <Loader2 className="animate-spin w-5 h-5" aria-hidden="true" /> : "Import from YouTube"}
                  </Button>

                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" aria-hidden="true" />
                    <span>Requires backend server (npm run server)</span>
                  </div>
                </motion.div>
              )}

              {activeTab === "production" && (
                <motion.div
                  key="production"
                  id="production-panel"
                  role="tabpanel"
                  aria-labelledby="production-tab"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center py-2"
                >
                  <div className="relative mb-6" aria-hidden="true">
                    <div className="absolute inset-0 bg-purple-500 blur-2xl opacity-20" />
                    <div className="relative w-24 h-24 rounded-3xl bg-linear-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 flex items-center justify-center shadow-inner">
                      <FileVideo size={40} className="text-purple-400" />
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold mb-3 bg-clip-text text-transparent bg-linear-to-r from-purple-400 to-blue-400">
                    Professional Studio
                  </h3>

                  <p className="text-muted-foreground text-center mb-8 max-w-sm leading-relaxed">
                    Access advanced tools for multi-agent orchestration, detailed scene control, and granular editing.
                  </p>

                  <Button
                    onClick={() => onSwitchToProduction?.()}
                    aria-label="Enter Professional Studio mode"
                    className="w-full max-w-sm h-14 rounded-xl font-semibold text-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-purple-500/30 text-foreground shadow-xl shadow-purple-900/10 hover:shadow-purple-500/10 transition-all group"
                  >
                    Enter Studio <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform text-purple-400" aria-hidden="true" />
                  </Button>
                </motion.div>
              )}

              {activeTab === "music" && (
                <motion.div
                  key="music"
                  id="music-panel"
                  role="tabpanel"
                  aria-labelledby="music-tab"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center py-2"
                >
                  <div className="relative mb-6" aria-hidden="true">
                    <div className="absolute inset-0 bg-cyan-500 blur-2xl opacity-20" />
                    <div className="relative w-24 h-24 rounded-3xl bg-linear-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 flex items-center justify-center shadow-inner">
                      <Music size={40} className="text-cyan-400" />
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold mb-3 bg-clip-text text-transparent bg-linear-to-r from-cyan-400 to-blue-400">
                    AI Song Generator
                  </h3>

                  <p className="text-muted-foreground text-center mb-6 max-w-sm leading-relaxed">
                    Create custom AI-generated music from topics, lyrics, and style preferences using Suno AI.
                  </p>

                  <div className="w-full max-w-sm space-y-3">
                    {/* Chat-based generator (recommended) */}
                    <Button
                      onClick={() => setShowMusicChat(true)}
                      aria-label="Open AI Music Producer chat interface (recommended)"
                      className="w-full h-14 rounded-xl font-semibold text-lg bg-linear-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:from-cyan-500/30 hover:to-blue-500/30 text-foreground shadow-xl shadow-cyan-900/10 hover:shadow-cyan-500/10 transition-all group"
                    >
                      <Sparkles className="mr-2 w-5 h-5 text-cyan-400" aria-hidden="true" />
                      Chat with AI Producer
                      <span className="ml-2 text-xs bg-cyan-500/20 px-2 py-0.5 rounded-full text-cyan-300">Recommended</span>
                    </Button>

                    {/* Quick generator */}
                    <Button
                      onClick={() => setShowMusicModal(true)}
                      variant="outline"
                      aria-label="Open quick music generation form"
                      className="w-full h-12 rounded-xl font-medium bg-white/5 border border-white/10 hover:bg-white/10 hover:border-cyan-500/20 text-muted-foreground hover:text-foreground transition-all"
                    >
                      Quick Generate (Form)
                    </Button>
                  </div>

                  {!isSunoConfigured() && (
                    <p className="mt-4 text-xs text-amber-400/80 text-center" role="alert">
                      ⚠️ Add VITE_SUNO_API_KEY to .env.local to enable
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Footer Demo Link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-16"
      >
        <button
          onClick={() => onLoadDemo(aspectRatio)}
          aria-label="Load demo project for development testing"
          className="group flex items-center gap-3 px-6 py-3 rounded-full bg-accent/5 hover:bg-accent/10 border border-accent/10 hover:border-accent/20 transition-all duration-300"
        >
          <Sparkles size={14} className="text-accent group-hover:scale-110 transition-transform" aria-hidden="true" />
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground group-hover:text-accent transition-colors">Load Demo Project (Dev)</span>
        </button>
      </motion.div>

      {/* Music Generator Modal */}
      <MusicGeneratorModal
        open={showMusicModal}
        onClose={() => setShowMusicModal(false)}
        onMusicGenerated={(track) => {
          console.log("[QuickUpload] Music generated:", track.title);
        }}
        musicState={musicState}
        onGenerateMusic={handleGenerateMusic}
        onGenerateLyrics={handleGenerateLyrics}
        onSelectTrack={handleSelectTrack}
        onAddToTimeline={handleAddToTimeline}
        onRefreshCredits={handleRefreshCredits}
      />

      {/* Music Chat Modal V2 (AI Producer with direct Suno API) */}
      <MusicChatModalV2
        open={showMusicChat}
        onClose={() => setShowMusicChat(false)}
        onMusicGenerated={(track) => {
          console.log("[QuickUpload] Music generated via chat:", track.title);
        }}
      />
    </motion.div>
  );
};
