/**
 * MusicGeneratorModal Component
 * 
 * Modal for generating AI music using Suno API.
 * Features topic/prompt input, style selection, vocal mode, and advanced options.
 */

import { useState, useCallback, useEffect } from "react";
import {
  Music,
  Sparkles,
  Mic,
  MicOff,
  Settings2,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  RefreshCw,
  Play,
  Pause,
  Check,
  Plus,
  Upload,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { SunoModel, SunoGeneratedTrack, SunoGenerationConfig } from "@/services/sunoService";

// Music style/genre options
const MUSIC_STYLES = [
  "Pop",
  "Rock",
  "Electronic",
  "Hip Hop",
  "R&B",
  "Jazz",
  "Classical",
  "Country",
  "Folk",
  "Ambient",
  "Cinematic",
  "Lo-Fi",
  "Indie",
  "Metal",
  "Reggae",
  "Latin",
  "World",
  "Blues",
] as const;

// Suno model versions
const MODEL_VERSIONS: { value: SunoModel; label: string; description: string }[] = [
  { value: "V5", label: "V5 (Latest)", description: "Highest quality, recommended" },
  { value: "V4_5ALL", label: "V4.5 All", description: "All styles supported" },
  { value: "V4_5PLUS", label: "V4.5 Plus", description: "Enhanced quality" },
  { value: "V4_5", label: "V4.5", description: "Standard quality" },
  { value: "V4", label: "V4", description: "Legacy model" },
];

interface MusicGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  onMusicGenerated?: (track: SunoGeneratedTrack) => void;
  initialTopic?: string;
  // Hook integration
  musicState: {
    isGenerating: boolean;
    status: string | null;
    progress: number;
    generatedTracks: SunoGeneratedTrack[];
    selectedTrackId: string | null;
    lyrics: string | null;
    credits: number | null;
    error: string | null;
  };
  onGenerateMusic: (config: Partial<SunoGenerationConfig> & { prompt: string }) => Promise<void>;
  onGenerateLyrics: (prompt: string) => Promise<void>;
  onSelectTrack: (trackId: string) => void;
  onAddToTimeline: () => void;
  onRefreshCredits: () => Promise<void>;
  // New props for Extended features (optional)
  onUploadAudio?: (file: File) => Promise<string>;
  onUploadAndCover?: (config: any) => Promise<string>;
  onAddVocals?: (config: any) => Promise<string>;
  onAddInstrumental?: (config: any) => Promise<string>;
  /** Initial mode to start the modal in */
  initialMode?: "generate" | "remix";
}

interface MusicFormState {
  topic: string;
  style: string;
  title: string;
  vocalMode: "vocal-male" | "vocal-female" | "instrumental";
  customLyrics: string;
  useCustomLyrics: boolean;
  // Advanced options
  model: SunoModel;
  styleWeight: number;
  weirdnessConstraint: number;
  negativeTags: string;
}

