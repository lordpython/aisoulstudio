/**
 * AIStudioView - Modern AI-First Video Creation Interface
 * 
 * A unified interface where AI conversation is the primary interaction method.
 * Integrated with the "Invisible Interface" design system: Glassmorphism, Ambient Backgrounds.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Sparkles,
  Video,
  Music,
  Image as ImageIcon,
  Download,
  Play,
  Pause,
  RotateCcw,
  Wand2,
  Loader2,
  CheckCircle2,
  BarChart3,
  Edit3,
  Music as MusicIcon,
  X,
  Layers,
  Upload,
  Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVideoProductionRefactored } from "@/hooks/useVideoProductionRefactored";
import { AppState } from "@/types";
import { QuickExport } from "./QuickExport";
import { studioAgent, type AgentResponse } from "@/services/ai/studioAgent";
import { AmbientBackground } from "./AmbientBackground";
import QualityDashboard from "./QualityDashboard";
import SceneEditor from "./SceneEditor";
import MusicGeneratorModal from "./MusicGeneratorModal";
import { GraphiteTimeline } from "./TimelineEditor";
import { useAppStore, type Message } from "@/stores";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

// Import preset type from HomeView
import type { CreationPreset } from "./HomeView";

interface AIStudioViewProps {
  onBack?: () => void;
  className?: string;
  initialPreset?: CreationPreset | null;
}

interface ChatMessage extends Message {
  status?: "thinking" | "generating" | "complete" | "error";
  progress?: number;
  videoReady?: boolean;
}

export function AIStudioView({ onBack, className, initialPreset }: AIStudioViewProps) {
  const {
    appState,
    topic,
    contentPlan,
    narrationSegments,
    sfxPlan,
    progress,
    error,
    targetDuration,
    visualStyle,
    setTopic,
    setTargetDuration,
    setVideoPurpose,
    setVisualStyle,
    startProduction,
    reset,
    getVisualsMap,
    visualsMap, // Use memoized map directly
    getAudioUrlMap,
    updateScenes,
    generateMusic,
    generateLyrics,
    musicState,
    selectTrack,
    addMusicToTimeline,
    refreshCredits,
    regenerateSceneNarration,
    playNarration,
    qualityReport,
    playingSceneId,
    createMusicVideo,
    generateCover,
    addVocals,
    uploadAudio,
    addInstrumental,
    uploadAndCover,
    // NEW: SFX & Freesound
    browseSfx,
    getSfxCategories,
    previewSfx,
    isSfxAvailable,
    // NEW: Audio Mixing
    mixAudio,
    // NEW: Prompt Quality Tools
    checkPromptQuality,
    improvePrompt,
    // NEW: Quality History
    getQualityHistoryData,
    getQualityTrend,
    exportQualityReport,
    getQualitySummaryText,
    // NEW: Camera & Lighting Preferences
    preferredCameraAngle,
    preferredLightingMood,
    setPreferredCameraAngle,
    setPreferredLightingMood,
    getCameraAngles,
    getLightingMoods,
  } = useVideoProductionRefactored();

  // App Store - Chat & UI State (persistent)
  const storeMessages = useAppStore((s) => s.messages);
  const addMessage = useAppStore((s) => s.addMessage);
  const clearMessages = useAppStore((s) => s.clearMessages);
  const updateLastMessage = useAppStore((s) => s.updateLastMessage);
  const isTyping = useAppStore((s) => s.isTyping);
  const setTyping = useAppStore((s) => s.setTyping);
  const isExportModalOpen = useAppStore((s) => s.isExportModalOpen);
  const toggleExportModal = useAppStore((s) => s.toggleExportModal);

  // Local UI state (not persisted)
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Feature Modals State
  const [showQuality, setShowQuality] = useState(false);
  const [showSceneEditor, setShowSceneEditor] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [musicModalMode, setMusicModalMode] = useState<"generate" | "remix">("generate");

  // Video preview state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const previewIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Timeline playback state
  const [playbackTime, setPlaybackTime] = useState(0);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const timelineAudioRef = useRef<HTMLAudioElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const presetAppliedRef = useRef(false);

  // Apply initial preset from HomeView
  useEffect(() => {
    if (!initialPreset || presetAppliedRef.current) return;
    presetAppliedRef.current = true;

    // Apply preset settings
    if (initialPreset.mode === "video") {
      if (initialPreset.visualStyle) setVisualStyle(initialPreset.visualStyle);
      if (initialPreset.duration) setTargetDuration(initialPreset.duration);
      if (initialPreset.videoPurpose) setVideoPurpose(initialPreset.videoPurpose);

      // If topic was provided, auto-start production
      if (initialPreset.topic) {
        setTopic(initialPreset.topic);
        // Add a welcome message with context
        addMessage("assistant", `Great! I'll create a ${initialPreset.videoPurpose || "documentary"} video about "${initialPreset.topic}" in ${initialPreset.visualStyle || "Cinematic"} style (~${initialPreset.duration || 60}s). Starting production...`);
        setTimeout(() => {
          startProduction({
            skipNarration: false,
            targetDuration: initialPreset.duration,
            visualStyle: initialPreset.visualStyle,
            contentPlannerConfig: {
              videoPurpose: initialPreset.videoPurpose,
              visualStyle: initialPreset.visualStyle,
            }
          }, initialPreset.topic);
        }, 500);
      } else {
        // Just apply settings and prompt user
        addMessage("assistant", `I'm set up for a ${initialPreset.videoPurpose || "documentary"} video in ${initialPreset.visualStyle || "Cinematic"} style (~${initialPreset.duration || 60}s). What topic would you like to explore?`);
      }
    } else if (initialPreset.mode === "music") {
      // For music, prompt user or auto-generate
      // When not instrumental and lyrics provided, use lyrics as prompt (Suno API uses prompt as lyrics in custom mode)
      const hasContent = initialPreset.musicPrompt || initialPreset.lyrics;
      if (hasContent) {
        const isInstrumental = initialPreset.instrumental ?? false;
        // For vocal tracks with lyrics, use lyrics as prompt; otherwise use musicPrompt
        const promptForApi = !isInstrumental && initialPreset.lyrics
          ? initialPreset.lyrics
          : initialPreset.musicPrompt || "";

        const displayText = initialPreset.lyrics
          ? `with custom lyrics`
          : `"${initialPreset.musicPrompt}"`;

        // Generate a title from the prompt (first 50 chars or style-based)
        const autoTitle = initialPreset.musicPrompt
          ? initialPreset.musicPrompt.slice(0, 50)
          : `${initialPreset.musicStyle || "Pop"} Track`;

        const modelToUse = initialPreset.musicModel || "V5";
        addMessage("assistant", `Creating ${isInstrumental ? "an instrumental" : "a song"} in ${initialPreset.musicStyle || "Pop"} style ${displayText} using ${modelToUse}`);
        generateMusic({
          prompt: promptForApi,
          style: initialPreset.musicStyle || "Pop, Catchy",
          instrumental: isInstrumental,
          title: autoTitle,
          model: modelToUse
        });
        setShowMusic(true);
      } else {
        addMessage("assistant", `I'm ready to create ${initialPreset.instrumental ? "an instrumental" : "a song"} in ${initialPreset.musicStyle || "Pop"} style. What should it be about?`);
      }
    }
  }, [initialPreset, setVisualStyle, setTargetDuration, setVideoPurpose, setTopic, startProduction, addMessage, generateMusic]);

  // Convert store messages to ChatMessage format with extended fields
  const messages: ChatMessage[] = useMemo(() => {
    if (storeMessages.length === 0) {
      // Return welcome message if empty
      return [{
        id: "welcome",
        role: "assistant" as const,
        content: `Hey! I'm ready to create amazing content for you. Here's what I can do:

**Create Videos:**
• "Create a video about the history of coffee"
• "Make a travel video showcasing Tokyo"

**Generate Music:**
• "Make an upbeat synthwave song about neon cities"
• "Create a calm piano instrumental"

**Advanced Features:**
• "Browse SFX for ocean waves" - Find ambient sounds
• "Set camera to close-up with golden hour lighting"
• "Show my quality history" - Track production quality
• "Refine this prompt: A sunset scene" - Improve prompts

Just tell me what you want to create!`,
        timestamp: Date.now(),
      }];
    }
    return storeMessages as ChatMessage[];
  }, [storeMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Calculate merged audio URL
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    const mergeAudio = async () => {
      if (!contentPlan || narrationSegments.length === 0) return;

      try {
        const orderedBlobs: Blob[] = [];
        for (const scene of contentPlan.scenes) {
          const narration = narrationSegments.find(n => n.sceneId === scene.id);
          if (narration?.audioBlob) orderedBlobs.push(narration.audioBlob);
        }

        if (orderedBlobs.length === 0) return;

        const sampleRate = 24000;
        const bytesPerSample = 2;
        const WAV_HEADER_SIZE = 44;

        let totalPcmSize = 0;
        const pcmDataArrays: Uint8Array[] = [];

        for (const blob of orderedBlobs) {
          const arrayBuffer = await blob.arrayBuffer();
          const fullData = new Uint8Array(arrayBuffer);
          const pcmData = fullData.slice(WAV_HEADER_SIZE);
          pcmDataArrays.push(pcmData);
          totalPcmSize += pcmData.length;
        }

        const mergedPcm = new Uint8Array(totalPcmSize);
        let offset = 0;
        for (const pcmData of pcmDataArrays) {
          mergedPcm.set(pcmData, offset);
          offset += pcmData.length;
        }

        const wavBuffer = new ArrayBuffer(WAV_HEADER_SIZE + totalPcmSize);
        const view = new DataView(wavBuffer);

        const writeString = (off: number, str: string) => {
          for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
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
        setMergedAudioUrl(URL.createObjectURL(mergedBlob));
      } catch (err) {
        console.error("Failed to merge audio:", err);
      }
    };

    mergeAudio();
  }, [contentPlan, narrationSegments]);

  // Track generation progress and update messages with visual feedback
  const lastMessageIdRef = useRef<string | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (appState === AppState.IDLE || appState === AppState.READY) {
      // Clear interval when idle or ready
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      return;
    }

    // Check if we already processed this state
    const stateKey = `${appState}-${progress?.currentScene}`;
    if (lastMessageIdRef.current === stateKey) return;
    lastMessageIdRef.current = stateKey;

    let statusText = "";
    let progressPercent = 0;

    switch (appState) {
      case AppState.CONTENT_PLANNING:
        statusText = "📝 Planning your video structure...";
        progressPercent = 10;
        break;
      case AppState.NARRATING:
        const sceneNum = progress?.currentScene || 0;
        const totalScenes = progress?.totalScenes || 5;
        progressPercent = 10 + Math.round((sceneNum / totalScenes) * 30);
        statusText = `🎙️ Generating narration (${sceneNum}/${totalScenes} scenes)...\n\n${'█'.repeat(Math.floor(progressPercent / 5))}${'░'.repeat(20 - Math.floor(progressPercent / 5))} ${progressPercent}%`;
        break;
      case AppState.GENERATING_PROMPTS:
        progressPercent = 50 + (progress?.progress ? Math.round(progress.progress * 0.4) : 0);
        statusText = `🎨 Creating visual assets...\n\n${'█'.repeat(Math.floor(progressPercent / 5))}${'░'.repeat(20 - Math.floor(progressPercent / 5))} ${progressPercent}%`;
        break;
      case AppState.VALIDATING:
        progressPercent = 95;
        statusText = `✨ Finalizing your video...\n\n${'█'.repeat(19)}░ ${progressPercent}%`;
        break;
    }

    if (statusText) {
      updateLastMessage({ content: statusText });
    }
  }, [appState, progress?.currentScene, progress?.totalScenes, progress?.progress, updateLastMessage]);

  // Check if video is ready
  const isVideoReady = useMemo(() => {
    return Boolean(contentPlan && narrationSegments.length > 0 && appState === AppState.READY);
  }, [contentPlan, narrationSegments, appState]);

  // Update message when video is ready
  const videoReadyProcessedRef = useRef(false);

  useEffect(() => {
    if (!isVideoReady) {
      videoReadyProcessedRef.current = false;
      return;
    }

    // Only process once per video ready state
    if (videoReadyProcessedRef.current) return;
    videoReadyProcessedRef.current = true;

    const readyMessage = `Your video "${contentPlan?.title}" is ready! 🎬\n\n${contentPlan?.scenes.length} scenes • ${Math.round(narrationSegments.reduce((sum, n) => sum + n.audioDuration, 0))}s duration\n\nYou can preview it below, or export it now.`;
    updateLastMessage({ content: readyMessage });
  }, [isVideoReady, contentPlan, narrationSegments, updateLastMessage]);

  // Handle preview playback
  useEffect(() => {
    if (isPlaying && contentPlan) {
      previewIntervalRef.current = setInterval(() => {
        setCurrentSceneIndex(prev => (prev + 1) % contentPlan.scenes.length);
      }, 3000);
    } else {
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
    }

    return () => {
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    };
  }, [isPlaying, contentPlan]);

  // Reset handler
  const handleReset = useCallback(() => {
    reset();
    clearMessages();
    setCurrentSceneIndex(0);
    setIsPlaying(false);
    setShowTimeline(false);
    setPlaybackTime(0);
    setSelectedSceneId(null);
    studioAgent.resetConversation();
  }, [reset, clearMessages]);

  // Timeline playback handlers
  const handleTimelinePlayPause = useCallback(() => {
    if (timelineAudioRef.current) {
      if (isPlaying) {
        timelineAudioRef.current.pause();
      } else {
        timelineAudioRef.current.play();
      }
    }
    setIsPlaying(prev => !prev);
  }, [isPlaying]);

  const handleTimelineSeek = useCallback((time: number) => {
    setPlaybackTime(time);
    if (timelineAudioRef.current) {
      timelineAudioRef.current.currentTime = time;
    }
    // Update current scene based on time
    if (contentPlan) {
      let elapsed = 0;
      for (let i = 0; i < contentPlan.scenes.length; i++) {
        const scene = contentPlan.scenes[i];
        if (!scene) continue;
        const sceneDuration = narrationSegments.find(n => n.sceneId === scene.id)?.audioDuration || scene.duration;
        if (time < elapsed + sceneDuration) {
          setCurrentSceneIndex(i);
          break;
        }
        elapsed += sceneDuration;
      }
    }
  }, [contentPlan, narrationSegments]);

  const handleSceneSelect = useCallback((sceneId: string) => {
    setSelectedSceneId(sceneId);
    // Jump to scene start time
    if (contentPlan) {
      let elapsed = 0;
      for (const scene of contentPlan.scenes) {
        if (scene.id === sceneId) {
          setPlaybackTime(elapsed);
          if (timelineAudioRef.current) {
            timelineAudioRef.current.currentTime = elapsed;
          }
          break;
        }
        const sceneDuration = narrationSegments.find(n => n.sceneId === scene.id)?.audioDuration || scene.duration;
        elapsed += sceneDuration;
      }
    }
  }, [contentPlan, narrationSegments]);

  // Process user input
  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isProcessing) return;

    const userInput = input.trim();
    addMessage("user", userInput);
    setInput("");
    setIsProcessing(true);
    setTyping(true);

    // Add thinking indicator
    const thinkingId = addMessage("assistant", "Thinking...");

    try {
      const agentResponse: AgentResponse = await studioAgent.processMessage(userInput);

      switch (agentResponse.action.type) {
        case "generate_music": {
          // @ts-ignore - params exists on generate_music action
          const params = agentResponse.action.params;

          updateLastMessage({ content: agentResponse.message });

          // Pass the robust params to the hook
          generateMusic({
            prompt: params.prompt,
            style: params.style,
            title: params.title,
            instrumental: params.instrumental,
            customMode: params.customMode,
            model: "V5" // Force V5 as per system prompt 
          });

          // Open music modal so user can see progress
          setShowMusic(true);
          break;
        }

        case "create_music_video": {
          const params = agentResponse.action.params;
          updateLastMessage({ content: agentResponse.message });

          try {
            const taskId = await createMusicVideo(params.taskId, params.audioId);
            addMessage("assistant", `Music video generation started! Task ID: ${taskId}. It will appear in your timeline once ready.`);
          } catch (err: any) {
            addMessage("assistant", `Failed to start music video: ${err.message}`);
          }
          break;
        }

        case "add_vocals": {
          const params = agentResponse.action.params;
          updateLastMessage({ content: agentResponse.message });

          try {
            // Defaulting other params since agent might not provide all
            const taskId = await addVocals({
              prompt: params.prompt,
              uploadUrl: params.uploadUrl,
              model: "V5"
            });
            addMessage("assistant", `Adding vocals to your track. Task ID: ${taskId}`);
            setShowMusic(true);
          } catch (err: any) {
            addMessage("assistant", `Failed to add vocals: ${err.message}`);
          }
          break;
        }

        case "generate_cover": {
          const params = agentResponse.action.params;
          updateLastMessage({ content: agentResponse.message });

          try {
            const taskId = await generateCover(params.taskId);
            addMessage("assistant", `Generating a fresh cover art. Task ID: ${taskId}`);
          } catch (err: any) {
            addMessage("assistant", `Failed to generate cover: ${err.message}`);
          }
          break;
        }

        case "create_video": {
          const params = agentResponse.action.params;

          // Update the thinking message to show generation started
          updateLastMessage({ content: agentResponse.message });

          setTopic(params.topic);
          setTargetDuration(params.duration || 60);
          setVisualStyle(params.style || "Cinematic");
          setVideoPurpose("documentary");

          // Pass parameters directly to avoid stale closure issues
          startProduction({
            skipNarration: false,
            targetDuration: params.duration || 60,
            visualStyle: params.style || "Cinematic",
            contentPlannerConfig: {
              videoPurpose: "documentary",
              visualStyle: params.style || "Cinematic",
            }
          }, params.topic);
          break;
        }

        case "ask_clarification":
        case "respond": {
          updateLastMessage({ content: agentResponse.message });
          break;
        }

        case "modify_settings": {
          const settings = agentResponse.action.settings;
          if (settings?.style) setVisualStyle(settings.style);
          if (settings?.duration) setTargetDuration(settings.duration);

          updateLastMessage({ content: agentResponse.message });
          break;
        }

        case "export_video": {
          setShowExport(true);
          updateLastMessage({ content: agentResponse.message });
          break;
        }

        case "reset": {
          handleReset();
          break;
        }

        // NEW ACTION HANDLERS
        case "browse_sfx": {
          const params = agentResponse.action.params;
          updateLastMessage({ content: agentResponse.message });

          try {
            const sound = await browseSfx(params.category);
            if (sound) {
              addMessage("assistant", `Found SFX: "${sound.name}" (${sound.duration.toFixed(1)}s) by ${sound.username}. Rating: ${sound.avg_rating.toFixed(1)}/5. Would you like me to preview it or add it to your project?`);
            } else {
              addMessage("assistant", `Couldn't find sounds for "${params.category}". Try another category like: ocean-waves, forest-ambience, city-traffic, or eerie-ambience.`);
            }
          } catch (err: any) {
            addMessage("assistant", `SFX search failed: ${err.message}. Make sure VITE_FREESOUND_API_KEY is configured.`);
          }
          break;
        }

        case "set_camera_style": {
          const params = agentResponse.action.params;
          if (params.angle) setPreferredCameraAngle(params.angle);
          if (params.lighting) setPreferredLightingMood(params.lighting);
          updateLastMessage({ content: agentResponse.message });
          break;
        }

        case "show_quality_report": {
          if (qualityReport) {
            setShowQuality(true);
            updateLastMessage({ content: agentResponse.message });
          } else {
            updateLastMessage({ content: "No quality report available yet. Generate a video first!" });
          }
          break;
        }

        case "show_quality_history": {
          const history = getQualityHistoryData();
          const trend = getQualityTrend();
          if (history.length > 0) {
            const avgScore = Math.round(history.reduce((sum, r) => sum + r.overallScore, 0) / history.length);
            const trendText = trend ? ` Trend: ${trend.trend}` : '';
            updateLastMessage({ content: `Quality History: ${history.length} productions. Average score: ${avgScore}/100.${trendText}` });
          } else {
            updateLastMessage({ content: "No quality history yet. Your production quality will be tracked after you create videos!" });
          }
          break;
        }

        case "mix_audio": {
          const params = agentResponse.action.params;
          updateLastMessage({ content: "Mixing audio tracks..." });

          try {
            if (!contentPlan) {
              addMessage("assistant", "No content plan available for audio mixing. Please generate content first.");
              return;
            }
            
            const mixedBlob = await mixAudio(
              contentPlan,
              narrationSegments,
              {
                includeSfx: params.includeSfx,
                includeMusic: params.includeMusic
              }
            );
            if (mixedBlob) {
              const url = URL.createObjectURL(mixedBlob);
              addMessage("assistant", `Audio mix complete! Size: ${(mixedBlob.size / 1024 / 1024).toFixed(2)} MB. The mixed audio is ready for export.`);
              // Could offer download here
            }
          } catch (err: any) {
            addMessage("assistant", `Audio mixing failed: ${err.message}`);
          }
          break;
        }

        case "lint_prompt": {
          const params = agentResponse.action.params;
          const issues = checkPromptQuality(params.promptText);
          if (issues.length > 0) {
            const issueList = issues.map(i => `- ${i.message}`).join('\n');
            updateLastMessage({ content: `Prompt Quality Issues Found:\n${issueList}` });
          } else {
            updateLastMessage({ content: "Prompt looks good! No major issues detected." });
          }
          break;
        }

        case "refine_prompt": {
          const params = agentResponse.action.params;
          updateLastMessage({ content: "Refining prompt with AI..." });

          try {
            const result = await improvePrompt(params.promptText, params.intent as any);
            addMessage("assistant", `Refined Prompt:\n\n"${result.refinedPrompt}"\n\n${result.issues.length > 0 ? `Note: ${result.issues.length} minor issues were addressed.` : ''}`);
          } catch (err: any) {
            addMessage("assistant", `Prompt refinement failed: ${err.message}`);
          }
          break;
        }

        default: {
          updateLastMessage({ content: agentResponse.message });
        }
      }
    } catch (err) {
      console.error("Agent error:", err);
      updateLastMessage({ content: "Sorry, I had trouble understanding that. Could you try rephrasing?" });
    }

    setTyping(false);
    setIsProcessing(false);
  }, [input, isProcessing, addMessage, updateLastMessage, setTyping, setTopic, setTargetDuration, setVisualStyle, setVideoPurpose, startProduction, handleReset, browseSfx, setPreferredCameraAngle, setPreferredLightingMood, qualityReport, getQualityHistoryData, getQualityTrend, mixAudio, checkPromptQuality, improvePrompt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Get visuals for preview - use memoized map directly from hook
  const currentScene = contentPlan?.scenes[currentSceneIndex];
  const currentVisual = currentScene ? visualsMap[currentScene.id] : null;

  // Export handler
  const handleExport = useCallback(async (
    config: { presetId: string; width: number; height: number; orientation: "landscape" | "portrait"; quality: string },
    onProgress?: (percent: number) => void
  ) => {
    if (!contentPlan || narrationSegments.length === 0 || !mergedAudioUrl) {
      throw new Error("Video not ready for export");
    }

    // Config building logic... (abbreviated for clarity, mostly same as before)
    // Build export data
    let currentTime = 0;
    const parsedSubtitles = contentPlan.scenes.map((scene, idx) => {
      const narration = narrationSegments.find(n => n.sceneId === scene.id);
      const duration = narration?.audioDuration || scene.duration;
      const subtitle = {
        id: idx + 1,
        startTime: currentTime,
        endTime: currentTime + duration,
        text: narration?.transcript || scene.narrationScript,
      };
      currentTime += duration;
      return subtitle;
    });

    const prompts = contentPlan.scenes.map((scene, idx) => ({
      id: scene.id,
      text: scene.visualDescription,
      mood: scene.emotionalTone,
      timestampSeconds: parsedSubtitles[idx]?.startTime || 0,
    }));

    const generatedImages = Object.entries(visualsMap as Record<string, string>)
      .filter(([, url]) => url)
      .map(([sceneId, url]) => ({
        promptId: sceneId,
        imageUrl: url,
        type: url.includes('.mp4') || url.includes('video') ? 'video' as const : 'image' as const,
      }));

    const songData = {
      fileName: contentPlan.title || 'ai-video',
      audioUrl: mergedAudioUrl,
      srtContent: '',
      parsedSubtitles,
      prompts,
      generatedImages,
    };

    const sceneTimings = contentPlan.scenes.map((scene, idx) => {
      const narration = narrationSegments.find(n => n.sceneId === scene.id);
      const subtitle = parsedSubtitles[idx];
      return {
        sceneId: scene.id,
        startTime: subtitle?.startTime || 0,
        duration: narration?.audioDuration || scene.duration,
      };
    });

    const { exportVideoClientSide } = await import("@/services/ffmpeg/exporters");

    const blob = await exportVideoClientSide(
      songData,
      (p) => onProgress?.(p.progress),
      {
        orientation: config.orientation,
        useModernEffects: true,
        transitionType: "dissolve",
        transitionDuration: 1.5,
        contentMode: "story",
        sfxPlan,
        sceneTimings,
      }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${contentPlan.title || "video"}-${config.presetId}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [contentPlan, narrationSegments, mergedAudioUrl, visualsMap, sfxPlan]);

  const totalDuration = useMemo(() => {
    return narrationSegments.reduce((sum, n) => sum + n.audioDuration, 0);
  }, [narrationSegments]);

  return (
    <div className={cn("h-screen relative overflow-hidden flex flex-col", className)} data-testid="ai-studio-view">
      {/* 1. Global Background */}
      <AmbientBackground />

      {/* 2. Header */}
      <header className="h-14 px-6 flex items-center justify-between border-b border-white/5 bg-black/20 backdrop-blur-xl shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-white">LyricLens</span>
        </div>
        <div className="flex items-center gap-3">
          {(messages.length > 1 || contentPlan) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-white/50 hover:text-white hover:bg-white/5"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              New Project
            </Button>
          )}
          {isVideoReady && (
            <>
              <Button
                variant={showSceneEditor ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setShowSceneEditor(v => !v)}
                className={cn(
                  "gap-2",
                  showSceneEditor
                    ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                )}
              >
                <Edit3 className="w-4 h-4" />
                Edit
              </Button>
              {qualityReport && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowQuality(true)}
                  className="text-white/50 hover:text-white hover:bg-white/5 gap-2"
                >
                  <BarChart3 className="w-4 h-4" />
                  Quality
                </Button>
              )}
              <Button
                variant={showTimeline ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setShowTimeline(v => !v)}
                data-testid="timeline-toggle-button"
                className={cn(
                  "gap-2",
                  showTimeline
                    ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                )}
              >
                <Layers className="w-4 h-4" />
                Timeline
              </Button>
              <Button
                onClick={() => setShowExport(true)}
                size="sm"
                className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
            </>
          )}
        </div>
      </header>

      {/* 3. Main Content - Centered Chat (Gemini/ChatGPT style) */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Messages Area - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8">
            {/* Welcome State */}
            {messages.length === 1 && !contentPlan && (
              <div className="text-center mb-12 pt-12">
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-linear-to-br from-violet-600/20 to-fuchsia-600/20 border border-white/10 flex items-center justify-center">
                  <Wand2 className="w-8 h-8 text-violet-400" />
                </div>
                <h1 className="text-3xl font-light text-white mb-3">What would you like to create?</h1>
                <p className="text-white/40 max-w-md mx-auto">
                  I can generate full songs using Suno AI or create cinematic videos. Just describe your idea below.
                </p>
              </div>
            )}

            {/* Messages */}
            <div className="space-y-6">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} isVideoReady={isVideoReady} />
              ))}

              {/* Live Progress Indicator during generation */}
              {appState !== AppState.IDLE && appState !== AppState.READY && appState !== AppState.ERROR && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-2xl mx-auto"
                >
                  <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">
                          {appState === AppState.CONTENT_PLANNING && "Planning video structure..."}
                          {appState === AppState.NARRATING && `Generating narration (${progress?.currentScene || 0}/${progress?.totalScenes || 0})`}
                          {appState === AppState.GENERATING_PROMPTS && "Creating visual assets..."}
                          {appState === AppState.VALIDATING && "Finalizing video..."}
                        </div>
                        <div className="text-xs text-white/50 mt-0.5">
                          {progress?.message || "This may take a minute..."}
                        </div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                        initial={{ width: "0%" }}
                        animate={{
                          width: `${appState === AppState.CONTENT_PLANNING ? 15 :
                            appState === AppState.NARRATING ? 15 + ((progress?.currentScene || 0) / (progress?.totalScenes || 5)) * 35 :
                              appState === AppState.GENERATING_PROMPTS ? 50 + (progress?.progress || 0) * 0.4 :
                                appState === AppState.VALIDATING ? 95 : 0
                            }%`
                        }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm max-w-2xl mx-auto">
                  <div className="flex items-center gap-2 mb-1 text-red-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Error
                  </div>
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Video Preview Card (shown when video is ready) */}
            {contentPlan && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 mb-4"
              >
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
                  {/* Preview Image */}
                  <div className="relative aspect-video bg-black/40">
                    {currentVisual ? (
                      <img
                        src={currentVisual}
                        alt={currentScene?.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
                      </div>
                    )}

                    {/* Overlay */}
                    <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/40" />

                    {/* Scene Info */}
                    <div className="absolute top-4 left-4">
                      <span className="px-3 py-1 rounded-full bg-black/50 backdrop-blur text-xs text-white/80 border border-white/10">
                        Scene {currentSceneIndex + 1} of {contentPlan.scenes.length}
                      </span>
                    </div>

                    {/* Play Button */}
                    {isVideoReady && (
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="absolute inset-0 flex items-center justify-center group"
                      >
                        <div className={cn(
                          "w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center transition-all",
                          "group-hover:scale-110 group-hover:bg-white/20",
                          isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                        )}>
                          {isPlaying ? (
                            <Pause className="w-6 h-6 text-white" />
                          ) : (
                            <Play className="w-6 h-6 text-white ml-1" />
                          )}
                        </div>
                      </button>
                    )}

                    {/* Bottom Info */}
                    <div className="absolute bottom-4 left-4 right-4">
                      <h3 className="text-lg font-medium text-white mb-1">{currentScene?.name}</h3>
                      <p className="text-sm text-white/60 line-clamp-2">{currentScene?.narrationScript}</p>
                    </div>
                  </div>

                  {/* Scene Thumbnails */}
                  {contentPlan.scenes.length > 1 && (
                    <div className="p-3 flex gap-2 overflow-x-auto bg-black/20">
                      {contentPlan.scenes.map((scene, idx) => (
                        <button
                          key={scene.id}
                          onClick={() => setCurrentSceneIndex(idx)}
                          className={cn(
                            "shrink-0 w-20 h-12 rounded-lg overflow-hidden border-2 transition-all",
                            idx === currentSceneIndex
                              ? "border-violet-500 ring-2 ring-violet-500/30"
                              : "border-transparent opacity-60 hover:opacity-100"
                          )}
                        >
                          {visualsMap[scene.id] ? (
                            <img src={visualsMap[scene.id]} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-white/5 flex items-center justify-center text-xs text-white/30">
                              {idx + 1}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Stats Bar */}
                  {isVideoReady && (
                    <div className="px-4 py-3 flex items-center justify-between border-t border-white/5 bg-black/20">
                      <div className="flex items-center gap-4 text-xs text-white/40">
                        <span className="flex items-center gap-1.5">
                          <Video className="w-3.5 h-3.5" />
                          {contentPlan.scenes.length} scenes
                        </span>
                        <span>{Math.round(totalDuration)}s</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Ready to export
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Timeline Editor */}
            {showTimeline && contentPlan && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="mt-4"
                data-testid="timeline-container"
              >
                <GraphiteTimeline
                  scenes={contentPlan.scenes}
                  visuals={visualsMap}
                  narrationSegments={narrationSegments}
                  currentTime={playbackTime}
                  duration={totalDuration}
                  isPlaying={isPlaying}
                  onPlayPause={handleTimelinePlayPause}
                  onSeek={handleTimelineSeek}
                  onSceneSelect={handleSceneSelect}
                  selectedSceneId={selectedSceneId}
                  projectName={contentPlan.title}
                  sfxPlan={sfxPlan}
                  className="rounded-xl overflow-hidden border border-white/5"
                  data-testid="timeline-editor"
                />

                {/* Hidden audio for timeline sync */}
                <audio
                  ref={timelineAudioRef}
                  src={mergedAudioUrl || undefined}
                  onTimeUpdate={(e) => setPlaybackTime(e.currentTarget.currentTime)}
                  onEnded={() => setIsPlaying(false)}
                />
              </motion.div>
            )}

            {/* Music-Only Player (when no video content) */}
            {showTimeline && !contentPlan && sfxPlan?.generatedMusic && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="mt-4 p-6 rounded-xl bg-gradient-to-br from-violet-900/20 to-purple-900/20 border border-violet-500/20"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-lg bg-violet-500/20 flex items-center justify-center">
                    <MusicIcon className="w-8 h-8 text-violet-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white">{sfxPlan.generatedMusic.title}</h3>
                    <p className="text-sm text-white/60">
                      {Math.floor(sfxPlan.generatedMusic.duration / 60)}:{String(Math.floor(sfxPlan.generatedMusic.duration % 60)).padStart(2, '0')} • Ready to use
                    </p>
                  </div>
                </div>

                {/* Audio Player */}
                <audio
                  controls
                  src={sfxPlan.generatedMusic.audioUrl}
                  className="w-full mb-4 rounded-lg"
                  style={{ height: '40px' }}
                />

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  <a
                    href={sfxPlan.generatedMusic.audioUrl}
                    download={`${sfxPlan.generatedMusic.title}.mp3`}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download MP3
                  </a>
                  <button
                    onClick={() => {
                      // Copy audio URL to clipboard
                      navigator.clipboard.writeText(sfxPlan.generatedMusic!.audioUrl);
                      addMessage("assistant", "Audio URL copied to clipboard!");
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-sm font-medium transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    Copy URL
                  </button>
                  <button
                    onClick={() => setShowMusic(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-sm font-medium transition-colors"
                  >
                    <MusicIcon className="w-4 h-4" />
                    Generate Another
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Quick Actions (shown only at start) */}
        {messages.length === 1 && !contentPlan && (
          <div className="max-w-3xl mx-auto w-full px-4 pb-4">
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { icon: MusicIcon, label: "Generate Song", prompt: "Generate an upbeat synthwave track about city lights at night" },
                { icon: Video, label: "Travel video", prompt: "Create a cinematic travel video about exploring ancient Rome" },
                { icon: ImageIcon, label: "Story video", prompt: "Generate a documentary about the journey of a coffee bean" },
              ].map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => setInput(action.prompt)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/70 hover:text-white transition-all"
                >
                  <action.icon className="w-4 h-4 text-violet-400" />
                  {action.label}
                </button>
              ))}
              {/* Upload Audio button - opens Music Modal in remix mode */}
              <button
                onClick={() => {
                  setMusicModalMode("remix");
                  setShowMusic(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/70 hover:text-white transition-all"
              >
                <Upload className="w-4 h-4 text-violet-400" />
                Upload Audio
              </button>
            </div>
          </div>
        )}

        {/* Input Area - Fixed at bottom */}
        <div className="border-t border-white/5 bg-black/20 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="bg-white/5 rounded-2xl border border-white/10 focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your video idea..."
                className="w-full bg-transparent border-0 focus:ring-0 resize-none text-sm text-white placeholder:text-white/30 min-h-[52px] max-h-[200px] px-4 py-3"
                rows={1}
                disabled={isProcessing || appState !== AppState.IDLE}
              />
              <div className="flex justify-between items-center px-3 pb-3">
                <span className="text-[10px] text-white/20 uppercase tracking-wider">Press Enter to send</span>
                <Button
                  onClick={handleSubmit}
                  disabled={!input.trim() || isProcessing || appState !== AppState.IDLE}
                  size="sm"
                  className={cn(
                    "rounded-xl transition-all",
                    input.trim()
                      ? "bg-violet-600 hover:bg-violet-500 text-white"
                      : "bg-white/10 text-white/30"
                  )}
                >
                  {isProcessing || appState !== AppState.IDLE ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Music Generator Modal */}
      <MusicGeneratorModal
        open={showMusic}
        onClose={() => {
          setShowMusic(false);
          setMusicModalMode("generate"); // Reset mode for next open
        }}
        musicState={musicState}
        onGenerateMusic={generateMusic}
        onGenerateLyrics={generateLyrics}
        onSelectTrack={selectTrack}
        onAddToTimeline={() => {
          addMusicToTimeline();
          setShowTimeline(true);
        }}
        onRefreshCredits={refreshCredits}
        onUploadAudio={uploadAudio}
        onUploadAndCover={uploadAndCover}
        onAddVocals={addVocals}
        onAddInstrumental={addInstrumental}
        initialMode={musicModalMode}
      />

      {/* Quality Dashboard Modal */}
      {qualityReport && (
        <QualityDashboard
          report={qualityReport}
          isOpen={showQuality}
          onClose={() => setShowQuality(false)}
        />
      )}

      {/* Scene Editor Side Panel */}
      <AnimatePresence>
        {showSceneEditor && contentPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end"
            onClick={() => setShowSceneEditor(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full max-w-md bg-[#12121a] border-l border-white/10 h-full overflow-y-auto p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Edit Scenes</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowSceneEditor(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <SceneEditor
                scenes={contentPlan.scenes}
                onChange={updateScenes}
                onPlayNarration={playNarration}
                onRegenerateNarration={regenerateSceneNarration}
                playingSceneId={playingSceneId}
                visuals={visualsMap}
                narrationUrls={getAudioUrlMap()}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export Modal */}
      <QuickExport
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        onExport={handleExport}
        videoTitle={contentPlan?.title}
        duration={totalDuration}
      />
    </div>
  );
}

// Message Bubble - Gemini/ChatGPT style (centered, full width)
function MessageBubble({ message, isVideoReady: _isVideoReady }: { message: ChatMessage; isVideoReady?: boolean }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex gap-4",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* AI Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-linear-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shrink-0 mt-1">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      )}

      <div className={cn("max-w-[80%]", isUser && "text-right")}>
        {/* Message Content */}
        <div
          className={cn(
            "inline-block px-4 py-3 text-[15px] leading-relaxed",
            isUser
              ? "bg-violet-600 text-white rounded-2xl rounded-tr-md"
              : "bg-white/5 text-white/90 rounded-2xl rounded-tl-md border border-white/10"
          )}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>

        {/* Progress indicator */}
        {message.status === "generating" && message.progress !== undefined && (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden max-w-[200px]">
              <motion.div
                className="h-full bg-linear-to-r from-violet-500 to-fuchsia-500"
                initial={{ width: 0 }}
                animate={{ width: `${message.progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-xs text-white/40 tabular-nums">{Math.round(message.progress)}%</span>
          </div>
        )}

        {/* Thinking indicator */}
        {message.status === "thinking" && (
          <div className="mt-2 flex items-center gap-2 text-white/40 text-sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Thinking...</span>
          </div>
        )}

        {/* Video ready badge */}
        {message.videoReady && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Video Ready
          </motion.div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-1 text-white/60 text-sm font-medium">
          U
        </div>
      )}
    </motion.div>
  );
}

export default AIStudioView;
