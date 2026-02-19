/**
 * Shorts/Reels Pipeline
 *
 * Produces vertical short-form videos (15–60s) optimized for mobile with
 * hook-first engagement and fast-paced visuals.
 * Phases: Script → Visuals → Audio → Assembly.
 *
 * Requirements: 6.1–6.5
 */

import type { FormatMetadata, VideoFormat, Scene, NarrationSegment, ScreenplayScene } from '../../types';
import type { FormatPipeline, PipelineRequest, PipelineResult, PipelineCallbacks } from '../formatRouter';
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
import { buildAssemblyRules } from '../ffmpeg/formatAssembly';
import { detectLanguage } from '../languageDetector';
import { storyModeStore } from '../ai/production/store';
import type { StoryModeState } from '../ai/production/types';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GEMINI_API_KEY, MODELS } from '../shared/apiClient';
import { z } from 'zod';
import { agentLogger } from '../logger';

const FORMAT_ID: VideoFormat = 'shorts';
const log = agentLogger.child('ShortsPipeline');

// ============================================================================
// Schemas
// ============================================================================

const BreakdownSchema = z.object({
  acts: z.array(z.object({
    title: z.string(),
    emotionalHook: z.string(),
    narrativeBeat: z.string(),
  })).min(2).max(3),
});

const ScreenplaySchema = z.object({
  scenes: z.array(z.object({
    heading: z.string(),
    action: z.string(),
    dialogue: z.array(z.object({
      speaker: z.string().max(30),
      text: z.string().min(1),
    })),
  })).min(2).max(4),
});

// ============================================================================
// Pipeline Implementation
// ============================================================================

export class ShortsPipeline implements FormatPipeline {
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

  async execute(request: PipelineRequest, callbacks?: PipelineCallbacks): Promise<PipelineResult> {
    const sessionId = `sht_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const language = request.language ?? detectLanguage(request.idea);
    const metadata = this.getMetadata();

    let cancelled = false;
    const checkpoints = new CheckpointSystem({
      maxCheckpoints: metadata.checkpointCount,
      onCheckpointCreated: callbacks?.onCheckpointCreated,
    });
    callbacks?.onCheckpointSystemCreated?.(checkpoints);
    callbacks?.onCancelRequested?.(() => { cancelled = true; checkpoints.dispose(); });

    log.info(`Starting Shorts pipeline: "${request.idea.slice(0, 60)}..." [${language}]`);

    try {
      // ----------------------------------------------------------------
      // Phase 1: Hook-first script generation — Requirements 6.1, 6.3
      // ----------------------------------------------------------------
      log.info('Phase 1: Script generation (hook-first)');

      const formatOptions: FormatAwareGenerationOptions = {
        formatId: FORMAT_ID,
        genre: request.genre,
        language,
      };

      const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.85,
      });

      // Step 1a: Breakdown — first act must be the hook
      const breakdownPrompt = buildBreakdownPrompt(request.idea, formatOptions);
      const breakdownResult = await model.withStructuredOutput(BreakdownSchema).invoke(breakdownPrompt);

      // Step 1b: Screenplay — opening scene is the hook
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

      const wordCount = countScriptWords(screenplay);
      const durationCheck = validateDurationConstraint(wordCount, metadata);
      if (!durationCheck.valid) {
        log.warn(`Duration constraint: ${durationCheck.message}`);
      }

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

      // Checkpoint 1: Hook Preview — Requirement 6.5
      const hookApproval = await checkpoints.createCheckpoint('hook-preview', {
        sceneCount: screenplay.length,
        scenes: screenplay.map(s => ({
          heading: s.heading,
          action: s.action.length > 200 ? s.action.slice(0, 200) + '...' : s.action,
        })),
      });
      if (!hookApproval.approved) {
        log.info('Hook rejected by user');
        checkpoints.dispose();
        return { success: false, error: 'Hook rejected by user', partialResults: { screenplay } };
      }

      // ----------------------------------------------------------------
      // Phase 2: Vertical visual generation (9:16) — Requirements 6.2, 6.4
      // ----------------------------------------------------------------
      log.info('Phase 2: Vertical visual generation (9:16)');

      const visualTasks: Task<{ sceneId: string; imageUrl: string }>[] = screenplay.map((scene, i) => ({
        id: `visual_${i}`,
        type: 'visual' as const,
        priority: 1,
        retryable: true,
        timeout: 60_000,
        execute: async () => {
          const guide = buildImageStyleGuide({
            scene: scene.action,
            style: 'Fast-Paced Vertical',
            background: scene.heading,
            mood: breakdownResult.acts[i]?.emotionalHook ?? 'exciting',
          });

          const imageUrl = await generateImageFromPrompt(
            scene.action,
            'Fast-Paced Vertical',
            '',
            '9:16',
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
        retryDelay: 800,
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
        cameraAngle: 'Close-Up',
        movement: 'Fast',
        lighting: 'Vibrant',
        dialogue: screenplay[i]?.dialogue[0]?.text ?? '',
        imageUrl: v.imageUrl,
      }));
      state.currentStep = 'shotlist';
      state.updatedAt = Date.now();
      storyModeStore.set(sessionId, state);

      // ----------------------------------------------------------------
      // Phase 3: Audio generation — Requirements 6.1
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
        videoPurpose: 'social_short',
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
      // Phase 4: Assembly optimized for mobile — Requirement 6.5
      // ----------------------------------------------------------------
      log.info('Phase 4: Assembly');

      const totalDuration = narrationSegments.reduce((sum, s) => sum + s.audioDuration, 0);
      const assemblyRules = buildAssemblyRules(FORMAT_ID, { totalDuration });

      // Checkpoint 2: Final Assembly — Requirement 6.5
      const assemblyApproval = await checkpoints.createCheckpoint('final-assembly', {
        sceneCount: screenplay.length,
        visualCount: visuals.length,
        narrationCount: narrationSegments.length,
        totalDuration,
      });
      if (!assemblyApproval.approved) {
        log.info('Assembly rejected by user');
        checkpoints.dispose();
        return {
          success: false,
          error: 'Assembly rejected by user',
          partialResults: { screenplay, visuals, narrationSegments },
        };
      }

      state.currentStep = 'production';
      state.updatedAt = Date.now();
      state.checkpoints = checkpoints.getAllCheckpoints();
      storyModeStore.set(sessionId, state);

      checkpoints.dispose();

      log.info(`Shorts pipeline complete: ${screenplay.length} scenes, ${visuals.length} visuals (9:16)`);

      return {
        success: true,
        partialResults: {
          sessionId,
          screenplay,
          visuals,
          narrationSegments,
          assemblyRules,
          totalDuration,
          aspectRatio: '9:16',
        },
      };

    } catch (error) {
      checkpoints.dispose();
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Shorts pipeline failed:', msg);
      return { success: false, error: msg };
    }
  }
}
