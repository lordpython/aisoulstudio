/**
 * Advertisement Pipeline
 *
 * Produces short, high-impact promotional videos with clear CTAs.
 * Phases: Script → Visuals → Audio → Assembly.
 *
 * Requirements: 4.1–4.6
 */

import type { FormatMetadata, VideoFormat, Scene, NarrationSegment, ScreenplayScene } from '../../types';
import type { FormatPipeline, PipelineRequest, PipelineResult } from '../formatRouter';
import { formatRegistry } from '../formatRegistry';
import {
  buildBreakdownPrompt,
  buildScreenplayPrompt,
  countScriptWords,
  validateDurationConstraint,
  type FormatAwareGenerationOptions,
} from '../ai/storyPipeline';
import { ParallelExecutionEngine, type Task } from '../parallelExecutionEngine';
import { CheckpointSystem } from '../checkpointSystem';
import { narrateScene, getFormatVoiceForLanguage, type NarratorConfig } from '../narratorService';
import { generateImageFromPrompt } from '../imageService';
import { buildImageStyleGuide } from '../prompt/imageStyleGuide';
import { buildAssemblyRules, buildCTAMarker, validateCTAPosition } from '../ffmpeg/formatAssembly';
import { detectLanguage } from '../languageDetector';
import { storyModeStore } from '../ai/production/store';
import type { StoryModeState } from '../ai/production/types';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GEMINI_API_KEY, MODELS } from '../shared/apiClient';
import { z } from 'zod';
import { agentLogger } from '../logger';

const FORMAT_ID: VideoFormat = 'advertisement';
const log = agentLogger.child('AdvertisementPipeline');

// ============================================================================
// Schemas
// ============================================================================

const BreakdownSchema = z.object({
  acts: z.array(z.object({
    title: z.string(),
    emotionalHook: z.string(),
    narrativeBeat: z.string(),
  })).min(2).max(4),
});

const ScreenplaySchema = z.object({
  scenes: z.array(z.object({
    heading: z.string(),
    action: z.string(),
    dialogue: z.array(z.object({
      speaker: z.string().max(30),
      text: z.string().min(1),
    })),
  })).min(2).max(5),
});

// ============================================================================
// Pipeline Implementation
// ============================================================================

export class AdvertisementPipeline implements FormatPipeline {
  private parallelEngine: ParallelExecutionEngine;

  constructor(parallelEngine?: ParallelExecutionEngine) {
    this.parallelEngine = parallelEngine ?? new ParallelExecutionEngine();
  }

  getMetadata(): FormatMetadata {
    return formatRegistry.getFormat(FORMAT_ID)!;
  }

  async validate(request: PipelineRequest): Promise<boolean> {
    return !!request.idea && request.idea.trim().length > 0;
  }

