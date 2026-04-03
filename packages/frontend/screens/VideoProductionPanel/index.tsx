/**
 * VideoProductionPanel - chat/video production mode, extracted from StudioScreen
 *
 * Self-contained panel: owns useVideoProductionRefactored + studioAgent.
 * The shell (StudioScreen) no longer imports these heavy dependencies.
 *
 * Renders the chat messages, video preview, timeline editor, quick actions,
 * and all modals (music, scene editor, export, settings) for the chat/video
 * production workflow.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BlurFade } from '@/components/motion-primitives/blur-fade';
import {
  Video,
  Music as MusicIcon,
  Image as ImageIcon,
  Wand2,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { MessageBubble, QuickActions, type ChatMessage } from '@/components/chat';
import { QuickExport } from '@/components/import-export/QuickExport';
import { VideoPreviewCard } from '@/components/video-production/VideoPreviewCard';
import QualityDashboard from '@/components/video-production/QualityDashboard';
import SceneEditor from '@/components/video-production/SceneEditor';
import MusicGeneratorModal from '@/components/music/MusicGeneratorModal';
import { SettingsModal } from '@/components/SettingsModal';
import { GraphiteTimeline } from '@/components/TimelineEditor';
import { SlidePanel } from '@/components/ui/SlidePanel';
import type { ExportQualityPreset } from '@/services/ffmpeg/exportConfig';
import type {
  ContentPlan,
  NarrationSegment,
  GeneratedImage,
} from '@/types';
import { AppState } from '@/types';
import { getEffectiveLegacyTone } from '@/services/content/tripletUtils';
import { studioAgent, type AgentResponse, type QuickAction } from '@/services/ai/studioAgent';
import { useVideoProductionRefactored } from '@/hooks/useVideoProductionRefactored';
import { useModalState } from '@/hooks/useModalState';
import { useAppStore } from '@/stores';
import { getCurrentUser } from '@/services/firebase/authService';

// ============================================================
// Types for the test/debug API
// ============================================================

type StudioTestExportPayload = {
  config: {
    presetId: string;
    width: number;
    height: number;
    orientation: 'landscape' | 'portrait';
    quality: ExportQualityPreset;
  };
  title?: string;
  sceneCount: number;
  narrationCount: number;
  hasMergedAudio: boolean;
};

type StudioTestApi = {
  seedExportReadyState: () => Promise<void>;
  setExportInterceptor: (interceptor: ((payload: StudioTestExportPayload) => Promise<void> | void) | null) => void;
};

type StudioTestWindow = Window & {
  __studioTestApi?: StudioTestApi;
};

function createTestWavBlob(durationSeconds: number): Blob {
  const sampleRate = 24000;
  const bytesPerSample = 2;
  const headerSize = 44;
  const totalSamples = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const pcmSize = totalSamples * bytesPerSample;
  const wavBuffer = new ArrayBuffer(headerSize + pcmSize);
  const view = new DataView(wavBuffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmSize, true);

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

// ============================================================
// Video state snapshot reported to the shell
// ============================================================

export interface VideoStateSnapshot {
  contentPlan: ContentPlan | null;
  isVideoReady: boolean;
  topic: string;
  visuals: GeneratedImage[];
  narrationSegments: NarrationSegment[];
  mergedAudioUrl: string | null;
  qualityReport: ReturnType<typeof useVideoProductionRefactored>['qualityReport'];
}

// ============================================================
// Props interface (much smaller than before)
// ============================================================

export interface VideoProductionPanelProps {
  // Project / session (from useProjectSession in shell)
  projectId: string | undefined;
  sessionId: string | null | undefined;
  project: {
    topic?: string;
    style?: string;
    cloudSessionId?: string;
  } | null | undefined;
  restoredState: {
    contentPlan?: ContentPlan | null;
    visuals?: GeneratedImage[];
    narrationSegments?: NarrationSegment[];
    sfxPlan?: unknown;
    validation?: unknown;
  } | null | undefined;
  flushSession: () => Promise<void>;
  syncProjectMetadata: (updates: Record<string, unknown>) => void;

  // URL params forwarded from shell
  paramsStyle: string | undefined;
  paramsTopic: string | undefined;
  paramsDuration: number | undefined;
  paramsMode: string | undefined;
  isProjectLoading: boolean;

  // Modal state (from useModalState in shell)
  showExport: boolean;
  setShowExport: (v: boolean) => void;
  showQuality: boolean;
  setShowQuality: (v: boolean) => void;
  showSceneEditor: boolean;
  setShowSceneEditor: (v: boolean) => void;
  showMusic: boolean;
  setShowMusic: (v: boolean) => void;
  showTimeline: boolean;
  setShowTimeline: (v: boolean) => void;

  // Local shell state
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  musicModalMode: 'generate' | 'remix';
  setMusicModalMode: (mode: 'generate' | 'remix') => void;

  // Studio mode (to navigate to story mode)
  setStudioMode: (mode: 'chat' | 'story' | 'editor') => void;

  // Callback to report video state to shell (for header buttons and StoryPanel)
  onVideoStateChange: (snapshot: VideoStateSnapshot) => void;

  // Callback to expose reset function to shell (for New Project button)
  onResetRef: (resetFn: () => void) => void;

  // Callback to expose submit handler to shell (for ChatInput footer)
  onSubmitRef: (submitFn: () => void) => void;

  // Input state shared with shell (for the ChatInput footer)
  input: string;
  setInput: (v: string) => void;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  appStateForFooter: AppState;
  onAppStateChange: (state: AppState) => void;
}

// ============================================================
// Component
// ============================================================

export function VideoProductionPanel({
  projectId,
  sessionId,
  project,
  restoredState,
  flushSession,
  syncProjectMetadata,
  paramsStyle,
  paramsTopic,
  paramsDuration,
  paramsMode,
  isProjectLoading,
  showExport,
  setShowExport,
  showQuality,
  setShowQuality,
  showSceneEditor,
  setShowSceneEditor,
  showMusic,
  setShowMusic,
  showTimeline,
  setShowTimeline,
  showSettings,
  setShowSettings,
  musicModalMode,
  setMusicModalMode,
  setStudioMode: _setStudioMode,
  onVideoStateChange,
  onResetRef,
  onSubmitRef,
  input,
  setInput,
  isProcessing,
  setIsProcessing,
  appStateForFooter: _appStateForFooter,
  onAppStateChange,
}: VideoProductionPanelProps) {
  const { t, isRTL } = useLanguage();

  // ── Video production hook (heavy — lives here, not in shell) ──
  const {
    appState,
    contentPlan,
    narrationSegments,
    sfxPlan,
    error,
    setTopic,
    targetAudience,
    setTargetAudience,
    videoPurpose,
    setTargetDuration,
    setVideoPurpose,
    setVisualStyle,
    visualStyle,
    startProduction,
    reset,
    visuals,
    getVisualsMap,
    getAudioUrlMap,
    updateScenes,
    generateMusic,
    generateLyrics,
    createMusicVideo,
    generateCover,
    musicState,
    selectTrack,
    addMusicToTimeline,
    refreshCredits,
    regenerateSceneNarration,
    playNarration,
    qualityReport,
    playingSceneId,
    browseSfx,
    mixAudio,
    setPreferredCameraAngle,
    setPreferredLightingMood,
    uploadAudio,
    uploadAndCover,
    addVocals,
    addInstrumental,
    checkPromptQuality,
    improvePrompt,
    getQualityHistoryData,
    getQualityTrend,
    veoVideoCount,
    setVeoVideoCount,
    topic,
    // Test/Debug setters
    setVisuals,
    setContentPlan,
    setNarrationSegments,
    setSfxPlan,
    setValidation,
    setAppState,
  } = useVideoProductionRefactored();

  // ── App store (chat messages) ──
  const storeMessages = useAppStore((s) => s.messages);
  const addMessage = useAppStore((s) => s.addMessage);
  const clearMessages = useAppStore((s) => s.clearMessages);
  const updateLastMessage = useAppStore((s) => s.updateLastMessage);
  const setTyping = useAppStore((s) => s.setTyping);
  const trackVideoCreation = useAppStore((s) => s.trackVideoCreation);
  const trackMusicGeneration = useAppStore((s) => s.trackMusicGeneration);
  const recordFeedback = useAppStore((s) => s.recordFeedback);

  // ── Local UI state ──
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const previewIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const timelineAudioRef = useRef<HTMLAudioElement>(null);
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
  const exportInterceptorRef = useRef<((payload: StudioTestExportPayload) => Promise<void> | void) | null>(null);
  const mergedAudioUrlRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const paramsAppliedRef = useRef(false);

  // ── Computed values ──
  const messages: ChatMessage[] = useMemo(() => {
    if (storeMessages.length === 0) {
      return [{
        id: 'welcome',
        role: 'assistant' as const,
        content: t('studio.placeholder'),
        timestamp: Date.now(),
      }];
    }
    return storeMessages as ChatMessage[];
  }, [storeMessages, t]);

  const isVideoReady = useMemo(() => {
    return Boolean(contentPlan && narrationSegments.length > 0 && appState === AppState.READY);
  }, [contentPlan, narrationSegments, appState]);

  const visualsMap = getVisualsMap();

  const totalDuration = useMemo(() => {
    return narrationSegments.reduce((sum, n) => sum + n.audioDuration, 0);
  }, [narrationSegments]);

  // ── Report video state to shell ──
  useEffect(() => {
    onVideoStateChange({
      contentPlan,
      isVideoReady,
      topic,
      visuals,
      narrationSegments,
      mergedAudioUrl,
      qualityReport,
    });
  }, [contentPlan, isVideoReady, topic, visuals, narrationSegments, mergedAudioUrl, qualityReport, onVideoStateChange]);

  // ── Report appState to shell footer ──
  useEffect(() => {
    onAppStateChange(appState);
  }, [appState, onAppStateChange]);

  // ── Quick actions for welcome state ──
  const quickActionItems = useMemo(() => [
    { icon: MusicIcon, label: t('home.createMusic'), prompt: 'Generate an upbeat synthwave track about city lights at night' },
    { icon: Video, label: t('home.createVideo'), prompt: 'Create a cinematic travel video about exploring ancient Rome' },
    { icon: ImageIcon, label: t('home.visualizer'), prompt: 'Generate a documentary about the journey of a coffee bean' },
  ], [t]);

  // ── Effects ──

  // Apply URL params OR restore project state on mount
  useEffect(() => {
    if (paramsAppliedRef.current) return;
    if (projectId && isProjectLoading) return;
    paramsAppliedRef.current = true;

    if (restoredState?.contentPlan) {
      console.log('[VideoProductionPanel] Restoring from project session');
      setContentPlan(restoredState.contentPlan);
      if (restoredState.visuals?.length) {
        setVisuals(restoredState.visuals);
      }
      if (restoredState.narrationSegments?.length) {
        setNarrationSegments(restoredState.narrationSegments);
      }
      if (restoredState.sfxPlan) {
        setSfxPlan(restoredState.sfxPlan as Parameters<typeof setSfxPlan>[0]);
      }
      if (restoredState.validation) {
        setValidation(restoredState.validation as Parameters<typeof setValidation>[0]);
      }
      if (restoredState.contentPlan.title) {
        setTopic(restoredState.contentPlan.title);
      }
      setAppState(AppState.READY);
      return;
    }

    if (project) {
      if (project.topic) setTopic(project.topic);
      if (project.style) setVisualStyle(project.style);
    }

    if (paramsMode === 'video') {
      if (paramsStyle) setVisualStyle(paramsStyle);
      if (paramsDuration) setTargetDuration(paramsDuration);
      setVideoPurpose('documentary');

      const effectiveTopic = project?.topic || paramsTopic;
      if (effectiveTopic && !restoredState?.contentPlan) {
        setTopic(effectiveTopic);
        addMessage('assistant', t('studio.generating'));
        setTimeout(() => {
          startProduction({
            sessionId: sessionId || project?.cloudSessionId,
            projectId,
            skipNarration: false,
            targetDuration: paramsDuration || 60,
            visualStyle: paramsStyle || project?.style || 'Cinematic',
            contentPlannerConfig: {
              videoPurpose: 'documentary',
              visualStyle: paramsStyle || project?.style || 'Cinematic',
            }
          }, effectiveTopic);
        }, 500);
      }
    } else if (paramsMode === 'music') {
      setShowMusic(true);
    }
  }, [projectId, isProjectLoading, project, restoredState, sessionId, paramsStyle, paramsTopic, paramsDuration, paramsMode, setVisualStyle, setTargetDuration, setVideoPurpose, setTopic, startProduction, addMessage, t, setShowMusic, setContentPlan, setVisuals, setNarrationSegments, setSfxPlan, setValidation, setAppState]);

  // Sync project metadata when production state changes
  useEffect(() => {
    if (!projectId || !project) return;

    const updates: Record<string, unknown> = {};

    if (contentPlan) {
      updates.sceneCount = contentPlan.scenes.length;
      updates.status = 'in_progress';
    }

    if (visuals.length > 0) {
      updates.hasVisuals = true;
      const firstVisual = visuals.find(v => v.imageUrl);
      if (firstVisual?.imageUrl) {
        updates.thumbnailUrl = firstVisual.imageUrl;
      }
    }

    if (narrationSegments.length > 0) {
      updates.hasNarration = true;
      updates.duration = narrationSegments.reduce((sum, n) => sum + n.audioDuration, 0);
    }

    if (sfxPlan?.generatedMusic?.audioUrl) {
      updates.hasMusic = true;
    }

    if (appState === AppState.READY && contentPlan) {
      updates.status = 'completed';
    }

    if (Object.keys(updates).length > 0) {
      syncProjectMetadata(updates);
    }
  }, [projectId, project, contentPlan, visuals, narrationSegments, sfxPlan, appState, syncProjectMetadata]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [storeMessages]);

  // Merge audio for timeline
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

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + totalPcmSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * bytesPerSample, true);
        view.setUint16(32, bytesPerSample, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, totalPcmSize, true);
        new Uint8Array(wavBuffer, WAV_HEADER_SIZE).set(mergedPcm);

        const mergedBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        if (mergedAudioUrlRef.current) URL.revokeObjectURL(mergedAudioUrlRef.current);
        const newUrl = URL.createObjectURL(mergedBlob);
        mergedAudioUrlRef.current = newUrl;
        setMergedAudioUrl(newUrl);
      } catch (err) {
        console.error('Failed to merge audio:', err);
      }
    };
    mergeAudio();
    return () => {
      if (mergedAudioUrlRef.current) URL.revokeObjectURL(mergedAudioUrlRef.current);
      mergedAudioUrlRef.current = null;
      setMergedAudioUrl(null);
    };
  }, [contentPlan, narrationSegments]);

  // Handle preview playback interval
  useEffect(() => {
    if (isPlaying && contentPlan) {
      previewIntervalRef.current = setInterval(() => {
        setCurrentSceneIndex(prev => (prev + 1) % contentPlan.scenes.length);
      }, 3000);
    } else {
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    }
    return () => {
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    };
  }, [isPlaying, contentPlan]);

  // ── Test / Debug API ──

  const seedExportReadyState = useCallback(async () => {
    const mockContentPlan: Parameters<typeof setContentPlan>[0] = {
      title: 'Playwright Export Demo',
      totalDuration: 18,
      targetAudience: 'General audience',
      overallTone: 'Cinematic',
      scenes: [
        {
          id: 'scene-1',
          name: 'Opening',
          duration: 6,
          visualDescription: 'Golden sunrise over a futuristic city skyline',
          narrationScript: 'The city wakes under a quiet golden dawn.',
          emotionalTone: 'dramatic',
          instructionTriplet: {
            primaryEmotion: 'euphoric-wonder',
            cinematicDirection: 'slow-push-in',
            environmentalAtmosphere: 'golden-hour-decay',
          },
        },
        {
          id: 'scene-2',
          name: 'Middle',
          duration: 6,
          visualDescription: 'Close-up of neon reflections on glass and rain',
          narrationScript: 'Reflections and rain turn motion into memory.',
          emotionalTone: 'dramatic',
          instructionTriplet: {
            primaryEmotion: 'bittersweet-longing',
            cinematicDirection: 'tracking-shot',
            environmentalAtmosphere: 'ethereal-echo',
          },
        },
        {
          id: 'scene-3',
          name: 'Ending',
          duration: 6,
          visualDescription: 'Wide shot of lights stretching into the horizon',
          narrationScript: 'Night settles as the horizon keeps glowing.',
          emotionalTone: 'dramatic',
          instructionTriplet: {
            primaryEmotion: 'stoic-resignation',
            cinematicDirection: 'pull-back',
            environmentalAtmosphere: 'cathedral-reverb',
          },
        },
      ],
    };

    const posterImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p2z7L8AAAAASUVORK5CYII=';
    const mockVisuals: Parameters<typeof setVisuals>[0] = mockContentPlan.scenes.map((scene) => ({
      promptId: scene.id,
      sceneId: scene.id,
      imageUrl: posterImage,
      type: 'image',
      generatedWithVeo: false,
    }));
    const mockNarrationSegments: Parameters<typeof setNarrationSegments>[0] = mockContentPlan.scenes.map((scene) => ({
      sceneId: scene.id,
      audioBlob: createTestWavBlob(scene.duration),
      audioDuration: scene.duration,
      transcript: scene.narrationScript,
    }));
    const mergedBlob = createTestWavBlob(mockContentPlan.totalDuration);

    if (mergedAudioUrlRef.current) {
      URL.revokeObjectURL(mergedAudioUrlRef.current);
    }

    const nextMergedAudioUrl = URL.createObjectURL(mergedBlob);
    mergedAudioUrlRef.current = nextMergedAudioUrl;

    setContentPlan(mockContentPlan);
    setVisuals(mockVisuals);
    setNarrationSegments(mockNarrationSegments);
    setMergedAudioUrl(nextMergedAudioUrl);
    setAppState(AppState.READY);
    setShowExport(false);
  }, [setAppState, setContentPlan, setNarrationSegments, setShowExport, setVisuals]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
      return undefined;
    }

    const studioWindow = window as StudioTestWindow;
    studioWindow.__studioTestApi = {
      seedExportReadyState,
      setExportInterceptor: (interceptor) => {
        exportInterceptorRef.current = interceptor;
      },
    };

    return () => {
      delete studioWindow.__studioTestApi;
    };
  }, [seedExportReadyState]);

  // ── Handlers ──

  const handleReset = useCallback(() => {
    reset();
    clearMessages();
    setCurrentSceneIndex(0);
    setIsPlaying(false);
    setShowTimeline(false);
    setPlaybackTime(0);
    setSelectedSceneId(null);
    studioAgent.resetConversation();
  }, [reset, clearMessages, setShowTimeline]);

  // Expose reset function to shell (for "New Project" button in header)
  useEffect(() => {
    onResetRef(handleReset);
  }, [handleReset, onResetRef]);

  // Expose submit handler to shell via a stable ref (ChatInput footer)
  // We use a ref trick: keep a mutable ref to the latest handleSubmit so the
  // shell's stable wrapper always calls the current version without re-registering.
  // Initialized to null since handleSubmit is declared below; the effect below updates it.
  const handleSubmitRef = useRef<typeof handleSubmit | null>(null);
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  });

  useEffect(() => {
    onSubmitRef(() => handleSubmitRef.current?.());
  }, [onSubmitRef]);

const handleTimelinePlayPause = useCallback(() => {
    if (timelineAudioRef.current) {
      if (isPlaying) timelineAudioRef.current.pause();
      else timelineAudioRef.current.play();
    }
    setIsPlaying(prev => !prev);
  }, [isPlaying]);

  const handleTimelineSeek = useCallback((time: number) => {
    setPlaybackTime(time);
    if (timelineAudioRef.current) timelineAudioRef.current.currentTime = time;
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
    if (contentPlan) {
      let elapsed = 0;
      for (const scene of contentPlan.scenes) {
        if (scene.id === sceneId) {
          setPlaybackTime(elapsed);
          if (timelineAudioRef.current) timelineAudioRef.current.currentTime = elapsed;
          break;
        }
        const sceneDuration = narrationSegments.find(n => n.sceneId === scene.id)?.audioDuration || scene.duration;
        elapsed += sceneDuration;
      }
    }
  }, [contentPlan, narrationSegments]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isProcessing) return;

    const userInput = input.trim();
    addMessage('user', userInput);
    setInput('');
    setIsProcessing(true);
    setTyping(true);
    addMessage('assistant', t('common.loading'));

    try {
      const agentResponse: AgentResponse = await studioAgent.processMessage(userInput);
      const action = agentResponse.action;
      const messageUpdate: { content: string; quickActions?: QuickAction[] } = {
        content: agentResponse.message,
        quickActions: agentResponse.quickActions || []
      };

      switch (action.type) {
        case 'generate_music': {
          const p = action.params;
          updateLastMessage(messageUpdate);
          generateMusic({
            prompt: p.prompt ?? '',
            style: p.style,
            title: p.title,
            instrumental: p.instrumental,
            customMode: p.customMode,
            model: (p.model || 'V5') as 'V4' | 'V4_5' | 'V4_5PLUS' | 'V4_5ALL' | 'V5'
          });
          trackMusicGeneration();
          setShowMusic(true);
          break;
        }
        case 'create_video': {
          const videoParams = action.params;
          updateLastMessage(messageUpdate);
          setTopic(videoParams.topic);
          setTargetDuration(videoParams.duration || 60);
          setVisualStyle(videoParams.style || 'Cinematic');
          setVideoPurpose('documentary');
          trackVideoCreation({
            style: videoParams.style || 'Cinematic',
            duration: videoParams.duration || 60,
          });
          startProduction({
            sessionId: sessionId || project?.cloudSessionId,
            skipNarration: false,
            targetDuration: videoParams.duration || 60,
            visualStyle: videoParams.style || 'Cinematic',
            contentPlannerConfig: {
              videoPurpose: 'documentary',
              visualStyle: videoParams.style || 'Cinematic',
            },
          }, videoParams.topic);
          break;
        }
        case 'export_video': {
          setShowExport(true);
          updateLastMessage(messageUpdate);
          break;
        }
        case 'modify_settings': {
          const settings = action.settings;
          if (typeof settings.targetAudience === 'string') setTargetAudience(settings.targetAudience);
          if (typeof settings.style === 'string') setVisualStyle(settings.style);
          if (typeof settings.duration === 'number') setTargetDuration(settings.duration);
          if (typeof settings.mood === 'string') setVideoPurpose(settings.mood as typeof videoPurpose);
          if (typeof settings.cameraAngle === 'string') setPreferredCameraAngle(settings.cameraAngle);
          if (typeof settings.lightingMood === 'string') setPreferredLightingMood(settings.lightingMood);

          const applied = [
            typeof settings.targetAudience === 'string' ? `audience: ${settings.targetAudience}` : null,
            typeof settings.style === 'string' ? `style: ${settings.style}` : null,
            typeof settings.duration === 'number' ? `duration: ${settings.duration}s` : null,
            typeof settings.cameraAngle === 'string' ? `camera: ${settings.cameraAngle}` : null,
            typeof settings.lightingMood === 'string' ? `lighting: ${settings.lightingMood}` : null,
          ].filter(Boolean).join(', ');

          updateLastMessage({
            content: applied
              ? `Updated settings (${applied}).`
              : 'I can update audience, style, duration, camera angle, and lighting right now.',
            quickActions: messageUpdate.quickActions,
          });
          break;
        }
        case 'show_preview': {
          updateLastMessage(messageUpdate);
          if (contentPlan) {
            setShowTimeline(true);
          } else {
            addMessage('assistant', 'Create a video first so I can show you a preview.');
          }
          break;
        }
        case 'add_vocals': {
          updateLastMessage(messageUpdate);
          setMusicModalMode('remix');
          setShowMusic(true);
          await addVocals({
            uploadUrl: action.params.uploadUrl,
            prompt: action.params.prompt,
            title: contentPlan?.title || topic || 'With Vocals',
            model: 'V4_5PLUS',
          });
          addMessage('assistant', 'Vocals remix started in the music panel.');
          break;
        }
        case 'generate_cover': {
          updateLastMessage(messageUpdate);
          setMusicModalMode('remix');
          setShowMusic(true);
          const taskId = action.params.taskId || musicState.taskId;
          if (!taskId) {
            addMessage('assistant', 'Generate a track first so I can create a cover.');
            break;
          }
          await generateCover(taskId);
          addMessage('assistant', 'Cover generation started.');
          break;
        }
        case 'create_music_video': {
          updateLastMessage(messageUpdate);
          setMusicModalMode('remix');
          setShowMusic(true);
          const selectedTrack = musicState.generatedTracks.find((track) => track.id === musicState.selectedTrackId) || musicState.generatedTracks[0] || null;
          const taskId = action.params.taskId || musicState.taskId;
          const audioId = action.params.audioId || selectedTrack?.id;
          if (!taskId || !audioId) {
            addMessage('assistant', 'Generate and select a track first so I can create a music video.');
            break;
          }
          await createMusicVideo(taskId, audioId);
          addMessage('assistant', 'Music video generation started.');
          break;
        }
        case 'mix_audio': {
          updateLastMessage(messageUpdate);
          if (!contentPlan || narrationSegments.length === 0) {
            addMessage('assistant', 'Generate narration first so I can mix the audio.');
            break;
          }
          const p = action.params;
          const mixedBlob = await mixAudio(contentPlan, narrationSegments, {
            includeSfx: p.includeSfx,
            includeMusic: p.includeMusic,
          });
          if (mixedBlob) {
            if (mergedAudioUrlRef.current) URL.revokeObjectURL(mergedAudioUrlRef.current);
            const nextUrl = URL.createObjectURL(mixedBlob);
            mergedAudioUrlRef.current = nextUrl;
            setMergedAudioUrl(nextUrl);
            setShowTimeline(true);
            addMessage('assistant', 'Audio mix updated.');
          }
          break;
        }
        case 'show_quality_history': {
          updateLastMessage(messageUpdate);
          const history = getQualityHistoryData();
          const trend = getQualityTrend();
          if (!history.length) {
            addMessage('assistant', 'No quality history is available yet. Generate a quality report first.');
            break;
          }
          addMessage(
            'assistant',
            trend
              ? `Quality history: ${history.length} reports. Trend: ${trend.trend}. Average overall score: ${Math.round(trend.avgOverall)}/100.`
              : `Quality history: ${history.length} reports.`
          );
          break;
        }
        case 'refine_prompt': {
          updateLastMessage(messageUpdate);
          const p = action.params;
          if (!p.promptText) {
            addMessage('assistant', 'I need a prompt to refine.');
            break;
          }
          const intent = p.intent === 'more_detailed' || p.intent === 'more_cinematic' || p.intent === 'shorten'
            ? p.intent
            : 'auto';
          const result = await improvePrompt(p.promptText, intent);
          setInput(result.refinedPrompt);
          addMessage('assistant', `Refined prompt:\n${result.refinedPrompt}`);
          break;
        }
        case 'lint_prompt': {
          updateLastMessage(messageUpdate);
          const p = action.params;
          if (!p.promptText) {
            addMessage('assistant', 'I need a prompt to lint.');
            break;
          }
          const issues = checkPromptQuality(p.promptText, topic);
          addMessage(
            'assistant',
            issues.length === 0
              ? 'No major prompt issues found.'
              : `Prompt issues:\n- ${issues.map((issue) => issue.message).join('\n- ')}`
          );
          break;
        }
        case 'browse_sfx': {
          updateLastMessage(messageUpdate);
          try {
            const sound = await browseSfx(action.params.category);
            if (sound) {
              addMessage('assistant', `Found SFX: "${sound.name}" (${sound.duration.toFixed(1)}s)`);
            }
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            addMessage('assistant', `SFX search failed: ${errMsg}`);
          }
          break;
        }
        case 'set_camera_style': {
          if (action.params.angle) setPreferredCameraAngle(action.params.angle);
          if (action.params.lighting) setPreferredLightingMood(action.params.lighting);
          updateLastMessage(messageUpdate);
          break;
        }
        case 'show_quality_report': {
          if (qualityReport) {
            setShowQuality(true);
            updateLastMessage(messageUpdate);
          } else {
            addMessage('assistant', 'Generate a quality report first.');
          }
          break;
        }
        case 'respond': {
          updateLastMessage(messageUpdate);
          break;
        }
        case 'ask_clarification': {
          updateLastMessage({
            content: [messageUpdate.content, action.question].filter(Boolean).join('\n\n'),
            quickActions: messageUpdate.quickActions,
          });
          break;
        }
        case 'reset': {
          handleReset();
          break;
        }
      }
    } catch (err) {
      console.error('Agent error:', err);
      updateLastMessage({ content: t('errors.generic') });
    } finally {
      setTyping(false);
      setIsProcessing(false);
    }
  }, [
    input,
    isProcessing,
    addMessage,
    updateLastMessage,
    setTyping,
    generateMusic,
    trackMusicGeneration,
    trackVideoCreation,
    startProduction,
    sessionId,
    project?.cloudSessionId,
    setTopic,
    setTargetDuration,
    setVisualStyle,
    setVideoPurpose,
    setTargetAudience,
    setPreferredCameraAngle,
    setPreferredLightingMood,
    setShowExport,
    setShowMusic,
    setShowTimeline,
    setShowQuality,
    setMusicModalMode,
    contentPlan,
    narrationSegments,
    mergedAudioUrl,
    musicState,
    browseSfx,
    mixAudio,
    generateCover,
    createMusicVideo,
    addVocals,
    checkPromptQuality,
    improvePrompt,
    getQualityHistoryData,
    getQualityTrend,
    qualityReport,
    topic,
    t,
    handleReset,
    videoPurpose,
    setInput,
    setIsProcessing,
  ]);

  const handleQuickAction = useCallback(async (action: { type: string; params?: Record<string, unknown> }) => {
    if (isProcessing) return;

    setIsProcessing(true);
    setTyping(true);
    updateLastMessage({ quickActions: [] });

    try {
      switch (action.type) {
        case 'create_video': {
          const p = action.params as { topic: string; duration?: number; style?: string } | undefined;
          if (!p?.topic) break;
          addMessage('assistant', `🎬 Creating ${p.duration || 60}s ${p.style || 'Cinematic'} video...`);
          setTopic(p.topic);
          setTargetDuration(p.duration || 60);
          setVisualStyle(p.style || 'Cinematic');
          setVideoPurpose('documentary');

          trackVideoCreation({
            style: p.style || 'Cinematic',
            duration: p.duration || 60
          });

          startProduction({
            skipNarration: false,
            targetDuration: p.duration || 60,
            visualStyle: p.style || 'Cinematic',
            contentPlannerConfig: {
              videoPurpose: 'documentary',
              visualStyle: p.style || 'Cinematic',
            }
          }, p.topic);
          break;
        }
        case 'generate_music': {
          const p = action.params as { prompt?: string; style?: string; instrumental?: boolean } | undefined;
          addMessage('assistant', `🎵 Creating ${p?.style || 'music'}...`);
          generateMusic({
            prompt: p?.prompt ?? "",
            style: p?.style,
            instrumental: p?.instrumental ?? true,
            model: 'V5'
          });
          trackMusicGeneration();
          setShowMusic(true);
          break;
        }
        case 'ask_clarification': {
          const clarificationAction = action as { type: 'ask_clarification'; question?: string };
          if (clarificationAction.question) {
            setInput(clarificationAction.question);
          }
          break;
        }
        default:
          console.warn('Unknown quick action type:', action.type);
      }
    } catch (err) {
      console.error('Quick action error:', err);
      addMessage('assistant', t('errors.generic'));
    }

    setTyping(false);
    setIsProcessing(false);
  }, [isProcessing, addMessage, updateLastMessage, setTyping, setTopic, setTargetDuration, setVisualStyle, setVideoPurpose, startProduction, generateMusic, t, setShowMusic, setInput, setIsProcessing, trackVideoCreation, trackMusicGeneration]);

  const handleFeedback = useCallback((
    messageId: string,
    feedback: { helpful: boolean; rating: number; comment?: string }
  ) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const agentMessage = messages[messageIndex];
    const userMessage = messages[messageIndex - 1];

    if (!agentMessage) return;

    recordFeedback({
      messageId,
      userMessage: userMessage?.content || '',
      agentResponse: agentMessage.content,
      helpful: feedback.helpful,
      rating: feedback.rating,
      comment: feedback.comment,
      timestamp: Date.now(),
    });

    console.log('[Feedback] Recorded:', feedback.helpful ? '👍 Helpful' : '👎 Not helpful');
  }, [messages, recordFeedback]);

  const handleExport = useCallback(async (
    config: { presetId: string; width: number; height: number; orientation: 'landscape' | 'portrait'; quality: ExportQualityPreset },
    onProgress?: (percent: number) => void
  ) => {
    if (!contentPlan || narrationSegments.length === 0 || !mergedAudioUrl) {
      throw new Error('Video not ready for export');
    }

    if (import.meta.env.DEV && exportInterceptorRef.current) {
      onProgress?.(30);
      await exportInterceptorRef.current({
        config,
        title: contentPlan.title,
        sceneCount: contentPlan.scenes.length,
        narrationCount: narrationSegments.length,
        hasMergedAudio: Boolean(mergedAudioUrl),
      });
      onProgress?.(100);
      return;
    }

    await flushSession();

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
      mood: getEffectiveLegacyTone(scene),
      timestampSeconds: parsedSubtitles[idx]?.startTime || 0,
    }));

    const generatedImages = visuals.filter(v => v.imageUrl).map(v => ({
      ...v,
      imageUrl: v.cachedBlobUrl || v.imageUrl,
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
        startTime: subtitle?.startTime ?? 0,
        duration: narration?.audioDuration || scene.duration,
      };
    });

    const { exportVideoWithFFmpeg } = await import('@/services/ffmpeg/exporters');

    const result = await exportVideoWithFFmpeg(
      songData,
      (p) => onProgress?.(p.progress),
      {
        orientation: config.orientation,
        width: config.width,
        height: config.height,
        quality: config.quality,
        useModernEffects: true,
        transitionType: 'dissolve',
        transitionDuration: 1.5,
        contentMode: 'story',
        sfxPlan,
        sceneTimings,
      },
      {
        projectId,
        cloudSessionId: sessionId || project?.cloudSessionId,
        userId: getCurrentUser()?.uid,
      }
    );

    const blob = result.blob ?? result;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contentPlan.title || 'video'}-${config.presetId}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (projectId) {
      syncProjectMetadata({
        hasExport: true,
        status: 'completed',
      });
    }
  }, [contentPlan, narrationSegments, mergedAudioUrl, visuals, sfxPlan, projectId, project, sessionId, flushSession, syncProjectMetadata]);

  // ── Render ──

  return (
    <>
      {/* Welcome State */}
      {messages.length === 1 && !contentPlan && (
        <div className="text-center mb-12 pt-12">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-linear-to-br from-primary/20 to-accent/20 border border-border flex items-center justify-center" aria-hidden="true">
            <Wand2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-light text-white mb-3">{t('studio.placeholder')}</h1>
        </div>
      )}

      {/* Messages */}
      <div className="space-y-6" role="log" aria-live="polite" aria-label="Chat messages">
        {messages.map((message, i) => (
          <BlurFade key={message.id} delay={Math.min(i * 0.04, 0.3)} yOffset={8}>
            <MessageBubble
              message={message}
              isRTL={isRTL}
              onQuickAction={handleQuickAction}
              onFeedback={handleFeedback}
            />
          </BlurFade>
        ))}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm max-w-2xl mx-auto" role="alert">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Video Preview Card */}
      {contentPlan && (
        <VideoPreviewCard
          scenes={contentPlan.scenes}
          visualsMap={visualsMap}
          currentSceneIndex={currentSceneIndex}
          onSceneSelect={setCurrentSceneIndex}
          isPlaying={isPlaying}
          onPlayPause={() => setIsPlaying(!isPlaying)}
          isReady={isVideoReady}
          totalDuration={totalDuration}
          scenesLabel={t('studio.scenes')}
          doneLabel={t('common.done')}
          isRTL={isRTL}
          className="mt-8 mb-4"
        />
      )}

      {/* Timeline Editor */}
      {showTimeline && contentPlan && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="mt-4"
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
          />
          <audio
            ref={timelineAudioRef}
            src={mergedAudioUrl || undefined}
            onTimeUpdate={(e) => setPlaybackTime(e.currentTarget.currentTime)}
            onEnded={() => setIsPlaying(false)}
          />
        </motion.div>
      )}

      {/* Quick Actions */}
      {messages.length === 1 && !contentPlan && (
        <>
          <QuickActions
            actions={quickActionItems}
            onSelect={(action) => setInput(action.prompt || '')}
            isRTL={isRTL}
          />
          <div className="flex justify-center">
            <button
              onClick={() => {
                setMusicModalMode('remix');
                setShowMusic(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/70 hover:text-white transition-all"
            >
              <Upload className="w-4 h-4 text-primary" />
              {t('common.upload')}
            </button>
          </div>
        </>
      )}

      {/* Modals & Panels */}
      <MusicGeneratorModal
        open={showMusic}
        onClose={() => {
          setShowMusic(false);
          setMusicModalMode('generate');
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

      {qualityReport && (
        <QualityDashboard
          report={qualityReport}
          isOpen={showQuality}
          onClose={() => setShowQuality(false)}
        />
      )}

      <SlidePanel
        isOpen={showSceneEditor && !!contentPlan}
        onClose={() => setShowSceneEditor(false)}
        title={t('studio.edit')}
        isRTL={isRTL}
      >
        {contentPlan && (
          <SceneEditor
            scenes={contentPlan.scenes}
            onChange={updateScenes}
            onPlayNarration={playNarration}
            onRegenerateNarration={regenerateSceneNarration}
            playingSceneId={playingSceneId}
            visuals={visualsMap}
            narrationUrls={getAudioUrlMap()}
          />
        )}
      </SlidePanel>

      <QuickExport
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        onExport={handleExport}
        videoTitle={contentPlan?.title}
        duration={totalDuration}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        videoPurpose={videoPurpose}
        onVideoPurposeChange={setVideoPurpose}
        targetAudience={targetAudience}
        onTargetAudienceChange={setTargetAudience}
        veoVideoCount={veoVideoCount}
        onVeoVideoCountChange={setVeoVideoCount}
        selectedStyle={visualStyle || paramsStyle || 'Cinematic'}
        onStyleChange={setVisualStyle}
      />
    </>
  );
}
