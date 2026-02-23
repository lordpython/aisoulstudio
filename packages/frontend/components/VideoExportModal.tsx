import React, { useEffect, useState } from "react";
import { SongData, TransitionType } from "@/types";
import {
  Download,
  Film,
  AlertCircle,
  Settings,
  Smartphone,
  Monitor,
  Cloud,
  Laptop,
  Blend,
  ZoomIn,
  ArrowRightLeft,
  CircleSlash,
  Sparkles,
  Type,
  Activity,
  Volume2,
} from "lucide-react";
import {
  exportVideoWithFFmpeg,
  exportVideoClientSide,
  ExportProgress,
  ExportConfig,
} from "@/services/ffmpeg";
import { VideoSFXPlan } from "@/types";
import { SceneAudioInfo } from "@/services/audioMixerService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, isRTL } from "@/lib/utils";

interface VideoExportModalProps {
  songData: SongData;
  onClose: () => void;
  isOpen: boolean;
  /** Content mode - "music" includes visualizer, "story" skips it */
  contentMode?: "music" | "story";
  /** SFX plan with audio URLs for mixing */
  sfxPlan?: VideoSFXPlan | null;
  /** Scene timing information for SFX mixing */
  sceneTimings?: SceneAudioInfo[];
}

/**
 * Detect if the song's lyrics are primarily RTL (Arabic, Hebrew, etc.)
 */
function detectLyricsRTL(songData: SongData): boolean {
  if (!songData.parsedSubtitles || songData.parsedSubtitles.length === 0) {
    return false;
  }
  // Check first few subtitles to determine primary text direction
  const samplesToCheck = Math.min(5, songData.parsedSubtitles.length);
  let rtlCount = 0;
  for (let i = 0; i < samplesToCheck; i++) {
    const subtitle = songData.parsedSubtitles[i];
    if (subtitle && isRTL(subtitle.text)) {
      rtlCount++;
    }
  }
  // If majority of samples are RTL, consider the content RTL
  return rtlCount > samplesToCheck / 2;
}