  async execute(request: PipelineRequest): Promise<PipelineResult> {
    const sessionId = `ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const language = request.language ?? detectLanguage(request.idea);
    const metadata = this.getMetadata();

    const checkpoints = new CheckpointSystem({ maxCheckpoints: metadata.checkpointCount });

    log.info(`Starting Advertisement pipeline: "${request.idea.slice(0, 60)}..." [${language}]`);

    try {
      // ----------------------------------------------------------------
      // Phase 1: Script generation with CTA — Requirements 4.1, 4.2
      // ----------------------------------------------------------------
      log.info('Phase 1: Script generation');

      const formatOptions: FormatAwareGenerationOptions = {
        formatId: FORMAT_ID,
        genre: request.genre,
        language,
      };

      const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.8,
      });

      // Step 1a: Breakdown
      const breakdownPrompt = buildBreakdownPrompt(request.idea, formatOptions);
      const breakdownResult = await model.withStructuredOutput(BreakdownSchema).invoke(breakdownPrompt);

      // Step 1b: Screenplay
      const screenplayPrompt = buildScreenplayPrompt(breakdownResult.acts, formatOptions);
      const screenplayResult = await model.withStructuredOutput(ScreenplaySchema).invoke(screenplayPrompt);

      const screenplay: ScreenplayScene[] = screenplayResult.scenes.map((s, i) => ({
        id: `scene_${i}`,
        sceneNumber: i + 1,
        heading: s.heading,
        action: s.action,
        dialogue: s.dialogue.filter(d => d.text.trim().length > 0),
        charactersPresent: [],
      }));

      // Duration validation
      const wordCount = countScriptWords(screenplay);
      const durationCheck = validateDurationConstraint(wordCount, metadata);
      if (!durationCheck.valid) {
        log.warn(`Duration constraint: ${durationCheck.message}`);
      }

      // Extract CTA from final scene dialogue
      const finalScene = screenplay[screenplay.length - 1];
      const ctaText = finalScene?.dialogue[finalScene.dialogue.length - 1]?.text ?? 'Learn More';

      // Persist state
      const state: StoryModeState = {
        id: sessionId,
        topic: request.idea,
        breakdown: breakdownResult.acts.map(a => `${a.title}: ${a.narrativeBeat}`).join('\n'),
        screenplay,
        characters: [],
        shotlist: [],
        currentStep: 'screenplay',
        updatedAt: Date.now(),
        formatId: FORMAT_ID,
        language,
      };
      storyModeStore.set(sessionId, state);

      // Checkpoint 1: Script with CTA — Requirement 4.5
      const scriptApproval = await checkpoints.createCheckpoint('script-with-cta');
      if (!scriptApproval.approved) {
        log.info('Script rejected by user');
        checkpoints.dispose();
        return { success: false, error: 'Script rejected by user', partialResults: { screenplay } };
      }

      // ----------------------------------------------------------------
      // Phase 2: Visual generation (high-impact, 16:9) — Requirements 4.3
      // ----------------------------------------------------------------
      log.info('Phase 2: Visual generation');

      const visualTasks: Task<{ sceneId: string; imageUrl: string }>[] = screenplay.map((scene, i) => ({
        id: `visual_${i}`,
        type: 'visual' as const,
        priority: 1,
        retryable: true,
        timeout: 60_000,
        execute: async () => {
          const guide = buildImageStyleGuide({
            scene: scene.action,
            style: 'High-Impact Commercial',
            background: scene.heading,
            mood: breakdownResult.acts[i]?.emotionalHook ?? 'energetic',
          });

          const imageUrl = await generateImageFromPrompt(
            scene.action,
            'High-Impact Commercial',
            '',
            '16:9',
            true,
            undefined,
            sessionId,
            i,
            guide,
          );
          return { sceneId: scene.id, imageUrl };
        },
      }));

      const visualResults = await this.parallelEngine.execute(visualTasks, {
        concurrencyLimit: metadata.concurrencyLimit,
        retryAttempts: 2,
        retryDelay: 1000,
        exponentialBackoff: true,
      });

      const visuals = visualResults
        .filter(r => r.success && r.data)
        .map(r => r.data!);

      log.info(`Visuals generated: ${visuals.length}/${screenplay.length}`);

      // Update state
      state.shotlist = visuals.map((v, i) => ({
        id: `shot_${i}`,
        sceneId: v.sceneId,
        shotNumber: i + 1,
        description: screenplay[i]?.action ?? '',
        cameraAngle: 'Dynamic',
        movement: 'Fast',
        lighting: 'High-Key',
        dialogue: screenplay[i]?.dialogue[0]?.text ?? '',
        imageUrl: v.imageUrl,
      }));
      state.currentStep = 'shotlist';
      state.updatedAt = Date.now();
      storyModeStore.set(sessionId, state);

      // ----------------------------------------------------------------
      // Phase 3: Audio generation (energetic voice) — Requirement 4.4
      // ----------------------------------------------------------------
      log.info('Phase 3: Audio generation');

      const scenes: Scene[] = screenplay.map((s, i) => ({
        id: s.id,
        name: s.heading,
        duration: durationCheck.estimatedSeconds / screenplay.length,
        visualDescription: s.action,
        narrationScript: s.dialogue.map(d => d.text).join(' '),
        emotionalTone: 'urgent' as const,
      }));

      const voiceConfig = getFormatVoiceForLanguage(FORMAT_ID, language);
      const narratorConfig: NarratorConfig = {
        defaultVoice: voiceConfig.voiceName,
        videoPurpose: 'commercial',
        language: language as any,
        styleOverride: voiceConfig.stylePrompt,
      };

      const narrationSegments: NarrationSegment[] = [];
      for (const scene of scenes) {
        try {
          const segment = await narrateScene(scene, narratorConfig, sessionId);
          narrationSegments.push(segment);
        } catch (err) {
          log.warn(`Narration failed for scene ${scene.id}:`, err);
        }
      }

      log.info(`Narration complete: ${narrationSegments.length}/${scenes.length} segments`);

      // ----------------------------------------------------------------
      // Phase 4: Assembly with CTA emphasis — Requirement 4.6
      // ----------------------------------------------------------------
      log.info('Phase 4: Assembly');

      const totalDuration = narrationSegments.reduce((sum, s) => sum + s.audioDuration, 0);

      // Build CTA marker for final 5 seconds
      const ctaMarker = buildCTAMarker(ctaText, totalDuration);
      const ctaValid = validateCTAPosition(ctaMarker, totalDuration);
      if (!ctaValid) {
        log.warn('CTA position validation failed — adjusting');
      }

      const assemblyRules = buildAssemblyRules(FORMAT_ID, {
        totalDuration,
        ctaText,
      });

      // Checkpoint 2: Final Preview — Requirement 4.5
      const finalApproval = await checkpoints.createCheckpoint('final-preview');
      if (!finalApproval.approved) {
        log.info('Final preview rejected by user');
        checkpoints.dispose();
        return {
          success: false,
          error: 'Final preview rejected by user',
          partialResults: { screenplay, visuals, narrationSegments },
        };
      }

      state.currentStep = 'production';
      state.updatedAt = Date.now();
      state.checkpoints = checkpoints.getAllCheckpoints();
      storyModeStore.set(sessionId, state);

      checkpoints.dispose();

      log.info(`Advertisement pipeline complete: ${screenplay.length} scenes, ${visuals.length} visuals, CTA="${ctaText}"`);

      return {
        success: true,
        partialResults: {
          sessionId,
          screenplay,
          visuals,
          narrationSegments,
          assemblyRules,
          ctaMarker,
          totalDuration,
        },
      };

    } catch (error) {
      checkpoints.dispose();
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Advertisement pipeline failed:', msg);
      return { success: false, error: msg };
    }
  }
}
