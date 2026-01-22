/**
 * SleekProductionView Component
 * 
 * Streamlined production workflow using the new sleek UI components.
 * Progressive disclosure: Magic Input → Smart Defaults → Live Progress → Simple Preview
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Sleek components
import { MagicInput } from "./MagicInput";
import { SmartDefaults } from "./SmartDefaults";
import { LiveProgress } from "./LiveProgress";
import { SimplePreview } from "./SimplePreview";
import { QuickExport } from "./QuickExport";
import { AmbientBackground } from "./AmbientBackground";

// Existing components for advanced mode
import { SceneEditor } from "./SceneEditor";
import { VideoTimeline } from "./TimelineEditor";
import { VideoExportModal } from "./VideoExportModal";

// Hook and types
import { useVideoProductionRefactored } from "@/hooks/useVideoProductionRefactored";
import { AppState, SongData, SubtitleItem, ImagePrompt, GeneratedImage } from "@/types";
import type { VideoPurpose } from "@/constants";

interface SleekProductionViewProps {
  onBack: () => void;
  className?: string;
}

type ViewState = "input" | "defaults" | "generating" | "preview" | "advanced";

export function SleekProductionView({ onBack, className }: SleekProductionViewProps) {
  const {
    appState,
    topic,
    contentPlan,
    narrationSegments,
    sfxPlan,
    progress,
    error,
    targetDuration,
    videoPurpose,
    visualStyle,
    setTopic,
    setTargetDuration,
    setVideoPurpose,
    setVisualStyle,
    startProduction,
    updateScenes,
    playNarration,
    regenerateSceneNarration,
    reset,
    getAudioUrlMap,
    getVisualsMap,
  } = useVideoProductionRefactored();

  // View state management
  const [viewState, setViewState] = useState<ViewState>("input");
  const [showExportModal, setShowExportModal] = useState(false);
  const [showQuickExport, setShowQuickExport] = useState(false);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);

  // Timeline playback state
  const [timelineCurrentTime, setTimelineCurrentTime] = useState(0);
  const [timelineIsPlaying, setTimelineIsPlaying] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const timelineAudioRef = useRef<HTMLAudioElement | null>(null);

  // Handler for regenerating narration with loading state
  const handleRegenerateNarration = useCallback(async (sceneId: string) => {
    setRegeneratingSceneId(sceneId);
    try {
      await regenerateSceneNarration(sceneId);
    } finally {
      setRegeneratingSceneId(null);
    }
  }, [regenerateSceneNarration]);

  // Merged audio URL state for export
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
  const mergedAudioUrlRef = useRef<string | null>(null);

  // Merge all narration audio blobs into a single audio file
  useEffect(() => {
    const mergeAudio = async () => {
      if (!contentPlan || narrationSegments.length === 0) {
        setMergedAudioUrl(null);
        return;
      }

      // Cleanup previous merged URL
      if (mergedAudioUrlRef.current) {
        URL.revokeObjectURL(mergedAudioUrlRef.current);
        mergedAudioUrlRef.current = null;
      }

      try {
        // Collect audio blobs in scene order
        const orderedBlobs: Blob[] = [];

        for (const scene of contentPlan.scenes) {
          const narration = narrationSegments.find(n => n.sceneId === scene.id);
          if (narration && narration.audioBlob) {
            orderedBlobs.push(narration.audioBlob);
          }
        }

        if (orderedBlobs.length === 0) {
          setMergedAudioUrl(null);
          return;
        }

        // Merge audio blobs (WAV format from Gemini TTS at 24kHz, 16-bit mono)
        const sampleRate = 24000;
        const bytesPerSample = 2;
        const WAV_HEADER_SIZE = 44;

        // Calculate total PCM data size
        let totalPcmSize = 0;
        const pcmDataArrays: Uint8Array[] = [];

        for (const blob of orderedBlobs) {
          const arrayBuffer = await blob.arrayBuffer();
          const fullData = new Uint8Array(arrayBuffer);
          const pcmData = fullData.slice(WAV_HEADER_SIZE);
          pcmDataArrays.push(pcmData);
          totalPcmSize += pcmData.length;
        }

        // Create merged PCM buffer
        const mergedPcm = new Uint8Array(totalPcmSize);
        let offset = 0;
        for (const pcmData of pcmDataArrays) {
          mergedPcm.set(pcmData, offset);
          offset += pcmData.length;
        }

        // Create WAV file with header
        const wavBuffer = new ArrayBuffer(WAV_HEADER_SIZE + totalPcmSize);
        const view = new DataView(wavBuffer);

        const writeString = (offset: number, str: string) => {
          for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
          }
        };

        writeString(0, "RIFF");
        view.setUint32(4, 36 + totalPcmSize, true);
        writeString(8, "WAVE");
        writeString(12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * bytesPerSample, true);
        view.setUint16(32, bytesPerSample, true);
        view.setUint16(34, 16, true);
        writeString(36, "data");
        view.setUint32(40, totalPcmSize, true);

        new Uint8Array(wavBuffer, WAV_HEADER_SIZE).set(mergedPcm);

        const mergedBlob = new Blob([wavBuffer], { type: "audio/wav" });
        const url = URL.createObjectURL(mergedBlob);

        mergedAudioUrlRef.current = url;
        setMergedAudioUrl(url);

        console.log(`[SleekProductionView] Merged ${orderedBlobs.length} audio segments`);
      } catch (err) {
        console.error("[SleekProductionView] Failed to merge audio:", err);
        setMergedAudioUrl(null);
      }
    };

    mergeAudio();

    return () => {
      if (mergedAudioUrlRef.current) {
        URL.revokeObjectURL(mergedAudioUrlRef.current);
      }
    };
  }, [contentPlan, narrationSegments]);

  // Determine current view based on app state
  const currentView = useMemo(() => {
    if (viewState === "advanced") return "advanced";
    if (viewState === "defaults") return "defaults";

    if (appState === AppState.IDLE && !topic) return "input";
    if (appState === AppState.IDLE && topic && !contentPlan) return "defaults";

    if ([
      AppState.CONTENT_PLANNING,
      AppState.NARRATING,
      AppState.GENERATING_PROMPTS,
      AppState.VALIDATING,
    ].includes(appState)) {
      return "generating";
    }

    if (contentPlan && narrationSegments.length > 0) return "preview";
    if (contentPlan) return "generating";

    return "input";
  }, [appState, topic, contentPlan, narrationSegments, viewState]);

  // Map app state to progress stage
  const progressStage = useMemo(() => {
    switch (appState) {
      case AppState.CONTENT_PLANNING:
        return "planning";
      case AppState.NARRATING:
        return "narrating";
      case AppState.GENERATING_PROMPTS:
        return "visualizing";
      case AppState.VALIDATING:
        return "composing";
      default:
        return "planning";
    }
  }, [appState]);

  // Calculate progress percentage
  const progressPercent = useMemo(() => {
    if (!progress) return 0;

    const stageWeights = {
      planning: 20,
      narrating: 40,
      visualizing: 30,
      composing: 10,
    };

    let baseProgress = 0;
    const stages = ["planning", "narrating", "visualizing", "composing"];
    const currentIndex = stages.indexOf(progressStage);

    for (let i = 0; i < currentIndex; i++) {
      baseProgress += stageWeights[stages[i] as keyof typeof stageWeights];
    }

    const currentWeight = stageWeights[progressStage as keyof typeof stageWeights] || 25;
    const stageProgress = ((progress.currentScene || 0) / Math.max(progress.totalScenes || 1, 1)) * currentWeight;

    return Math.min(100, baseProgress + stageProgress);
  }, [progress, progressStage]);

  // Build scenes for LiveProgress
  // Note: We use a ref to avoid re-renders when visuals update during generation
  const visualsMapRef = useRef<Record<string, string>>({});
  
  // Update ref when visuals change (doesn't trigger re-render)
  useEffect(() => {
    visualsMapRef.current = getVisualsMap();
  }, [getVisualsMap]);

  const progressScenes = useMemo(() => {
    if (!contentPlan) return [];

    const visualsMap = visualsMapRef.current;

    return contentPlan.scenes.map((scene, index) => ({
      id: scene.id,
      name: scene.name,
      status: visualsMap[scene.id]
        ? "done" as const
        : (progress?.currentScene || 0) === index
          ? "working" as const
          : "pending" as const,
      thumbnail: visualsMap[scene.id],
      description: scene.visualDescription,
    }));
  }, [contentPlan, progress?.currentScene]);

  // Handlers
  const handleTopicSubmit = useCallback((newTopic: string) => {
    setTopic(newTopic);
    setViewState("defaults");
  }, [setTopic]);

  const handleConfirmDefaults = useCallback(() => {
    setViewState("generating");
    startProduction({ skipNarration: false });
  }, [startProduction]);

  const handleReset = useCallback(() => {
    reset();
    setViewState("input");
    // Reset timeline state
    setTimelineCurrentTime(0);
    setTimelineIsPlaying(false);
    setSelectedSceneId(null);
  }, [reset]);

  // Timeline playback handlers
  const handleTimelinePlayPause = useCallback(() => {
    const audio = timelineAudioRef.current;
    if (!audio) return;

    if (timelineIsPlaying) {
      audio.pause();
    } else {
      audio.play().catch(err => {
        console.error("[SleekProductionView] Audio play failed:", err);
      });
    }
    setTimelineIsPlaying(!timelineIsPlaying);
  }, [timelineIsPlaying]);

  const handleTimelineSeek = useCallback((time: number) => {
    const audio = timelineAudioRef.current;
    if (audio) {
      audio.currentTime = time;
    }
    setTimelineCurrentTime(time);
  }, []);

  const handleTimelineSceneSelect = useCallback((sceneId: string) => {
    setSelectedSceneId(sceneId);

    // Seek to the start of the selected scene
    if (contentPlan) {
      let sceneStartTime = 0;
      for (const scene of contentPlan.scenes) {
        if (scene.id === sceneId) break;
        const narration = narrationSegments.find(n => n.sceneId === scene.id);
        sceneStartTime += narration?.audioDuration || scene.duration;
      }
      handleTimelineSeek(sceneStartTime);
    }
  }, [contentPlan, narrationSegments, handleTimelineSeek]);

  // Sync timeline audio with playback state
  useEffect(() => {
    if (!mergedAudioUrl || viewState !== "advanced") return;

    // Create audio element for timeline playback
    const audio = new Audio(mergedAudioUrl);
    timelineAudioRef.current = audio;

    const handleTimeUpdate = () => {
      setTimelineCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setTimelineIsPlaying(false);
      setTimelineCurrentTime(0);
    };

    const handlePlay = () => setTimelineIsPlaying(true);
    const handlePause = () => setTimelineIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      timelineAudioRef.current = null;
    };
  }, [mergedAudioUrl, viewState]);

  // Calculate total duration from narration
  const totalDuration = useMemo(() => {
    if (narrationSegments.length === 0) return contentPlan?.totalDuration || 60;
    return narrationSegments.reduce((sum, seg) => sum + seg.audioDuration, 0);
  }, [narrationSegments, contentPlan]);

  // Get first visual for preview thumbnail
  const previewThumbnail = useMemo(() => {
    const visualsMap = getVisualsMap();
    const firstVisual = Object.values(visualsMap).find(v => v);
    return firstVisual || undefined;
  }, [getVisualsMap]);

  // Build exportSongData for VideoExportModal
  const exportSongData = useMemo((): SongData | null => {
    if (!contentPlan || narrationSegments.length === 0 || !mergedAudioUrl) return null;

    const visualsMap = getVisualsMap();

    // Build subtitles from narration segments
    let currentTime = 0;
    const parsedSubtitles: SubtitleItem[] = [];
    let subtitleId = 1;

    contentPlan.scenes.forEach((scene) => {
      const narration = narrationSegments.find(n => n.sceneId === scene.id);
      const text = narration?.transcript || scene.narrationScript;
      const duration = narration?.audioDuration || scene.duration;

      parsedSubtitles.push({
        id: subtitleId++,
        startTime: currentTime,
        endTime: currentTime + duration,
        text: text,
      });
      currentTime += duration;
    });

    // Build prompts from scenes
    const prompts: ImagePrompt[] = contentPlan.scenes.map((scene, index) => ({
      id: scene.id,
      text: scene.visualDescription,
      mood: scene.emotionalTone,
      timestampSeconds: parsedSubtitles[index]?.startTime || 0,
    }));

    // Build generated images from visuals map
    const generatedImages: GeneratedImage[] = [];
    Object.entries(visualsMap as Record<string, string>).forEach(([sceneId, url]) => {
      if (url) {
        generatedImages.push({
          promptId: sceneId,
          imageUrl: url,
          type: url.includes('.mp4') || url.includes('video') ? 'video' : 'image',
        });
      }
    });

    return {
      fileName: contentPlan.title || 'production-video',
      audioUrl: mergedAudioUrl,
      srtContent: '',
      parsedSubtitles,
      prompts,
      generatedImages,
    };
  }, [contentPlan, narrationSegments, getVisualsMap, mergedAudioUrl]);

  // Calculate scene timings for SFX mixing
  const sceneTimings = useMemo(() => {
    if (!contentPlan || narrationSegments.length === 0) return [];

    let currentTime = 0;
    return contentPlan.scenes.map((scene) => {
      const narration = narrationSegments.find(n => n.sceneId === scene.id);
      const duration = narration?.audioDuration || scene.duration;
      const timing = {
        sceneId: scene.id,
        startTime: currentTime,
        duration: duration,
      };
      currentTime += duration;
      return timing;
    });
  }, [contentPlan, narrationSegments]);

  // Handle export with preset config
  const handleExport = useCallback(async (
    config: { presetId: string; width: number; height: number; orientation: "landscape" | "portrait"; quality: string },
    onProgress?: (percent: number) => void
  ) => {
    if (!exportSongData) {
      throw new Error("No content available for export. Please wait for generation to complete.");
    }

    console.log("[SleekProductionView] Exporting with config:", config);

    // Import the export function dynamically to avoid circular deps
    const { exportVideoClientSide } = await import("@/services/ffmpeg/exporters");

    // Build export config from preset
    const exportConfig = {
      orientation: config.orientation,
      useModernEffects: true,
      transitionType: "dissolve" as const,
      transitionDuration: 1.5,
      contentMode: "story" as const,
      sfxPlan: sfxPlan,
      sceneTimings: sceneTimings,
    };

    // Run the actual export with progress callback
    const blob = await exportVideoClientSide(
      exportSongData,
      (progress) => {
        console.log(`[SleekProductionView] Export progress: ${progress.stage} ${progress.progress}%`);
        onProgress?.(progress.progress);
      },
      exportConfig
    );

    // Trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${contentPlan?.title || "video"}-${config.presetId}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("[SleekProductionView] Export complete!");
  }, [exportSongData, sfxPlan, sceneTimings, contentPlan]);

  return (
    <div className={cn(
      "min-h-screen relative overflow-hidden",
      className
    )}>
      {/* Ambient Background */}
      <AmbientBackground />

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={onBack}
            className="gap-2 text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          {currentView === "preview" && (
            <Button
              variant="ghost"
              onClick={() => setViewState("advanced")}
              className="gap-2 text-slate-400 hover:text-white"
            >
              <Settings2 className="w-4 h-4" />
              Advanced Editor
            </Button>
          )}

          {currentView === "advanced" && (
            <Button
              variant="ghost"
              onClick={() => setViewState("preview")}
              className="gap-2 text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              Simple View
            </Button>
          )}
        </div>
      </header>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="relative z-10 max-w-2xl mx-auto px-6 pt-4"
          >
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
              <button
                onClick={handleReset}
                className="ml-4 underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center min-h-[calc(100vh-4rem)] p-6">
        <AnimatePresence mode="wait">
          {/* Step 1: Magic Input */}
          {currentView === "input" && (
            <motion.div
              key="input"
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              <MagicInput
                onAudioFile={(file, ratio) => {
                  // For audio files, switch to visualizer mode
                  console.log("[SleekProductionView] Audio file:", file.name, ratio);
                  onBack(); // Go back to handle in visualizer mode
                }}
                onYoutubeUrl={(url, ratio) => {
                  console.log("[SleekProductionView] YouTube URL:", url, ratio);
                  onBack();
                }}
                onTopicSubmit={handleTopicSubmit}
                onLoadDemo={() => {
                  setTopic("A mystical journey through ancient Egyptian temples at sunset");
                  setViewState("defaults");
                }}
              />
            </motion.div>
          )}

          {/* Step 2: Smart Defaults */}
          {currentView === "defaults" && (
            <motion.div
              key="defaults"
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              <SmartDefaults
                topic={topic}
                suggestedStyle={visualStyle || "Cinematic"}
                suggestedPurpose={videoPurpose as VideoPurpose}
                suggestedDuration={targetDuration}
                suggestedAudience="General audience"
                onStyleChange={setVisualStyle}
                onPurposeChange={setVideoPurpose}
                onDurationChange={setTargetDuration}
                onAudienceChange={() => { }}
                onConfirm={handleConfirmDefaults}
                isGenerating={false}
              />
            </motion.div>
          )}

          {/* Step 3: Live Progress */}
          {currentView === "generating" && (
            <motion.div
              key="generating"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              <LiveProgress
                stage={progressStage as any}
                progress={progressPercent}
                currentScene={progress?.currentScene || 0}
                totalScenes={progress?.totalScenes || contentPlan?.scenes.length || 0}
                scenes={progressScenes}
                currentDescription={
                  contentPlan?.scenes[progress?.currentScene || 0]?.visualDescription
                }
              />
            </motion.div>
          )}

          {/* Step 4: Simple Preview */}
          {currentView === "preview" && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              <SimplePreview
                thumbnailUrl={previewThumbnail}
                audioUrl={mergedAudioUrl || undefined}
                title={contentPlan?.title || "Your Video"}
                duration={totalDuration}
                scenes={contentPlan?.scenes.map(scene => ({
                  id: scene.id,
                  imageUrl: getVisualsMap()[scene.id],
                  duration: narrationSegments.find(n => n.sceneId === scene.id)?.audioDuration || scene.duration,
                }))}
                onExport={() => setShowQuickExport(true)}
                onRegenerate={handleReset}
                onFineTune={() => setViewState("advanced")}
              />
            </motion.div>
          )}

          {/* Advanced Mode: Full Editor */}
          {currentView === "advanced" && contentPlan && (
            <motion.div
              key="advanced"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-6xl mx-auto space-y-6"
            >
              {/* Timeline */}
              <VideoTimeline
                scenes={contentPlan.scenes}
                visuals={getVisualsMap()}
                narrationSegments={narrationSegments}
                sfxPlan={sfxPlan}
                currentTime={timelineCurrentTime}
                duration={totalDuration}
                isPlaying={timelineIsPlaying}
                onPlayPause={handleTimelinePlayPause}
                onSeek={handleTimelineSeek}
                onSceneSelect={handleTimelineSceneSelect}
                selectedSceneId={selectedSceneId}
                projectName={contentPlan.title}
              />

              {/* Scene Editor */}
              <SceneEditor
                scenes={contentPlan.scenes}
                onChange={updateScenes}
                onPlayNarration={narrationSegments.length > 0 ? playNarration : undefined}
                onRegenerateNarration={handleRegenerateNarration}
                regeneratingSceneId={regeneratingSceneId}
                visuals={getVisualsMap()}
                narrationUrls={getAudioUrlMap()}
              />

              {/* Export Button */}
              <div className="flex justify-center pt-4">
                <Button
                  onClick={() => setShowExportModal(true)}
                  size="lg"
                  className="h-14 px-8 rounded-xl font-bold bg-linear-to-r from-cyan-500 to-blue-500 hover-glow"
                >
                  Export Final Video
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Quick Export Modal */}
      <QuickExport
        isOpen={showQuickExport}
        onClose={() => setShowQuickExport(false)}
        onExport={handleExport}
        videoTitle={contentPlan?.title}
        duration={totalDuration}
      />

      {/* Full Export Modal (for advanced mode) */}
      {showExportModal && exportSongData && (
        <VideoExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          songData={exportSongData}
          contentMode="story"
          sfxPlan={sfxPlan}
          sceneTimings={sceneTimings}
        />
      )}
    </div>
  );
}

export default SleekProductionView;
