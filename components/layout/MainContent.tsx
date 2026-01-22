import React from "react";
import {
  Wand2,
  Loader2,
  Sparkles,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { AppState, SongData, AssetType, GeneratedImage, ImagePrompt } from "../../types";
import { LANGUAGES } from "../../constants";
import { QuickUpload } from "../QuickUpload";
import { ProcessingStep } from "../ProcessingStep";
import { ImageGenerator } from "../ImageGenerator";
import { TimelinePlayer } from "../TimelinePlayer";
import { TranscriptList } from "../TranscriptList";

export interface MainContentProps {
  appState: AppState;
  songData: SongData | null;
  errorMsg: string;
  isBulkGenerating: boolean;
  isTranslating: boolean;
  selectedStyle: string;
  targetLang: string;
  generationMode: "image" | "video";
  videoProvider: "veo" | "deapi";
  aspectRatio: string;
  globalSubject: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  contentType: "music" | "story";
  videoPurpose: string;
  onQuickStart: (file: File, aspectRatio: string) => void;
  onLoadDemo: (aspectRatio: string) => void;
  onImageGenerated: (img: GeneratedImage) => void;
  onGenerateAll: () => void;
  onTranslate: () => void;
  onAssetTypeChange: (promptId: string, assetType: AssetType) => void;
  onPlayStateChange: (playing: boolean) => void;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onTargetLangChange: (lang: string) => void;
  onReset: () => void;
  onSwitchToProduction: () => void;
  onSwitchToSleek?: () => void;
  onOpenSettings: () => void;
}

export const MainContent: React.FC<MainContentProps> = ({
  appState,
  songData,
  errorMsg,
  isBulkGenerating,
  isTranslating,
  selectedStyle,
  targetLang,
  generationMode,
  videoProvider,
  aspectRatio,
  globalSubject,
  isPlaying,
  currentTime,
  duration,
  contentType,
  onQuickStart,
  onLoadDemo,
  onImageGenerated,
  onGenerateAll,
  onTranslate,
  onAssetTypeChange,
  onPlayStateChange,
  onTimeUpdate,
  onDurationChange,
  onTargetLangChange,
  onReset,
  onSwitchToProduction,
  onSwitchToSleek,
  onOpenSettings,
}) => {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 w-full">
      <AnimatePresence mode="wait">
        {/* STATE: IDLE - Quick Upload */}
        {appState === AppState.IDLE && (
          <QuickUpload
            onFileSelect={onQuickStart}
            onLoadDemo={onLoadDemo}
            onSwitchToProduction={onSwitchToProduction}
            disabled={false}
          />
        )}

        {/* STATE: PROCESSING */}
        {(appState === AppState.PROCESSING_AUDIO ||
          appState === AppState.ANALYZING_LYRICS) && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full min-h-[50vh]"
            >
              <ProcessingStep currentStep={appState} />
            </motion.div>
          )}

        {/* STATE: ERROR */}
        {appState === AppState.ERROR && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto mt-20 p-6 bg-destructive/10 border border-destructive/20 rounded-2xl text-center"
          >
            <h3 className="text-destructive font-bold mb-2">
              Error Processing File
            </h3>
            <p className="text-sm text-destructive-foreground/80 mb-4">
              {errorMsg}
            </p>
            <Button onClick={onReset} variant="destructive">
              Try Again
            </Button>
          </motion.div>
        )}

        {/* STATE: READY */}
        {appState === AppState.READY && songData && (
          <motion.div
            key="ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-full pb-20"
          >
            {/* Left Panel: Context & Player */}
            <div className="xl:col-span-4 flex flex-col gap-6 order-2 xl:order-1">
              <div className="bg-card/50 border border-border rounded-2xl p-4 shadow-sm backdrop-blur-sm sticky top-0 z-10">
                <TimelinePlayer
                  audioUrl={songData.audioUrl}
                  subtitles={songData.parsedSubtitles}
                  currentTime={currentTime}
                  duration={duration}
                  isPlaying={isPlaying}
                  onPlayPause={() => onPlayStateChange(!isPlaying)}
                  onSeek={(time: number) => onTimeUpdate(time)}
                  onTimeUpdate={(time: number) => onTimeUpdate(time)}
                  onDurationChange={(dur: number) => onDurationChange(dur)}
                  onEnded={() => onPlayStateChange(false)}
                  contentMode={contentType}
                />
              </div>

              {/* Translation & Transcript */}
              <div className="bg-card/30 border border-border/50 rounded-2xl p-4 flex-1 flex flex-col min-h-[400px]">
                <div className="flex items-center gap-2 mb-4">
                  <Select value={targetLang} onValueChange={onTargetLangChange}>
                    <SelectTrigger
                      aria-label="Translation language"
                      className="h-8 bg-card border-input text-xs w-[120px]"
                    >
                      <SelectValue placeholder="Translate" />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={onTranslate}
                    disabled={isTranslating}
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {isTranslating ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      "Translate"
                    )}
                  </Button>
                </div>

                <TranscriptList
                  subtitles={songData.parsedSubtitles}
                  currentTime={currentTime}
                  onSeek={(time: number) => {
                    onTimeUpdate(time);
                    onPlayStateChange(true);
                  }}
                />
              </div>
            </div>

            {/* Right Panel: Visual Generation */}
            <div className="xl:col-span-8 flex flex-col gap-6 order-1 xl:order-2">
              {/* Action Bar */}
              <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4 bg-card/50 p-4 rounded-2xl border border-border/50">
                <div>
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Sparkles size={16} className="text-primary" />
                    Storyboard
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {songData.prompts.length} scenes based on {contentType}.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    onClick={onOpenSettings}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Settings2 size={14} />
                    Settings
                  </Button>
                  <Button
                    onClick={onGenerateAll}
                    disabled={isBulkGenerating}
                    className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 border-0"
                  >
                    {isBulkGenerating ? (
                      <>
                        <Loader2 size={16} className="animate-spin mr-2" />{" "}
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 size={16} className="mr-2" /> Generate All
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Image Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {songData.prompts.map(
                  (prompt: ImagePrompt, idx: number) => {
                    const existing = songData.generatedImages.find(
                      (img: GeneratedImage) => img.promptId === prompt.id
                    );
                    // Collect sibling prompt texts for cross-scene deduplication
                    const siblingPromptTexts = songData.prompts
                      .filter((p: { id: string }) => p.id !== prompt.id)
                      .map((p: { text: string }) => p.text);
                    return (
                      <motion.div
                        key={prompt.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <ImageGenerator
                          prompt={prompt}
                          onImageGenerated={onImageGenerated}
                          existingImage={existing?.imageUrl}
                          existingType={existing?.type}
                          existingBaseImage={existing?.baseImageUrl}
                          style={selectedStyle}
                          globalSubject={globalSubject}
                          aspectRatio={aspectRatio}
                          generationMode={generationMode}
                          videoProvider={videoProvider}
                          siblingPromptTexts={siblingPromptTexts}
                          onAssetTypeChange={onAssetTypeChange}
                        />
                      </motion.div>
                    );
                  }
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
