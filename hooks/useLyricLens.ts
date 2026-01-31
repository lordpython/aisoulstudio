import { useState } from "react";
import { AppState, SongData, GeneratedImage, AssetType, ImagePrompt, SubtitleItem } from "../types";
import {
  transcribeAudioWithWordTiming,
  fileToGenerativePart,
  generateImageFromPrompt,
  generateVideoFromPrompt,
  refineImagePrompt,
  translateSubtitles,
  generateMotionPrompt,
  VideoPurpose,
} from "../services/geminiService";
import { generatePromptsWithLangChain, runAnalyzer } from "../services/directorService";
import { generatePromptsWithAgent } from "../services/agentDirectorService";
import { animateImageWithDeApi, generateImageWithAspectRatio } from "../services/deapiService";
import { subtitlesToSRT } from "../utils/srtParser";
import { calculateOptimalAssets } from "../services/assetCalculatorService";

export function useLyricLens() {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [songData, setSongData] = useState<SongData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [contentType, setContentType] = useState<"music" | "story">("music");
  const [globalSubject, setGlobalSubject] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [videoPurpose, setVideoPurpose] = useState<VideoPurpose>("music_video");
  const [generationMode, setGenerationMode] = useState<"image" | "video">(
    "image",
  );
  const [videoProvider, setVideoProvider] = useState<"veo" | "deapi">("veo");
  const [imageProvider, setImageProvider] = useState<"gemini" | "deapi">("gemini");
  const [directorMode, setDirectorMode] = useState<"chain" | "agent">("chain");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Translation State
  const [isTranslating, setIsTranslating] = useState(false);

  // Store file for processing (kept for backward compatibility)
  const handleFileSelect = (file: File) => {
    setErrorMsg(null);
    setPendingFile(file);
    // Don't change state - let caller decide when to process
  };

  /**
   * Process a file directly without relying on pendingFile state.
   * This eliminates the race condition where state may not be updated
   * before processing begins.
   * 
   * @param file - The audio file to process
   * @param selectedStyle - The style to use for prompt generation
   */
  const processFile = async (file: File, selectedStyle: string) => {
    // Also update pendingFile for backward compatibility
    setPendingFile(file);

    try {
      setErrorMsg(null);
      setAppState(AppState.PROCESSING_AUDIO);

      // 1. Setup local preview
      const audioUrl = URL.createObjectURL(file);
      const partialData: SongData = {
        fileName: file.name,
        audioUrl,
        srtContent: "",
        parsedSubtitles: [],
        prompts: [],
        generatedImages: [],
      };
      setSongData(partialData);

      // 2. Convert to Base64
      const base64Audio = await fileToGenerativePart(file);

      // 3. Transcribe with word-level timing
      setAppState(AppState.TRANSCRIBING);
      const parsedSubs = await transcribeAudioWithWordTiming(
        base64Audio,
        file.type,
      );
      // Generate SRT string for backward compat (downloads, prompts)
      const srt = subtitlesToSRT(parsedSubs);

      partialData.srtContent = srt;
      partialData.parsedSubtitles = parsedSubs;
      setSongData({ ...partialData });

      // 4. Analyze content structure
      setAppState(AppState.ANALYZING_LYRICS);

      // 5. Calculate optimal number of assets using dynamic asset calculator
      // Get audio duration from the audio buffer
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const audioDuration = audioBuffer.duration;

      // Run semantic analysis to understand content structure
      const analysis = await runAnalyzer(
        srt,
        contentType === "story" ? "story" : "lyrics"
      );

      // Calculate optimal asset count based on duration and semantic analysis
      const assetCalc = await calculateOptimalAssets({
        audioDuration,
        analysisOutput: analysis,
        videoPurpose,
        contentType: contentType === "story" ? "story" : "lyrics",
      });

      console.log(`[useLyricLens] Dynamic asset calculation: ${assetCalc.optimalAssetCount} assets recommended`);
      console.log(`[useLyricLens] Reasoning: ${assetCalc.reasoning}`);

      // 6. Generate Prompts using selected Director mode with calculated asset count
      setAppState(AppState.GENERATING_PROMPTS);
      // "chain" = LangChain LCEL pipeline (faster, deterministic)
      // "agent" = LangChain Agent with tools (smarter, self-improving)
      let prompts;
      if (directorMode === "agent") {
        console.log("[useLyricLens] Using Agent Director mode");
        prompts = await generatePromptsWithAgent(
          srt,
          selectedStyle,
          contentType === "story" ? "story" : "lyrics",
          videoPurpose,
          globalSubject,
          { targetAssetCount: assetCalc.optimalAssetCount }
        );
      } else {
        console.log("[useLyricLens] Using Chain Director mode");
        prompts = await generatePromptsWithLangChain(
          srt,
          selectedStyle,
          contentType === "story" ? "story" : "lyrics",
          videoPurpose,
          globalSubject,
          { targetAssetCount: assetCalc.optimalAssetCount }
        );
      }

      partialData.prompts = prompts;
      setSongData({ ...partialData });

      setAppState(AppState.READY);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "An unexpected error occurred.");
      setAppState(AppState.ERROR);
    }
  };

  /**
   * Legacy function that uses pendingFile state.
   * @deprecated Use processFile instead to avoid race conditions.
   */
  const startProcessing = async (selectedStyle: string) => {
    if (!pendingFile) return;
    await processFile(pendingFile, selectedStyle);
  };

  const handleImageGenerated = (newImg: GeneratedImage) => {
    if (!songData) return;
    setSongData((prev: SongData | null) => {
      if (!prev) return null;
      // Remove existing if replacing
      const filtered = prev.generatedImages.filter(
        (img: GeneratedImage) => img.promptId !== newImg.promptId,
      );

      return {
        ...prev,
        generatedImages: [...filtered, newImg],
      };
    });
  };

  const handleGenerateAll = async (
    selectedStyle: string,
    selectedAspectRatio: "16:9" | "9:16",
  ) => {
    if (!songData || isBulkGenerating) return;
    setIsBulkGenerating(true);

    const pendingPrompts = songData.prompts.filter(
      (p: ImagePrompt) => !songData.generatedImages.some((img: GeneratedImage) => img.promptId === p.id),
    );

    // Track refined prompts for cross-scene deduplication
    const refinedPromptTexts: string[] = [];

    // Collect all existing prompt texts (from already-generated scenes) as initial context
    const existingPromptTexts = songData.prompts
      .filter((p: ImagePrompt) =>
        songData.generatedImages.some((img: GeneratedImage) => img.promptId === p.id),
      )
      .map((p: ImagePrompt) => p.text);

    refinedPromptTexts.push(...existingPromptTexts);

    for (const prompt of pendingPrompts) {
      try {
        // First, refine the prompt with cross-scene awareness
        const { refinedPrompt } = await refineImagePrompt({
          promptText: prompt.text,
          style: selectedStyle,
          globalSubject,
          aspectRatio: selectedAspectRatio,
          intent: "auto",
          previousPrompts: refinedPromptTexts,
        });

        // Track the refined prompt for subsequent scenes
        refinedPromptTexts.push(refinedPrompt);

        // Determine asset type: use per-card setting if available, otherwise fall back to global
        const getAssetTypeForPrompt = (): AssetType => {
          if (prompt.assetType) return prompt.assetType;
          if (generationMode === "video") {
            return videoProvider === "deapi" ? "video_with_image" : "video";
          }
          return "image";
        };

        const assetType = getAssetTypeForPrompt();
        let base64: string;
        let baseImageUrl: string | undefined;
        let resultType: "image" | "video" = "image";

        if (assetType === "video") {
          // Direct video generation (Veo)
          base64 = await generateVideoFromPrompt(
            refinedPrompt,
            selectedStyle,
            globalSubject,
            selectedAspectRatio,
          );
          resultType = "video";
        } else if (assetType === "video_with_image") {
          // Two-step: Image first, then animate (DeAPI)
          // 1. Generate Image (Gemini)
          const imgBase64 = await generateImageFromPrompt(
            refinedPrompt,
            selectedStyle,
            globalSubject,
            selectedAspectRatio,
            true,
          );
          baseImageUrl = imgBase64;

          // 2. Generate motion-optimized prompt for animation
          const motionPrompt = await generateMotionPrompt(
            refinedPrompt,
            prompt.mood || "cinematic",
            globalSubject,
          );

          // 3. Animate with motion-focused prompt (DeAPI)
          base64 = await animateImageWithDeApi(
            imgBase64,
            motionPrompt,
            selectedAspectRatio as "16:9" | "9:16" | "1:1",
          );
          resultType = "video";
        } else {
          // Standard Image Generation
          // Choose provider: Gemini (default) or DeAPI
          if (imageProvider === "deapi") {
            // Use DeAPI for image generation (FLUX.1-schnell or Z-Image-Turbo)
            base64 = await generateImageWithAspectRatio(
              refinedPrompt,
              selectedAspectRatio as "16:9" | "9:16" | "1:1",
              "Flux1schnell", // Fast, high-quality model
            );
          } else {
            // Use Gemini Imagen (default)
            base64 = await generateImageFromPrompt(
              refinedPrompt,
              selectedStyle,
              globalSubject,
              selectedAspectRatio,
              true, // skipRefine - already refined above with previousPrompts
            );
          }
          resultType = "image";
        }

        handleImageGenerated({
          promptId: prompt.id,
          imageUrl: base64,
          type: resultType,
          baseImageUrl,
        });
      } catch (e) {
        console.error(`Failed to generate asset for prompt ${prompt.id}`, e);
      }
    }

    setIsBulkGenerating(false);
  };

  const handleTranslate = async (targetLang: string) => {
    if (!songData || isTranslating) return;
    setIsTranslating(true);
    try {
      const translations = await translateSubtitles(
        songData.parsedSubtitles,
        targetLang,
      );

      // Merge translations
      const updatedSubs = songData.parsedSubtitles.map((sub: SubtitleItem) => {
        const trans = translations.find((t: { id: number; translation: string }) => t.id === sub.id);
        return trans ? { ...sub, translation: trans.translation } : sub;
      });

      setSongData((prev: SongData | null) =>
        prev ? { ...prev, parsedSubtitles: updatedSubs } : null,
      );
    } catch (e) {
      console.error("Translation failed", e);
      alert("Translation failed. Please try again.");
    } finally {
      setIsTranslating(false);
    }
  };

  const loadTestData = async () => {
    try {
      setErrorMsg(null);
      setAppState(AppState.PROCESSING_AUDIO);

      // Use browser-compatible test data
      const { createTestSongData } = await import("../utils/testData");
      const testData = createTestSongData();

      setSongData(testData);
      setAppState(AppState.READY);

      console.log("✅ Test data loaded successfully");
    } catch (e: any) {
      console.error("Failed to load test data:", e);
      setErrorMsg("Failed to load test data: " + e.message);
      setAppState(AppState.ERROR);
    }
  };

  const resetApp = () => {
    setAppState(AppState.IDLE);
    setSongData(null);
    setPendingFile(null);
    setErrorMsg(null);
    setIsBulkGenerating(false);
    setIsTranslating(false);
    setGlobalSubject("");
    setAspectRatio("16:9");
    setGenerationMode("image");
    setVideoProvider("veo");
    setVideoPurpose("music_video");
  };

  return {
    appState,
    songData,
    setSongData,
    errorMsg,
    isBulkGenerating,
    contentType,
    isTranslating,
    globalSubject,
    aspectRatio,
    generationMode,
    videoPurpose,
    setGenerationMode,
    videoProvider,
    setVideoProvider,
    imageProvider,
    setImageProvider,
    // directorMode and setDirectorMode kept internal - not exposed
    setAspectRatio,
    setGlobalSubject,
    setContentType,
    setVideoPurpose,
    handleFileSelect,
    startProcessing,
    processFile,
    // pendingFile removed from exports - use processFile instead
    handleImageGenerated,
    handleGenerateAll,
    handleTranslate,
    loadTestData,
    resetApp,
  };
}
