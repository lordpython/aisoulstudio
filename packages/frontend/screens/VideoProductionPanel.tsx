/**
 * VideoProductionPanel - chat/video production mode, extracted from StudioScreen
 *
 * Renders the chat messages, video preview, timeline editor, quick actions,
 * and all modals (music, scene editor, export, settings) for the chat/video
 * production workflow.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Wand2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageBubble, QuickActions, type ChatMessage } from '@/components/chat';
import { QuickExport } from '@/components/QuickExport';
import { VideoPreviewCard } from '@/components/VideoPreviewCard';
import QualityDashboard from '@/components/QualityDashboard';
import SceneEditor from '@/components/SceneEditor';
import MusicGeneratorModal from '@/components/MusicGeneratorModal';
import { SettingsModal } from '@/components/SettingsModal';
import { GraphiteTimeline } from '@/components/TimelineEditor';
import { SlidePanel } from '@/components/ui/SlidePanel';
import type { ExportQualityPreset } from '@/services/ffmpeg/exportConfig';
import type {
  ContentPlan,
  NarrationSegment,
  GeneratedImage,
} from '@/types';
import type { useVideoProductionRefactored } from '@/hooks/useVideoProductionRefactored';
import type { useModalState } from '@/hooks/useModalState';
import type { QuickAction } from '@/services/ai/studioAgent';

type VideoProductionHook = ReturnType<typeof useVideoProductionRefactored>;
type ModalState = ReturnType<typeof useModalState>;

export interface VideoProductionPanelProps {
  // Translation & layout
  t: (key: string) => string;
  isRTL: boolean;

  // Chat messages & refs
  messages: ChatMessage[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  error: string | null | undefined;

  // Content plan & visuals
  contentPlan: ContentPlan | null;
  visualsMap: Record<string, GeneratedImage>;
  narrationSegments: NarrationSegment[];
  isVideoReady: boolean | null | undefined;
  totalDuration: number;

  // Preview playback
  currentSceneIndex: number;
  onSceneSelect: (idx: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;

  // Timeline
  showTimeline: boolean;
  playbackTime: number;
  selectedSceneId: string | null;
  timelineAudioRef: React.RefObject<HTMLAudioElement | null>;
  mergedAudioUrl: string | null;
  onTimelinePlayPause: () => void;
  onTimelineSeek: (time: number) => void;
  onTimelineSceneSelect: (sceneId: string) => void;
  sfxPlan: VideoProductionHook['sfxPlan'];

  // Quick actions (welcome state)
  quickActionItems: { icon: React.ElementType; label: string; prompt: string }[];
  onSetInput: (value: string) => void;
  onSetMusicModalMode: (mode: 'generate' | 'remix') => void;

  // Message handlers
  onQuickAction: (action: { type: string; params?: Record<string, unknown> }) => void;
  onFeedback: (messageId: string, feedback: { helpful: boolean; rating: number; comment?: string }) => void;

  // Export handler
  onExport: (
    config: { presetId: string; width: number; height: number; orientation: 'landscape' | 'portrait'; quality: ExportQualityPreset },
    onProgress?: (percent: number) => void
  ) => Promise<void>;

  // Modal state
  showExport: boolean;
  onCloseExport: () => void;
  showQuality: boolean;
  onCloseQuality: () => void;
  showSceneEditor: boolean;
  onCloseSceneEditor: () => void;
  showMusic: boolean;
  onCloseMusic: () => void;
  onOpenMusic: () => void;
  showSettings: boolean;
  onCloseSettings: () => void;
  musicModalMode: 'generate' | 'remix';

  // Scene editor
  updateScenes: VideoProductionHook['updateScenes'];
  playNarration: VideoProductionHook['playNarration'];
  regenerateSceneNarration: VideoProductionHook['regenerateSceneNarration'];
  playingSceneId: VideoProductionHook['playingSceneId'];
  getAudioUrlMap: VideoProductionHook['getAudioUrlMap'];

  // Music
  musicState: VideoProductionHook['musicState'];
  generateMusic: VideoProductionHook['generateMusic'];
  generateLyrics: VideoProductionHook['generateLyrics'];
  selectTrack: VideoProductionHook['selectTrack'];
  addMusicToTimeline: VideoProductionHook['addMusicToTimeline'];
  refreshCredits: VideoProductionHook['refreshCredits'];
  uploadAudio: VideoProductionHook['uploadAudio'];
  uploadAndCover: VideoProductionHook['uploadAndCover'];
  addVocals: VideoProductionHook['addVocals'];
  addInstrumental: VideoProductionHook['addInstrumental'];
  onAddToTimeline: () => void;
  onAudioTimeUpdate: (time: number) => void;
  onAudioEnded: () => void;

  // Quality
  qualityReport: VideoProductionHook['qualityReport'];

  // Settings
  videoPurpose: VideoProductionHook['videoPurpose'];
  onVideoPurposeChange: VideoProductionHook['setVideoPurpose'];
  targetAudience: VideoProductionHook['targetAudience'];
  onTargetAudienceChange: VideoProductionHook['setTargetAudience'];
  veoVideoCount: VideoProductionHook['veoVideoCount'];
  onVeoVideoCountChange: VideoProductionHook['setVeoVideoCount'];
  visualStyle: string | undefined;
  paramsStyle: string | undefined;
  onStyleChange: VideoProductionHook['setVisualStyle'];
}

export function VideoProductionPanel({
  t,
  isRTL,
  messages,
  messagesEndRef,
  error,
  contentPlan,
  visualsMap,
  narrationSegments,
  isVideoReady,
  totalDuration,
  currentSceneIndex,
  onSceneSelect,
  isPlaying,
  onPlayPause,
  showTimeline,
  playbackTime,
  selectedSceneId,
  timelineAudioRef,
  mergedAudioUrl,
  onTimelinePlayPause,
  onTimelineSeek,
  onTimelineSceneSelect,
  sfxPlan,
  quickActionItems,
  onSetInput,
  onSetMusicModalMode,
  onQuickAction,
  onFeedback,
  onExport,
  showExport,
  onCloseExport,
  showQuality,
  onCloseQuality,
  showSceneEditor,
  onCloseSceneEditor,
  showMusic,
  onCloseMusic,
  onOpenMusic,
  showSettings,
  onCloseSettings,
  musicModalMode,
  updateScenes,
  playNarration,
  regenerateSceneNarration,
  playingSceneId,
  getAudioUrlMap,
  musicState,
  generateMusic,
  generateLyrics,
  selectTrack,
  addMusicToTimeline,
  refreshCredits,
  uploadAudio,
  uploadAndCover,
  addVocals,
  addInstrumental,
  onAddToTimeline,
  onAudioTimeUpdate,
  onAudioEnded,
  qualityReport,
  videoPurpose,
  onVideoPurposeChange,
  targetAudience,
  onTargetAudienceChange,
  veoVideoCount,
  onVeoVideoCountChange,
  visualStyle,
  paramsStyle,
  onStyleChange,
}: VideoProductionPanelProps) {
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
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isRTL={isRTL}
            onQuickAction={onQuickAction}
            onFeedback={onFeedback}
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
          onSceneSelect={onSceneSelect}
          isPlaying={isPlaying}
          onPlayPause={onPlayPause}
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
            onPlayPause={onTimelinePlayPause}
            onSeek={onTimelineSeek}
            onSceneSelect={onTimelineSceneSelect}
            selectedSceneId={selectedSceneId}
            projectName={contentPlan.title}
            sfxPlan={sfxPlan}
            className="rounded-xl overflow-hidden border border-white/5"
          />
          <audio
            ref={timelineAudioRef}
            src={mergedAudioUrl || undefined}
            onTimeUpdate={(e) => onAudioTimeUpdate(e.currentTarget.currentTime)}
            onEnded={onAudioEnded}
          />
        </motion.div>
      )}

      {/* Quick Actions */}
      {messages.length === 1 && !contentPlan && (
        <>
          <QuickActions
            actions={quickActionItems}
            onSelect={(action) => onSetInput(action.prompt || '')}
            isRTL={isRTL}
          />
          <div className="flex justify-center">
            <button
              onClick={() => {
                onSetMusicModalMode('remix');
                onOpenMusic();
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
        onClose={onCloseMusic}
        musicState={musicState}
        onGenerateMusic={generateMusic}
        onGenerateLyrics={generateLyrics}
        onSelectTrack={selectTrack}
        onAddToTimeline={onAddToTimeline}
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
          onClose={onCloseQuality}
        />
      )}

      <SlidePanel
        isOpen={showSceneEditor && !!contentPlan}
        onClose={onCloseSceneEditor}
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
        onClose={onCloseExport}
        onExport={onExport}
        videoTitle={contentPlan?.title}
        duration={totalDuration}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={onCloseSettings}
        videoPurpose={videoPurpose}
        onVideoPurposeChange={onVideoPurposeChange}
        targetAudience={targetAudience}
        onTargetAudienceChange={onTargetAudienceChange}
        veoVideoCount={veoVideoCount}
        onVeoVideoCountChange={onVeoVideoCountChange}
        selectedStyle={visualStyle || paramsStyle || 'Cinematic'}
        onStyleChange={onStyleChange}
      />
    </>
  );
}