export function MusicGeneratorModal({
  open,
  onClose,
  onMusicGenerated,
  initialTopic = "",
  musicState,
  onGenerateMusic,
  onGenerateLyrics,
  onSelectTrack,
  onAddToTimeline,
  onRefreshCredits,
  onUploadAudio,
  onUploadAndCover,
  onAddVocals,
  onAddInstrumental,
  initialMode = "generate",
}: MusicGeneratorModalProps) {
  // Mode state - use initialMode prop
  const [mode, setMode] = useState<"generate" | "remix">(initialMode);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [remixAction, setRemixAction] = useState<"cover" | "vocals" | "instrumental">("cover");

  // Form state
  const [formState, setFormState] = useState<MusicFormState>({
    topic: initialTopic,
    style: "Cinematic",
    title: "",
    vocalMode: "vocal-male",
    customLyrics: "",
    useCustomLyrics: false,
    model: "V5",
    styleWeight: 0.65,
    weirdnessConstraint: 0.5,
    negativeTags: "",
  });

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Update topic when initialTopic changes
  useEffect(() => {
    if (initialTopic) {
      setFormState(prev => ({ ...prev, topic: initialTopic }));
    }
  }, [initialTopic]);

  // Sync mode when initialMode changes (e.g., when modal opens)
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, open]);

  // Update lyrics from musicState
  useEffect(() => {
    if (musicState.lyrics && !formState.customLyrics) {
      setFormState(prev => ({ ...prev, customLyrics: musicState.lyrics || "" }));
    }
  }, [musicState.lyrics]);

  // Fetch credits on mount
  useEffect(() => {
    if (open && musicState.credits === null) {
      onRefreshCredits();
    }
  }, [open, musicState.credits, onRefreshCredits]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.src = "";
      }
    };
  }, [audioElement]);

  // Handle form field changes
  const updateField = useCallback(<K extends keyof MusicFormState>(
    field: K,
    value: MusicFormState[K]
  ) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  }, []);

  // Handle music generation
  const handleGenerate = useCallback(async () => {
    if (!formState.topic.trim()) return;

    // Use lyrics as prompt when not instrumental and lyrics are provided
    const isInstrumental = formState.vocalMode === "instrumental";
    const hasLyrics = formState.customLyrics.trim().length > 0;

    const config: Partial<SunoGenerationConfig> & { prompt: string } = {
      prompt: (!isInstrumental && hasLyrics)
        ? formState.customLyrics
        : formState.topic,
      model: formState.model,
      style: formState.style,
      styleWeight: formState.styleWeight,
      weirdnessConstraint: formState.weirdnessConstraint,
      instrumental: isInstrumental,
      vocalGender: formState.vocalMode === "vocal-male" ? "m" : formState.vocalMode === "vocal-female" ? "f" : undefined,
      customMode: true, // Always custom when using this advanced modal form
    };

    if (formState.title.trim()) {
      config.title = formState.title;
    }

    if (formState.negativeTags.trim()) {
      config.negativeTags = formState.negativeTags;
    }

    await onGenerateMusic(config);
  }, [formState, onGenerateMusic]);

  // Handle lyrics generation
  const handleGenerateLyrics = useCallback(async () => {
    if (!formState.topic.trim()) return;

    setIsGeneratingLyrics(true);
    try {
      await onGenerateLyrics(formState.topic);
    } finally {
      setIsGeneratingLyrics(false);
    }
  }, [formState.topic, onGenerateLyrics]);

  // Handle file upload
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      if (!onUploadAudio) throw new Error("Audio upload not supported");
      const url = await onUploadAudio(file);
      setUploadedUrl(url);
    } catch (error) {
      console.error("Upload failed", error);
      // Error state handling is implicit via musicState.error usually, 
      // but here we might want local feedback. 
      // Ideally we'd set a local error or reuse the parent's error mechanism if exposed settable.
      // For now just console.
    } finally {
      setIsUploading(false);
    }
  }, [onUploadAudio]);

  // Handle Remix Actions
  const handleRemix = useCallback(async () => {
    if (!uploadedUrl) return;

    if (remixAction === "cover") {
      // Cover requires: uploadUrl, customMode, instrumental, model, callBackUrl
      // If not instrumental: style, prompt (lyrics), title required
      // If instrumental: style, title required
      const isInstrumental = formState.vocalMode === "instrumental";

      if (!onUploadAndCover) throw new Error("Cover generation not supported");
      await onUploadAndCover({
        uploadUrl: uploadedUrl,
        style: formState.style,
        title: formState.title || "Cover",
        instrumental: isInstrumental,
        // prompt is the lyrics when not instrumental
        prompt: isInstrumental ? undefined : formState.customLyrics,
        model: formState.model || "V4_5ALL",
        styleWeight: formState.styleWeight,
        weirdnessConstraint: formState.weirdnessConstraint,
        negativeTags: formState.negativeTags,
        vocalGender: formState.vocalMode === "vocal-male" ? "m" : formState.vocalMode === "vocal-female" ? "f" : undefined,
      });
    } else if (remixAction === "vocals") {
      if (!onAddVocals) throw new Error("Adding vocals not supported");
      await onAddVocals({
        uploadUrl: uploadedUrl,
        prompt: formState.topic || "Add vocals",
        title: formState.title || "With Vocals",
        model: formState.model || "V4_5PLUS",
        style: formState.style,
      });
    } else if (remixAction === "instrumental") {
      if (!onAddInstrumental) throw new Error("Adding instrumental not supported");
      await onAddInstrumental({
        uploadUrl: uploadedUrl,
        prompt: formState.topic || "Instrumental version",
        title: formState.title || "Instrumental",
        model: formState.model || "V4_5PLUS",
        style: formState.style,
      });
    }
  }, [uploadedUrl, remixAction, onUploadAndCover, onAddVocals, onAddInstrumental, formState]);

  // Handle track playback
  const handlePlayTrack = useCallback((track: SunoGeneratedTrack) => {
    if (playingTrackId === track.id) {
      // Pause current track
      audioElement?.pause();
      setPlayingTrackId(null);
    } else {
      // Play new track
      if (audioElement) {
        audioElement.pause();
      }
      const audio = new Audio(track.audio_url);
      audio.onended = () => setPlayingTrackId(null);
      audio.play();
      setAudioElement(audio);
      setPlayingTrackId(track.id);
    }
  }, [playingTrackId, audioElement]);

  // Handle adding track to timeline
  const handleAddToTimeline = useCallback(() => {
    onAddToTimeline();
    const selectedTrack = musicState.generatedTracks.find(
      t => t.id === musicState.selectedTrackId
    );
    if (selectedTrack && onMusicGenerated) {
      onMusicGenerated(selectedTrack);
    }
    onClose();
  }, [onAddToTimeline, musicState.generatedTracks, musicState.selectedTrackId, onMusicGenerated, onClose]);

  // Calculate lyrics stats
  const lyricsStats = {
    chars: formState.customLyrics.length,
    lines: formState.customLyrics.split("\n").filter(l => l.trim()).length,
  };

  const isGenerating = musicState.isGenerating;
  const hasGeneratedTracks = musicState.generatedTracks.length > 0;
  const canGenerate = formState.topic.trim().length > 0 && !isGenerating;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !isGenerating && onClose()}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl bg-background border-border text-foreground max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Music className="w-5 h-5 text-primary" />
            Generate AI Music
            {/* Credit Display */}
            {musicState.credits !== null && musicState.credits >= 0 && (
              <span className={cn(
                "ml-auto text-sm font-normal flex items-center gap-1.5",
                musicState.credits < 10 ? "text-amber-500" : "text-muted-foreground"
              )}>
                {musicState.credits < 10 && (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                {musicState.credits} credits
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onRefreshCredits}
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </span>
            )}
            {musicState.credits === null && (
              <span className="ml-auto text-sm font-normal text-muted-foreground flex items-center gap-1.5">
                Credits: Unknown
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onRefreshCredits}
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Create custom AI-generated music for your video using Suno.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Error Display */}
          {musicState.error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-destructive">{musicState.error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* Progress Display */}
          {isGenerating && (
            <div className="space-y-3">
              <div className="flex justify-between text-xs uppercase tracking-wider">
                <span className="text-primary font-medium flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {musicState.status || "Generating..."}
                </span>
                <span className="text-muted-foreground">
                  {Math.round(musicState.progress)}%
                </span>
              </div>
              <Progress value={musicState.progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                This may take a few minutes. Please wait...
              </p>
            </div>
          )}

          {/* Generated Tracks Preview */}
          {hasGeneratedTracks && !isGenerating && (
            <div className="space-y-3">
              <Label className="text-muted-foreground">Generated Tracks</Label>
              <div className="space-y-2">
                {musicState.generatedTracks.map((track) => (
                  <div
                    key={track.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
                      musicState.selectedTrackId === track.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:border-primary/50"
                    )}
                    onClick={() => onSelectTrack(track.id)}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayTrack(track);
                      }}
                    >
                      {playingTrackId === track.id ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Play className="w-5 h-5" />
                      )}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{track.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {track.style && `${track.style} • `}
                        {Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, "0")}
                      </p>
                    </div>
                    {musicState.selectedTrackId === track.id && (
                      <Check className="w-5 h-5 text-primary shrink-0" />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={handleAddToTimeline}
                  disabled={!musicState.selectedTrackId}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Timeline
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate
                </Button>
              </div>
            </div>
          )}

          {/* Mode Switcher */}
          {!hasGeneratedTracks && !isGenerating && (
            <div className="flex bg-muted p-1 rounded-lg mb-4">
              <button
                onClick={() => setMode("generate")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all",
                  mode === "generate" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sparkles className="w-4 h-4" />
                Generate New
              </button>
              <button
                onClick={() => setMode("remix")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all",
                  mode === "remix" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <RefreshCw className="w-4 h-4" />
                Upload & Remix
              </button>
            </div>
          )}

          {/* Form Content */}
          {!hasGeneratedTracks && !isGenerating && mode === "generate" && (
            <>
              {/* Topic/Prompt Input */}
              <div className="space-y-2">
                <Label htmlFor="topic" className="text-muted-foreground">
                  Topic / Prompt <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="topic"
                  value={formState.topic}
                  onChange={(e) => updateField("topic", e.target.value)}
                  placeholder="Describe the music you want... e.g., 'An upbeat summer anthem about freedom and adventure'"
                  className="min-h-[80px] resize-none"
                />
              </div>

              {/* Style/Genre Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Style / Genre</Label>
                  <Select
                    value={formState.style}
                    onValueChange={(value) => updateField("style", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select style" />
                    </SelectTrigger>
                    <SelectContent>
                      {MUSIC_STYLES.map((style) => (
                        <SelectItem key={style} value={style}>
                          {style}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Title Input */}
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-muted-foreground">
                    Title (optional)
                  </Label>
                  <Input
                    id="title"
                    value={formState.title}
                    onChange={(e) => updateField("title", e.target.value)}
                    placeholder="Song title..."
                  />
                </div>
              </div>

              {/* Vocal Mode Selection */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">Vocal Mode</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "vocal-male", label: "Male Vocal", icon: Mic },
                    { id: "vocal-female", label: "Female Vocal", icon: Mic },
                    { id: "instrumental", label: "Instrumental", icon: MicOff },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => updateField("vocalMode", id as MusicFormState["vocalMode"])}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all text-sm",
                        formState.vocalMode === id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Instrumental Toggle */}
              <div className="flex items-center justify-between py-2">
                <Label htmlFor="instrumental-toggle" className="text-muted-foreground cursor-pointer">
                  Instrumental
                </Label>
                <Switch
                  id="instrumental-toggle"
                  checked={formState.vocalMode === "instrumental"}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      updateField("vocalMode", "instrumental");
                    } else {
                      updateField("vocalMode", "vocal-male");
                    }
                  }}
                />
              </div>

              {/* Lyrics Prompt - Shows when NOT instrumental */}
              {formState.vocalMode !== "instrumental" && (
                <div className="space-y-2">
                  <Label htmlFor="lyrics" className="text-muted-foreground">
                    Lyrics (Prompt) <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Textarea
                      id="lyrics"
                      value={formState.customLyrics}
                      onChange={(e) => updateField("customLyrics", e.target.value)}
                      placeholder="Enter your lyrics here...&#10;&#10;[Verse 1]&#10;Your lyrics go here...&#10;&#10;[Chorus]&#10;The catchy part..."
                      className="min-h-[150px] resize-none pb-10"
                    />
                    <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{lyricsStats.chars}/3000</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={handleGenerateLyrics}
                        disabled={isGeneratingLyrics || !formState.topic.trim()}
                      >
                        {isGeneratingLyrics ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 mr-1" />
                            Generate Lyrics
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Legacy Custom Lyrics Section - Hidden, keeping for backwards compatibility */}
              {/* Lyrics Section */}
              <div className="space-y-3 pt-2 border-t border-border/50 hidden">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground flex items-center gap-2">
                    Custom Lyrics
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formState.vocalMode === "instrumental" ? "Disabled for instrumental" : "Use custom lyrics"}
                    </span>
                    <Switch
                      checked={formState.useCustomLyrics}
                      onCheckedChange={(checked) => updateField("useCustomLyrics", checked)}
                      disabled={formState.vocalMode === "instrumental"}
                    />
                  </div>
                </div>

                {formState.useCustomLyrics && formState.vocalMode !== "instrumental" && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Textarea
                        value={formState.customLyrics}
                        onChange={(e) => updateField("customLyrics", e.target.value)}
                        placeholder="Enter your lyrics here..."
                        className="min-h-[120px] resize-none pb-8"
                      />
                      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{lyricsStats.chars} chars • {lyricsStats.lines} lines</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={handleGenerateLyrics}
                          disabled={isGeneratingLyrics || !formState.topic.trim()}
                        >
                          {isGeneratingLyrics ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3 mr-1" />
                              Generate Lyrics
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Remix / Upload Mode */}
          {!hasGeneratedTracks && !isGenerating && mode === "remix" && (
            <div className="space-y-5 animate-in fade-in cursor-default">

              {/* File Upload Area */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">1. Upload Audio Reference</Label>
                <div className="flex gap-2 items-center">
                  <Button variant="outline" className="relative overflow-hidden" disabled={isUploading}>
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                    {uploadedUrl ? "Change File" : "Upload MP3/WAV"}
                    <input
                      type="file"
                      accept="audio/*"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={handleFileUpload}
                    />
                  </Button>
                  {uploadedUrl && <span className="text-sm text-green-500 flex items-center gap-1"><Check className="w-3 h-3" /> Upload Complete</span>}
                </div>
                <p className="text-xs text-muted-foreground">Upload a track to cover, remix, or add vocals to. Supported: mp3, wav.</p>
              </div>

              {/* Action Selector */}
              {uploadedUrl && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">2. Select Action</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "cover", label: "Change Style", desc: "Cover/Remix" },
                      { id: "vocals", label: "Add Vocals", desc: "To Instrumental" },
                      { id: "instrumental", label: "Add Backing", desc: "To Vocals" }
                    ].map((act) => (
                      <button
                        key={act.id}
                        onClick={() => setRemixAction(act.id as any)}
                        className={cn(
                          "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all text-sm",
                          remixAction === act.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-primary/30"
                        )}
                      >
                        <span className="font-medium">{act.label}</span>
                        <span className="text-[10px] opacity-70">{act.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Dynamic Configuration based on Action */}
              {uploadedUrl && (
                <div className="space-y-4 pt-2 border-t border-white/5">
                  <Label className="text-muted-foreground">3. Configuration</Label>

                  {remixAction === "cover" && (
                    <div className="space-y-4">
                      {/* Style Selection */}
                      <div className="space-y-1">
                        <Label className="text-xs">Style of Music <span className="text-destructive">*</span></Label>
                        <Textarea
                          value={formState.style}
                          onChange={(e) => updateField("style", e.target.value)}
                          placeholder="Style: Khaleeji Tarab, Emotional, Maqam, Soulful Male Vocal, Acoustic, Qanun, Nay, Kamanja Takasim, Melancholic, Traditional Arabic Percussion, High Quality, Cinematic."
                          className="min-h-[80px] resize-none"
                        />
                        <p className="text-[10px] text-muted-foreground">{formState.style.length}/1000</p>
                      </div>

                      {/* Instrumental Toggle */}
                      <div className="flex items-center justify-between py-2">
                        <Label htmlFor="cover-instrumental" className="text-xs cursor-pointer">
                          Instrumental
                        </Label>
                        <Switch
                          id="cover-instrumental"
                          checked={formState.vocalMode === "instrumental"}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              updateField("vocalMode", "instrumental");
                            } else {
                              updateField("vocalMode", "vocal-male");
                            }
                          }}
                        />
                      </div>

                      {/* Lyrics Prompt - Shows when NOT instrumental */}
                      {formState.vocalMode !== "instrumental" && (
                        <div className="space-y-1">
                          <Label className="text-xs">Lyrics (Prompt) <span className="text-destructive">*</span></Label>
                          <div className="relative">
                            <Textarea
                              value={formState.customLyrics}
                              onChange={(e) => updateField("customLyrics", e.target.value)}
                              placeholder="[Verse 1]&#10;Your lyrics go here...&#10;&#10;[Chorus]&#10;The catchy part..."
                              className="min-h-[150px] resize-none pb-8"
                            />
                            <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-xs text-muted-foreground">
                              <span>{formState.customLyrics.length}/5000</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={handleGenerateLyrics}
                                disabled={isGeneratingLyrics || !formState.style.trim()}
                              >
                                {isGeneratingLyrics ? (
                                  <>
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    Generate Lyrics
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Title */}
                      <div className="space-y-1">
                        <Label className="text-xs">Title <span className="text-destructive">*</span></Label>
                        <Input
                          value={formState.title}
                          onChange={(e) => updateField("title", e.target.value)}
                          placeholder="Cover Title"
                        />
                        <p className="text-[10px] text-muted-foreground">{formState.title.length}/100</p>
                      </div>
                    </div>
                  )}

                  {(remixAction === "vocals" || remixAction === "instrumental") && (
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {remixAction === "vocals" ? "Vocal Description / Lyrics" : "Instrumental Description"}
                      </Label>
                      <Textarea
                        value={formState.topic}
                        onChange={(e) => updateField("topic", e.target.value)}
                        placeholder={remixAction === "vocals" ? "Describe the vocals or paste lyrics..." : "Describe the backing track style..."}
                      />
                    </div>
                  )}

                  {remixAction !== "cover" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Title (Optional)</Label>
                      <Input value={formState.title} onChange={(e) => updateField("title", e.target.value)} placeholder="Remix Title" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Advanced Options (Shared) */}
          {!hasGeneratedTracks && !isGenerating && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              {/* ... existing advanced options content ... */}
              {/* I need to make sure I don't break the layout. The original code had the dropdown here. */}
              {/* Since I am replacing the block, I should re-add the advanced options functionality or leave it flexible. 
                    The existing code block I'm replacing ENDS at the advanced options start usually?
                    Let's check the target replacement block. 
                */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <Settings2 className="w-4 h-4" />
                Advanced Options
                {showAdvanced ? (
                  <ChevronUp className="w-4 h-4 ml-auto" />
                ) : (
                  <ChevronDown className="w-4 h-4 ml-auto" />
                )}
              </button>

              {showAdvanced && (
                <div className="space-y-4 pl-6 animate-in slide-in-from-top-2">
                  {/* Model Version */}
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase">Model Version</Label>
                    <Select
                      value={formState.model}
                      onValueChange={(value) => updateField("model", value as SunoModel)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_VERSIONS.map((model) => (
                          <SelectItem key={model.value} value={model.value}>
                            <div className="flex flex-col">
                              <span>{model.label}</span>
                              <span className="text-xs text-muted-foreground">{model.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Style Weight */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-muted-foreground text-xs uppercase">Style Weight</Label>
                      <span className="text-xs font-mono">{formState.styleWeight.toFixed(2)}</span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.05}
                      value={[formState.styleWeight]}
                      onValueChange={([val]) => val !== undefined && updateField("styleWeight", val)}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      How strongly the style influences the generation
                    </p>
                  </div>

                  {/* Weirdness Constraint */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-muted-foreground text-xs uppercase">Creativity</Label>
                      <span className="text-xs font-mono">{formState.weirdnessConstraint.toFixed(2)}</span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.05}
                      value={[formState.weirdnessConstraint]}
                      onValueChange={([val]) => val !== undefined && updateField("weirdnessConstraint", val)}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Higher values produce more creative/experimental results
                    </p>
                  </div>

                  {/* Negative Tags */}
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase">Negative Tags</Label>
                    <Input
                      value={formState.negativeTags}
                      onChange={(e) => updateField("negativeTags", e.target.value)}
                      placeholder="e.g., Heavy Metal, Screaming, Distortion"
                      className="h-9"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Comma-separated styles to exclude from generation
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          {!hasGeneratedTracks && (
            <Button
              onClick={mode === "generate" ? handleGenerate : handleRemix}
              disabled={mode === "generate" ? !canGenerate : (!uploadedUrl || isUploading)}
              className="bg-primary hover:bg-primary/90"
            >
              {isGenerating || isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {mode === "generate" ? "Generate Music" : `Create ${remixAction === "cover" ? "Cover" : remixAction === "vocals" ? "Vocals" : "Instrumental"}`}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MusicGeneratorModal;