export const VideoExportModal: React.FC<VideoExportModalProps> = ({
  songData,
  onClose,
  isOpen,
  contentMode = "music",
  sfxPlan,
  sceneTimings,
}) => {
  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    stage: "loading",
    progress: 0,
    message: "Initializing...",
  });
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-detect RTL for text animation direction
  const isLyricsRTL = detectLyricsRTL(songData);

  // Check if SFX mixing is available
  const hasSFX = !!(sfxPlan && sceneTimings && sceneTimings.length > 0 &&
    sfxPlan.scenes.some(s => s.ambientTrack?.audioUrl));

  // Configuration State
  const [config, setConfig] = useState<ExportConfig>({
    orientation: "landscape",
    useModernEffects: true,
    syncOffsetMs: -50,
    fadeOutBeforeCut: true,
    wordLevelHighlight: true,
    contentMode: contentMode,
    transitionType: "dissolve",
    transitionDuration: 1.5,
    visualizerConfig: {
      enabled: true,
      opacity: 0.15,
      maxHeightRatio: 0.25,
      zIndex: 1,
      barWidth: 3,
      barGap: 2,
      colorScheme: "cyan-purple",
    },
    textAnimationConfig: {
      revealDirection: isLyricsRTL ? "rtl" : "ltr", // Auto-detect based on lyrics
      revealDuration: 0.3,
      wordReveal: true,
    },
    // SFX config
    sfxPlan: sfxPlan,
    sceneTimings: sceneTimings,
    sfxMasterVolume: 1.0,
    musicMasterVolume: 0.5,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [useCloudRender, setUseCloudRender] = useState(true); // Default to server-side for faster encoding
  const [enableSFX, setEnableSFX] = useState(hasSFX);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
    };
  }, [videoBlobUrl]);

  const startExport = async () => {
    // Validate audio URL before starting export
    if (!songData.audioUrl) {
      setError("No audio available for export. Please wait for audio generation to complete.");
      return;
    }

    setIsExporting(true);
    setError(null);
    setVideoBlobUrl(null);

    try {
      // Build export config with SFX if enabled
      const exportConfig: ExportConfig = {
        ...config,
        // Only include SFX data if enabled
        sfxPlan: enableSFX ? sfxPlan : null,
        sceneTimings: enableSFX ? sceneTimings : undefined,
      };

      const exportFn = useCloudRender
        ? exportVideoWithFFmpeg
        : exportVideoClientSide;
      const result = await exportFn(
        songData,
        (progress) => {
          setExportProgress(progress);
        },
        exportConfig,
      );

      const url = URL.createObjectURL(result.blob);
      setVideoBlobUrl(url);
    } catch (e: any) {
      console.error("Export failed:", e);
      setError(e.message || "Export failed. Please try again.");
      setIsExporting(false);
    }
  };

  const handleDownload = () => {
    if (videoBlobUrl) {
      const a = document.createElement("a");
      a.href = videoBlobUrl;
      a.download = `${songData.fileName.replace(/\.[^/.]+$/, "")}-lyriclens-${config.orientation}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const isComplete = exportProgress.stage === "complete" && videoBlobUrl;

  const getStageLabel = () => {
    switch (exportProgress.stage) {
      case "loading":
        return "Loading FFmpeg";
      case "preparing":
        return "Preparing Assets";
      case "rendering":
        return "Rendering Frames";
      case "encoding":
        return "Encoding Video";
      case "complete":
        return "Complete";
      default:
        return "Processing";
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !isExporting && onClose()}
    >
      <DialogContent className="sm:max-w-md md:max-w-lg glass-panel border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Film className="w-5 h-5 text-primary" />
            {isComplete
              ? "Video Ready!"
              : isExporting
                ? "Exporting Video"
                : "Export Settings"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {!isExporting &&
              !isComplete &&
              "Customize your video export settings."}
            {isExporting &&
              !isComplete &&
              "Please wait while we render your video."}
            {isComplete && "Your video has been successfully generated."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {error ? (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 text-center mb-6">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
              <p className="text-destructive mb-4">{error}</p>
              <Button variant="destructive" onClick={() => setError(null)}>
                Try Again
              </Button>
            </div>
          ) : isExporting && !isComplete ? (
            <div className="space-y-6">
              <div className="flex justify-between text-xs uppercase tracking-wider">
                <span className="text-primary font-medium">
                  {getStageLabel()}
                </span>
                <span className="text-muted-foreground">
                  {Math.round(exportProgress.progress)}%
                </span>
              </div>

              <Progress value={exportProgress.progress} className="h-2" />

              <p className="text-sm text-muted-foreground text-center animate-pulse">
                {exportProgress.message}
              </p>

              <div className="grid grid-cols-5 gap-1 pt-2">
                {[
                  "loading",
                  "preparing",
                  "rendering",
                  "encoding",
                  "complete",
                ].map((stage, i) => {
                  const stages = [
                    "loading",
                    "preparing",
                    "rendering",
                    "encoding",
                    "complete",
                  ];
                  const currentIdx = stages.indexOf(exportProgress.stage);
                  const stageIdx = stages.indexOf(stage);
                  const isActive = stageIdx <= currentIdx;

                  return (
                    <div
                      key={stage}
                      className="flex flex-col items-center gap-1"
                    >
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full transition-colors",
                          isActive ? "bg-primary" : "bg-muted",
                        )}
                      />
                      <span
                        className={cn(
                          "text-[9px] capitalize",
                          isActive ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {stage}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : isComplete ? (
            <div className="space-y-6">
              {videoBlobUrl && (
                <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-border">
                  <video
                    src={videoBlobUrl}
                    controls
                    className="w-full h-full"
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleDownload}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold border-0"
                >
                  <Download className="mr-2 h-4 w-4" /> Download MP4
                </Button>
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setIsExporting(false);
                    setExportProgress({
                      stage: "loading",
                      progress: 0,
                      message: "Initializing...",
                    });
                    setVideoBlobUrl(null);
                  }}
                >
                  Export Another Version
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Render Engine */}
              <div className="space-y-3">
                <Label className="text-muted-foreground">Render Engine</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Card
                    className={cn(
                      "cursor-pointer transition-all border-white/10 hover:bg-white/5",
                      !useCloudRender && "border-primary bg-primary/10",
                    )}
                    onClick={() => setUseCloudRender(false)}
                  >
                    <CardContent className="flex flex-col items-center justify-center p-4 gap-2">
                      <Laptop
                        className={cn(
                          "h-6 w-6",
                          !useCloudRender
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      />
                      <div className="text-center">
                        <span className="text-sm font-medium">Browser</span>
                        <span className="text-[10px] text-muted-foreground block">
                          Private, No Upload
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card
                    className={cn(
                      "cursor-pointer transition-all border-white/10 hover:bg-white/5",
                      useCloudRender && "border-primary bg-primary/10",
                    )}
                    onClick={() => setUseCloudRender(true)}
                  >
                    <CardContent className="flex flex-col items-center justify-center p-4 gap-2">
                      <Cloud
                        className={cn(
                          "h-6 w-6",
                          useCloudRender
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      />
                      <div className="text-center">
                        <span className="text-sm font-medium">Cloud</span>
                        <span className="text-[10px] text-muted-foreground block">
                          Faster for 4K
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Orientation */}
              <div className="space-y-3">
                <Label className="text-muted-foreground">
                  Video Orientation
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <Card
                    className={cn(
                      "cursor-pointer transition-all border-white/10 hover:bg-white/5",
                      config.orientation === "landscape" &&
                      "border-primary bg-primary/10",
                    )}
                    onClick={() =>
                      setConfig({ ...config, orientation: "landscape" })
                    }
                  >
                    <CardContent className="flex flex-col items-center justify-center p-4 gap-2">
                      <Monitor
                        className={cn(
                          "h-6 w-6",
                          config.orientation === "landscape"
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      />
                      <span className="text-sm font-medium">
                        Landscape (16:9)
                      </span>
                    </CardContent>
                  </Card>
                  <Card
                    className={cn(
                      "cursor-pointer transition-all border-white/10 hover:bg-white/5",
                      config.orientation === "portrait" &&
                      "border-primary bg-primary/10",
                    )}
                    onClick={() =>
                      setConfig({ ...config, orientation: "portrait" })
                    }
                  >
                    <CardContent className="flex flex-col items-center justify-center p-4 gap-2">
                      <Smartphone
                        className={cn(
                          "h-6 w-6",
                          config.orientation === "portrait"
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      />
                      <span className="text-sm font-medium">
                        Portrait (9:16)
                      </span>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Visual Style */}
              <div className="flex items-center justify-between space-x-2 p-3 rounded-lg border border-white/10 bg-white/5">
                <div className="space-y-0.5">
                  <Label className="text-base text-foreground flex items-center gap-2">
                    <Settings className="w-4 h-4 text-primary" /> Cinematic
                    Effects
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Ken Burns zoom, smooth transitions, glow
                  </p>
                </div>
                <Switch
                  checked={config.useModernEffects}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, useModernEffects: checked })
                  }
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              {/* Transition Type */}
              <div className="space-y-3">
                <Label className="text-muted-foreground">Scene Transitions</Label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { value: "none", label: "Cut", icon: CircleSlash },
                    { value: "fade", label: "Fade", icon: Sparkles },
                    { value: "dissolve", label: "Dissolve", icon: Blend },
                    { value: "zoom", label: "Zoom", icon: ZoomIn },
                    { value: "slide", label: "Slide", icon: ArrowRightLeft },
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setConfig({ ...config, transitionType: value as TransitionType })}
                      className={cn(
                        "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all text-xs",
                        config.transitionType === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      <Icon size={16} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-border/50">
                <Label className="text-muted-foreground">Lyric Animation</Label>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">
                      Sync Offset
                    </span>
                    <span className="text-xs text-primary font-mono">
                      {config.syncOffsetMs}ms
                    </span>
                  </div>
                  <Slider
                    min={-200}
                    max={100}
                    step={10}
                    value={[config.syncOffsetMs]}
                    onValueChange={(vals) =>
                      setConfig({ ...config, syncOffsetMs: vals[0] ?? -50 })
                    }
                    className="py-2"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Negative values make lyrics appear earlier.
                  </p>
                </div>

                <div className="flex items-center justify-between space-x-2">
                  <div className="space-y-0.5">
                    <Label className="text-sm text-muted-foreground">
                      Word-by-Word Karaoke
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Highlight each word as it's sung
                    </p>
                  </div>
                  <Switch
                    checked={config.wordLevelHighlight}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, wordLevelHighlight: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between space-x-2">
                  <div className="space-y-0.5">
                    <Label className="text-sm text-muted-foreground">
                      Fade Before Scene Change
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Lyrics fade out before transitions
                    </p>
                  </div>
                  <Switch
                    checked={config.fadeOutBeforeCut}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, fadeOutBeforeCut: checked })
                    }
                  />
                </div>

                {/* NEW: Visualizer Settings */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <Activity className="w-4 h-4" /> Audio Visualizer
                    </Label>
                    <Switch
                      checked={config.visualizerConfig?.enabled}
                      onCheckedChange={(checked) =>
                        setConfig({
                          ...config,
                          visualizerConfig: config.visualizerConfig ? {
                            ...config.visualizerConfig,
                            enabled: checked,
                          } : undefined,
                        })
                      }
                    />
                  </div>

                  {config.visualizerConfig?.enabled && (
                    <div className="space-y-4 pl-6">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-[10px] text-muted-foreground uppercase">Opacity</span>
                          <span className="text-[10px] font-mono">{Math.round((config.visualizerConfig?.opacity ?? 0.15) * 100)}%</span>
                        </div>
                        <Slider
                          min={0.05}
                          max={0.5}
                          step={0.01}
                          value={[config.visualizerConfig?.opacity ?? 0.15]}
                          onValueChange={([val]) =>
                            setConfig({
                              ...config,
                              visualizerConfig: config.visualizerConfig ? { ...config.visualizerConfig, opacity: val ?? 0.15 } : undefined,
                            })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-[10px] text-muted-foreground uppercase">Max Height</span>
                          <span className="text-[10px] font-mono">{Math.round((config.visualizerConfig?.maxHeightRatio ?? 0.25) * 100)}%</span>
                        </div>
                        <Slider
                          min={0.1}
                          max={0.5}
                          step={0.05}
                          value={[config.visualizerConfig?.maxHeightRatio ?? 0.25]}
                          onValueChange={([val]) =>
                            setConfig({
                              ...config,
                              visualizerConfig: config.visualizerConfig ? { ...config.visualizerConfig, maxHeightRatio: val ?? 0.25 } : undefined,
                            })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <span className="text-[10px] text-muted-foreground uppercase block mb-1">Color Scheme</span>
                        <div className="grid grid-cols-3 gap-2">
                          {(["cyan-purple", "rainbow", "monochrome"] as const).map((scheme) => (
                            <Button
                              key={scheme}
                              variant="glass"
                              size="sm"
                              className={cn(
                                "text-[10px] h-7 px-2",
                                config.visualizerConfig?.colorScheme === scheme && "border-primary bg-primary/10"
                              )}
                              onClick={() =>
                                setConfig({
                                  ...config,
                                  visualizerConfig: config.visualizerConfig ? { ...config.visualizerConfig, colorScheme: scheme } : undefined,
                                })
                              }
                            >
                              {scheme.replace("-", " ")}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* NEW: Text Animation Settings */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <Label className="text-muted-foreground flex items-center gap-2">
                    <Type className="w-4 h-4" /> Text Reveal Animation
                  </Label>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-muted-foreground uppercase">Direction</span>
                      <Select
                        value={config.textAnimationConfig?.revealDirection}
                        onValueChange={(val: "ltr" | "rtl" | "center-out" | "center-in") =>
                          setConfig({
                            ...config,
                            textAnimationConfig: config.textAnimationConfig ? { ...config.textAnimationConfig, revealDirection: val } : undefined,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ltr">Left to Right</SelectItem>
                          <SelectItem value="rtl">Right to Left</SelectItem>
                          <SelectItem value="center-out">Center Out</SelectItem>
                          <SelectItem value="center-in">Center In</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] text-muted-foreground uppercase">Speed (s)</span>
                      <div className="flex items-center gap-2">
                        <Slider
                          min={0.1}
                          max={1.0}
                          step={0.1}
                          value={[config.textAnimationConfig?.revealDuration || 0.3]}
                          onValueChange={([val]) =>
                            setConfig({
                              ...config,
                              textAnimationConfig: config.textAnimationConfig ? { ...config.textAnimationConfig, revealDuration: val ?? 0.3 } : undefined,
                            })
                          }
                          className="flex-1"
                        />
                        <span className="text-[10px] font-mono w-6">
                          {config.textAnimationConfig?.revealDuration}s
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SFX Audio Mixing Settings */}
                {hasSFX && (
                  <div className="space-y-4 pt-4 border-t border-border/50">
                    <div className="flex items-center justify-between">
                      <Label className="text-muted-foreground flex items-center gap-2">
                        <Volume2 className="w-4 h-4" /> Ambient SFX
                      </Label>
                      <Switch
                        checked={enableSFX}
                        onCheckedChange={setEnableSFX}
                      />
                    </div>

                    {enableSFX && (
                      <div className="space-y-4 pl-6">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-[10px] text-muted-foreground uppercase">SFX Volume</span>
                            <span className="text-[10px] font-mono">{Math.round((config.sfxMasterVolume || 1.0) * 100)}%</span>
                          </div>
                          <Slider
                            min={0}
                            max={1}
                            step={0.05}
                            value={[config.sfxMasterVolume || 1.0]}
                            onValueChange={([val]) =>
                              setConfig({ ...config, sfxMasterVolume: val ?? 1.0 })
                            }
                          />
                        </div>

                        {sfxPlan?.backgroundMusic && (
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-[10px] text-muted-foreground uppercase">Music Volume</span>
                              <span className="text-[10px] font-mono">{Math.round((config.musicMasterVolume || 0.5) * 100)}%</span>
                            </div>
                            <Slider
                              min={0}
                              max={1.0}
                              step={0.05}
                              value={[config.musicMasterVolume || 0.5]}
                              onValueChange={([val]) =>
                                setConfig({ ...config, musicMasterVolume: val ?? 0.5 })
                              }
                            />
                          </div>
                        )}

                        <p className="text-[10px] text-muted-foreground">
                          🎵 {sfxPlan?.scenes.filter(s => s.ambientTrack?.audioUrl).length || 0} scene sounds will be mixed
                          {sfxPlan?.backgroundMusic?.audioUrl && " + background music"}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {!isExporting && !isComplete && (
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold border-0 h-11"
              onClick={startExport}
            >
              <Film className="mr-2 h-4 w-4" /> Start Export
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
