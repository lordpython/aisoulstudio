/**
 * Studio Screen - Unified creation workspace
 *
 * Refactored to use extracted components for better maintainability.
 * Requirements: 6.1-6.6, 2.5, 1.5, 9.1, 9.4
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Video,
  Music as MusicIcon,
  Image as ImageIcon,
  Download,
  RotateCcw,
  Wand2,
  BarChart3,
  Edit3,
  Layers,
  Upload,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { useVideoProductionRefactored } from '@/hooks/useVideoProductionRefactored';
import { useModalState } from '@/hooks/useModalState';
import { AppState } from '@/types';

// Layout & UI Components
import { ScreenLayout } from '@/components/layout/ScreenLayout';
import { SlidePanel } from '@/components/ui/SlidePanel';

// Chat Components
import { MessageBubble, ChatInput, QuickActions, type ChatMessage } from '@/components/chat';

// Feature Components
import { QuickExport } from '@/components/QuickExport';
import { VideoPreviewCard } from '@/components/VideoPreviewCard';
import { studioAgent, type AgentResponse, type QuickAction } from '@/services/ai/studioAgent';
import QualityDashboard from '@/components/QualityDashboard';
import SceneEditor from '@/components/SceneEditor';
import MusicGeneratorModal from '@/components/MusicGeneratorModal';
import { SettingsModal } from '@/components/SettingsModal';
import { GraphiteTimeline } from '@/components/TimelineEditor';
import { useAppStore } from '@/stores';
import { useStoryGeneration } from '@/hooks/useStoryGeneration';
import { StoryWorkspace } from '@/components/story';

// ============================================================
// Types & Helpers
// ============================================================

export interface StudioParams {
  mode?: 'video' | 'music';
  style?: string;
  duration?: number;
  topic?: string;
}

export function parseStudioParams(searchParams: URLSearchParams): StudioParams {
  const mode = searchParams.get('mode');
  const style = searchParams.get('style');
  const duration = searchParams.get('duration');
  const topic = searchParams.get('topic');

  return {
    mode: mode === 'video' || mode === 'music' ? mode : undefined,
    style: style || undefined,
    duration: duration ? parseInt(duration, 10) : undefined,
    topic: topic || undefined,
  };
}

// ============================================================
// Main Component
// ============================================================

export default function StudioScreen() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = parseStudioParams(searchParams);

  // View mode toggle (Requirement 6.6)
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple');
  const [studioMode, setStudioMode] = useState<'chat' | 'story'>('chat');

  // Story Generation Hook
  const storyHook = useStoryGeneration();

  // Modal state (unified)
  const {
    showExport, setShowExport,
    showQuality, setShowQuality,
    showSceneEditor, setShowSceneEditor,
    showMusic, setShowMusic,
    showTimeline, setShowTimeline,
  } = useModalState();
  const [showSettings, setShowSettings] = useState(false);

  const [musicModalMode, setMusicModalMode] = useState<'generate' | 'remix'>('generate');

  // Video production hook
  const {
    appState,
    contentPlan,
    narrationSegments,
    sfxPlan,
    error,
    setTopic,
    targetAudience,
    setTargetAudience,
    setTargetDuration,
    setVideoPurpose,
    setVisualStyle,
    startProduction,
    reset,
    getVisualsMap,
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
    browseSfx,
    setPreferredCameraAngle,
    setPreferredLightingMood,
    uploadAudio,
    uploadAndCover,
    addVocals,
    addInstrumental,
    veoVideoCount,
    setVeoVideoCount,
    topic,
  } = useVideoProductionRefactored();

  // App Store - Chat & UI State (persistent)
  const storeMessages = useAppStore((s) => s.messages);
  const addMessage = useAppStore((s) => s.addMessage);
  const clearMessages = useAppStore((s) => s.clearMessages);
  const updateLastMessage = useAppStore((s) => s.updateLastMessage);
  const setTyping = useAppStore((s) => s.setTyping);
  const trackVideoCreation = useAppStore((s) => s.trackVideoCreation);
  const trackMusicGeneration = useAppStore((s) => s.trackMusicGeneration);
  const recordFeedback = useAppStore((s) => s.recordFeedback);

  // Local UI state
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Video preview state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const previewIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Timeline playback state
  const [playbackTime, setPlaybackTime] = useState(0);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const timelineAudioRef = useRef<HTMLAudioElement>(null);
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const paramsAppliedRef = useRef(false);

  // ============================================================
  // Effects
  // ============================================================

  // Apply URL parameters on mount (Requirement 2.5)
  useEffect(() => {
    if (paramsAppliedRef.current) return;
    paramsAppliedRef.current = true;

    if (params.mode === 'video') {
      if (params.style) setVisualStyle(params.style);
      if (params.duration) setTargetDuration(params.duration);
      setVideoPurpose('documentary');

      if (params.topic) {
        setTopic(params.topic);
        addMessage('assistant', t('studio.generating'));
        setTimeout(() => {
          startProduction({
            skipNarration: false,
            targetDuration: params.duration || 60,
            visualStyle: params.style || 'Cinematic',
            contentPlannerConfig: {
              videoPurpose: 'documentary',
              visualStyle: params.style || 'Cinematic',
            }
          }, params.topic);
        }, 500);
      }
    } else if (params.mode === 'music') {
      setShowMusic(true);
    }
  }, [params, setVisualStyle, setTargetDuration, setVideoPurpose, setTopic, startProduction, addMessage, t, setShowMusic]);

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
        setMergedAudioUrl(URL.createObjectURL(mergedBlob));
      } catch (err) {
        console.error('Failed to merge audio:', err);
      }
    };
    mergeAudio();
  }, [contentPlan, narrationSegments]);

  // Handle preview playback
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

  // ============================================================
  // Computed Values
  // ============================================================

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
    return contentPlan && narrationSegments.length > 0 && appState === AppState.READY;
  }, [contentPlan, narrationSegments, appState]);

  const visualsMap = getVisualsMap();

  const totalDuration = useMemo(() => {
    return narrationSegments.reduce((sum, n) => sum + n.audioDuration, 0);
  }, [narrationSegments]);

  // ============================================================
  // Handlers
  // ============================================================

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
      const messageUpdate: { content: string; quickActions?: QuickAction[] } = {
        content: agentResponse.message,
        quickActions: agentResponse.quickActions || []
      };

      switch (agentResponse.action.type) {
        case 'generate_music': {
          const params = agentResponse.action.params as { prompt?: string; style?: string; title?: string; instrumental?: boolean; customMode?: boolean };
          updateLastMessage(messageUpdate);
          generateMusic({
            prompt: params.prompt ?? "",
            style: params.style,
            title: params.title,
            instrumental: params.instrumental,
            customMode: params.customMode,
            model: 'V5'
          });
          trackMusicGeneration();
          setShowMusic(true);
          break;
        }
        case 'create_video': {
          const params = agentResponse.action.params as { topic: string; duration?: number; style?: string };
          updateLastMessage(messageUpdate);
          setTopic(params.topic);
          setTargetDuration(params.duration || 60);
          setVisualStyle(params.style || 'Cinematic');
          setVideoPurpose('documentary');

          // Track video creation with actual params
          trackVideoCreation({
            style: params.style || 'Cinematic',
            duration: params.duration || 60
          });

          startProduction({
            skipNarration: false,
            targetDuration: params.duration || 60,
            visualStyle: params.style || 'Cinematic',
            contentPlannerConfig: {
              videoPurpose: 'documentary',
              visualStyle: params.style || 'Cinematic',
            }
          }, params.topic);
          break;
        }
        case 'export_video': {
          setShowExport(true);
          updateLastMessage(messageUpdate);
          break;
        }
        case 'reset': {
          handleReset();
          break;
        }
        case 'browse_sfx': {
          const params = agentResponse.action.params as { category: string };
          updateLastMessage(messageUpdate);
          try {
            const sound = await browseSfx(params.category);
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
          const params = agentResponse.action.params as { angle?: string; lighting?: string };
          if (params.angle) setPreferredCameraAngle(params.angle);
          if (params.lighting) setPreferredLightingMood(params.lighting);
          updateLastMessage(messageUpdate);
          break;
        }
        case 'show_quality_report': {
          if (qualityReport) {
            setShowQuality(true);
            updateLastMessage(messageUpdate);
          } else {
            updateLastMessage({ content: t('common.error') });
          }
          break;
        }
        default: {
          updateLastMessage(messageUpdate);
        }
      }
    } catch (err) {
      console.error('Agent error:', err);
      updateLastMessage({ content: t('errors.generic') });
    }

    setTyping(false);
    setIsProcessing(false);
  }, [input, isProcessing, addMessage, updateLastMessage, setTyping, setTopic, setTargetDuration, setVisualStyle, setVideoPurpose, startProduction, handleReset, browseSfx, setPreferredCameraAngle, setPreferredLightingMood, qualityReport, generateMusic, t, setShowMusic, setShowExport, setShowQuality]);

  const handleQuickAction = useCallback(async (action: { type: string; params?: Record<string, unknown> }) => {
    if (isProcessing) return;

    setIsProcessing(true);
    setTyping(true);
    updateLastMessage({ quickActions: [] });

    try {
      switch (action.type) {
        case 'create_video': {
          const params = action.params as { topic: string; duration?: number; style?: string } | undefined;
          if (!params?.topic) break;
          addMessage('assistant', `🎬 Creating ${params.duration || 60}s ${params.style || 'Cinematic'} video...`);
          setTopic(params.topic);
          setTargetDuration(params.duration || 60);
          setVisualStyle(params.style || 'Cinematic');
          setVideoPurpose('documentary');

          // Track video creation with actual params
          trackVideoCreation({
            style: params.style || 'Cinematic',
            duration: params.duration || 60
          });

          startProduction({
            skipNarration: false,
            targetDuration: params.duration || 60,
            visualStyle: params.style || 'Cinematic',
            contentPlannerConfig: {
              videoPurpose: 'documentary',
              visualStyle: params.style || 'Cinematic',
            }
          }, params.topic);
          break;
        }
        case 'generate_music': {
          const params = action.params as { prompt?: string; style?: string; instrumental?: boolean } | undefined;
          addMessage('assistant', `🎵 Creating ${params?.style || 'music'}...`);
          generateMusic({
            prompt: params?.prompt ?? "",
            style: params?.style,
            instrumental: params?.instrumental ?? true,
            model: 'V5'
          });
          trackMusicGeneration();
          setShowMusic(true);
          break;
        }
        case 'ask_clarification': {
          // Handle clarification requests - just send the message
          const params = action.params as { message?: string } | undefined;
          if (params?.message) {
            setInput(params.message);
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
  }, [isProcessing, addMessage, updateLastMessage, setTyping, setTopic, setTargetDuration, setVisualStyle, setVideoPurpose, startProduction, generateMusic, t, setShowMusic, setInput]);

  // Feedback handler
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
    config: { presetId: string; width: number; height: number; orientation: 'landscape' | 'portrait'; quality: string },
    onProgress?: (percent: number) => void
  ) => {
    if (!contentPlan || narrationSegments.length === 0 || !mergedAudioUrl) {
      throw new Error('Video not ready for export');
    }

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
        imageUrl: url!,
        type: url!.includes('.mp4') || url!.includes('video') ? 'video' as const : 'image' as const,
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

    const { exportVideoClientSide } = await import('@/services/ffmpeg/exporters');

    const blob = await exportVideoClientSide(
      songData,
      (p) => onProgress?.(p.progress),
      {
        orientation: config.orientation,
        useModernEffects: true,
        transitionType: 'dissolve',
        transitionDuration: 1.5,
        contentMode: 'story',
        sfxPlan,
        sceneTimings,
      }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contentPlan.title || 'video'}-${config.presetId}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [contentPlan, narrationSegments, mergedAudioUrl, visualsMap, sfxPlan]);

  // Quick actions for welcome state
  const quickActionItems = useMemo(() => [
    { icon: MusicIcon, label: t('home.createMusic'), prompt: 'Generate an upbeat synthwave track about city lights at night' },
    { icon: Video, label: t('home.createVideo'), prompt: 'Create a cinematic travel video about exploring ancient Rome' },
    { icon: ImageIcon, label: t('home.visualizer'), prompt: 'Generate a documentary about the journey of a coffee bean' },
  ], [t]);

  // ============================================================
  // Render
  // ============================================================

  const headerActions = (
    <div className="flex items-center gap-2" role="toolbar" aria-label="Studio actions">
      {/* Mode Toggle Selection */}
      <div className="flex items-center bg-zinc-900 border border-zinc-700/50 rounded-lg p-0.5 me-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStudioMode('chat')}
          className={cn(
            "h-7 px-3 text-[10px] uppercase font-bold transition-all",
            studioMode === 'chat' ? "bg-violet-600 text-white shadow-lg" : "text-zinc-500 hover:text-white"
          )}
        >
          Chat Mode
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStudioMode('story')}
          className={cn(
            "h-7 px-3 text-[10px] uppercase font-bold transition-all",
            studioMode === 'story' ? "bg-blue-600 text-white shadow-lg" : "text-zinc-500 hover:text-white"
          )}
        >
          Story Mode
        </Button>
      </div>

      {/* Simple/Advanced toggle */}
      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1" role="group" aria-label="View mode">
        <button
          onClick={() => setViewMode('simple')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
            viewMode === 'simple'
              ? 'bg-violet-600 text-white'
              : 'text-white/60 hover:text-white'
          )}
          aria-pressed={viewMode === 'simple'}
        >
          {t('studio.simpleMode')}
        </button>
        <button
          onClick={() => setViewMode('advanced')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
            viewMode === 'advanced'
              ? 'bg-violet-600 text-white'
              : 'text-white/60 hover:text-white'
          )}
          aria-pressed={viewMode === 'advanced'}
        >
          {t('studio.advancedMode')}
        </button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowSettings(true)}
        className="text-white/50 hover:text-white hover:bg-white/5"
      >
        <Settings className="w-4 h-4 me-2" />
        {t('studio.settings')}
      </Button>

      {/* Action buttons */}
      {(messages.length > 1 || contentPlan) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="text-white/50 hover:text-white hover:bg-white/5"
        >
          <RotateCcw className="w-4 h-4 me-2" aria-hidden="true" />
          {t('studio.newProject')}
        </Button>
      )}
      {isVideoReady && (
        <>
          <Button
            variant={showSceneEditor ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowSceneEditor(!showSceneEditor)}
            className={cn(
              'gap-2',
              showSceneEditor
                ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            )}
            aria-pressed={showSceneEditor}
          >
            <Edit3 className="w-4 h-4" aria-hidden="true" />
            {t('studio.edit')}
          </Button>
          {qualityReport && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowQuality(true)}
              className="text-white/50 hover:text-white hover:bg-white/5 gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              {t('studio.quality')}
            </Button>
          )}
          <Button
            variant={showTimeline ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowTimeline(!showTimeline)}
            className={cn(
              'gap-2',
              showTimeline
                ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            )}
          >
            <Layers className="w-4 h-4" />
            {t('studio.timeline')}
          </Button>
          <Button
            onClick={() => setShowExport(true)}
            size="sm"
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
          >
            <Download className="w-4 h-4" />
            {t('studio.export')}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <ScreenLayout
      title={t('studio.title')}
      showBackButton
      onBack={() => navigate('/')}
      headerActions={headerActions}
      contentClassName={cn("py-8", studioMode === 'story' && "p-0")}
      footer={
        studioMode === 'chat' ? (
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder={t('studio.placeholder')}
            disabled={appState !== AppState.IDLE}
            isLoading={isProcessing || appState !== AppState.IDLE}
            isRTL={isRTL}
            hintText={`${t('studio.send')} (Enter)`}
            inputId="studio-input"
          />
        ) : null
      }
    >
      {studioMode === 'story' ? (
        <StoryWorkspace
          storyState={storyHook.state}
          initialTopic={topic || ''}
          onGenerateIdea={(storyTopic, genre) => {
            storyHook.generateBreakdown(storyTopic, genre);
          }}
          onExportScript={storyHook.exportScreenplay}
          onRegenerateScene={storyHook.regenerateScene}
          onVerifyConsistency={storyHook.verifyConsistency}
          onUndo={storyHook.undo}
          onRedo={storyHook.redo}
          canUndo={storyHook.canUndo}
          canRedo={storyHook.canRedo}
          onNextStep={() => {
            const step = storyHook.state.currentStep;
            if (step === 'idea') {
              storyHook.generateBreakdown(topic || "A generic story", "Drama");
            } else if (step === 'breakdown') {
              storyHook.generateScreenplay();
            } else if (step === 'script') {
              storyHook.generateCharacters();
            } else if (step === 'characters') {
              storyHook.generateShotlist();
            }
          }}
          isProcessing={storyHook.isProcessing}
          progress={storyHook.progress}
        />
      ) : (
        <>
          {/* Welcome State */}
          {messages.length === 1 && !contentPlan && (
            <div className="text-center mb-12 pt-12">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-linear-to-br from-violet-600/20 to-fuchsia-600/20 border border-white/10 flex items-center justify-center" aria-hidden="true">
                <Wand2 className="w-8 h-8 text-violet-400" />
              </div>
              <h1 className="text-3xl font-light text-white mb-3">{t('studio.placeholder')}</h1>
            </div>
          )}

          {/* Messages */}
          <div className="space-y-6" role="log" aria-live="polite" aria-label="Chat messages">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isRTL={isRTL}
                onQuickAction={handleQuickAction}
                onFeedback={handleFeedback}
              />
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
              isReady={isVideoReady ?? false}
              totalDuration={totalDuration}
              scenesLabel={t('studio.scenes')}
              doneLabel={t('common.done')}
              isRTL={isRTL}
              className="mt-8 mb-4"
            />
          )}

          {/* Timeline Editor (Requirement 6.3) */}
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
                  <Upload className="w-4 h-4 text-violet-400" />
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
            contentType={params.mode === 'music' ? 'music' : 'story'}
            onContentTypeChange={() => { }}
            videoPurpose={params.mode === 'video' ? 'documentary' : 'music_video'}
            onVideoPurposeChange={(purpose) => {
              if (purpose !== 'documentary') setVideoPurpose(purpose);
            }}
            targetAudience={targetAudience}
            onTargetAudienceChange={setTargetAudience}
            generationMode={params.mode === 'music' ? 'image' : 'video'}
            onGenerationModeChange={() => { }}
            videoProvider="veo"
            onVideoProviderChange={() => { }}
            veoVideoCount={veoVideoCount}
            onVeoVideoCountChange={setVeoVideoCount}
            aspectRatio="16:9"
            onAspectRatioChange={() => { }}
            selectedStyle={params.style || 'Cinematic'}
            onStyleChange={(style: string) => setVisualStyle(style)}
            globalSubject=""
            onGlobalSubjectChange={() => { }}
          />
        </>
      )}
    </ScreenLayout>
  );
}
