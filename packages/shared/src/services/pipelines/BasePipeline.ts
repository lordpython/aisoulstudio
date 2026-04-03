/**
 * BasePipeline — Template Method for format-specific video pipelines
 *
 * Handles all shared boilerplate: session setup, checkpoint management,
 * script generation, visual generation, narration, state persistence,
 * and error handling. Subclasses override hooks for format-specific logic.
 *
 * @see FormatPipeline interface in formatRouter.ts
 */

import type { FormatMetadata, VideoFormat, Scene, NarrationSegment, ScreenplayScene } from '../../types';
import type { VideoPurpose } from '../../constants';
import type { FormatPipeline, PipelineRequest, PipelineResult, PipelineCallbacks } from '../format/formatRouter';
import { formatRegistry } from '../format/formatRegistry';
import {
  buildBreakdownPrompt,
  buildScreenplayPrompt,
  countScriptWords,
  validateDurationConstraint,
  type FormatAwareGenerationOptions,
} from '../ai/storyPipeline';
import { ParallelExecutionEngine, type Task } from '../orchestration/parallelExecutionEngine';
import { CheckpointSystem } from '../project/checkpointSystem';
import { narrateScene, getFormatVoiceForLanguage, type NarratorConfig } from '../media/narratorService';
import type { LanguageCode } from '../../constants';
import { generateImageFromPrompt } from '../media/imageService';
import { buildImageStyleGuide } from '../prompt/imageStyleGuide';
import { buildAssemblyRules } from '../ffmpeg/formatAssembly';
import { detectLanguage } from '../content/languageDetector';
import { storyModeStore } from '../ai/production/store';
import type { StoryModeState } from '../ai/production/types';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GEMINI_API_KEY, MODELS } from '../shared/apiClient';
import type { z } from 'zod';
import { agentLogger } from '../infrastructure/logger';

// ============================================================================
// FormatConfig — captures data-driven differences between formats
// ============================================================================

export interface FormatConfig {
  /** Format identifier (e.g. 'advertisement', 'documentary') */
  readonly formatId: VideoFormat;
  /** Session ID prefix (e.g. 'ad', 'doc', 'sht') */
  readonly sessionPrefix: string;
  /** Logger child name */
  readonly loggerName: string;
  /** LLM temperature for script generation */
  readonly temperature: number;
  /** Visual style string passed to imageService */
  readonly visualStyle: string;
  /** Default mood fallback for style guides */
  readonly defaultMood: string;
  /** Aspect ratio for generated visuals */
  readonly aspectRatio: '16:9' | '9:16';
  /** Emotional tone applied to narration scenes */
  readonly emotionalTone: string;
  /** Video purpose for narrator config */
  readonly videoPurpose: VideoPurpose;
  /** Default shot properties for shotlist entries */
  readonly shotDefaults: { cameraAngle: string; movement: string; lighting: string };
  /** Retry delay (ms) for parallel visual generation */
  readonly retryDelay: number;
  /** Zod schema for story breakdown */
  readonly breakdownSchema: z.ZodTypeAny;
  /** Zod schema for screenplay */
  readonly screenplaySchema: z.ZodTypeAny;
}

// ============================================================================
// Pipeline execution context — passed to hooks
// ============================================================================

export interface PipelineContext {
  readonly sessionId: string;
  readonly language: string;
  readonly metadata: FormatMetadata;
  readonly request: PipelineRequest;
  readonly checkpoints: CheckpointSystem;
  cancelled: boolean;
}

/** Data accumulated during pipeline execution, passed to buildSuccessResult */
export interface PipelineData {
  screenplay: ScreenplayScene[];
  breakdownResult: Record<string, unknown>;
  screenplayResult: Record<string, unknown>;
  visuals: Array<{ sceneId: string; imageUrl: string }>;
  narrationSegments: NarrationSegment[];
  scenes: Scene[];
  totalDuration: number;
  shotlist: StoryModeState['shotlist'];
  wordCount: number;
  durationCheck: { valid: boolean; message?: string; estimatedSeconds: number };
  assemblyData: Record<string, unknown>;
  /** Format-specific data from hooks */
  hookData: Record<string, unknown>;
}

/** Thrown when user rejects a checkpoint — caught by the template method */
class PipelineRejectedError extends Error {
  constructor(
    public readonly phase: string,
    public readonly partialResults: Record<string, unknown>,
  ) {
    super(`${phase} rejected by user`);
    this.name = 'PipelineRejectedError';
  }
}

// ============================================================================
// BasePipeline abstract class
// ============================================================================

export abstract class BasePipeline implements FormatPipeline {
  protected readonly config: FormatConfig;
  protected readonly parallelEngine: ParallelExecutionEngine;
  protected readonly log: ReturnType<typeof agentLogger.child>;

  constructor(config: FormatConfig, parallelEngine?: ParallelExecutionEngine) {
    this.config = config;
    this.parallelEngine = parallelEngine ?? new ParallelExecutionEngine();
    this.log = agentLogger.child(config.loggerName);
  }

  getMetadata(): FormatMetadata {
    return formatRegistry.getFormat(this.config.formatId)!;
  }

  async validate(request: PipelineRequest): Promise<boolean> {
    return !!request.idea && request.idea.trim().length > 0;
  }

  // --------------------------------------------------------------------------
  // Template Method — orchestrates the entire pipeline lifecycle
  // --------------------------------------------------------------------------

  async execute(request: PipelineRequest, callbacks?: PipelineCallbacks): Promise<PipelineResult> {
    const sessionId = `${this.config.sessionPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const language = request.language ?? detectLanguage(request.idea);
    const metadata = this.getMetadata();

    let cancelled = false;
    const checkpoints = new CheckpointSystem({
      maxCheckpoints: metadata.checkpointCount,
      onCheckpointCreated: callbacks?.onCheckpointCreated,
    });
    callbacks?.onCheckpointSystemCreated?.(checkpoints);
    callbacks?.onCancelRequested?.(() => { cancelled = true; checkpoints.dispose(); });

    const ctx: PipelineContext = { sessionId, language, metadata, request, checkpoints, cancelled };

    this.log.info(`Starting ${this.config.loggerName}: "${request.idea.slice(0, 60)}..." [${language}]`);

    try {
      // === Hook: Pre-pipeline (research, lyrics analysis, etc.) ===
      const hookData = await this.beforePipeline(ctx);

      // === Script generation ===
      const formatOptions: FormatAwareGenerationOptions = {
        formatId: this.config.formatId,
        genre: request.genre,
        language,
        ...this.getFormatOptions(ctx, hookData),
      };

      const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: this.config.temperature,
      });

      const breakdownPrompt = buildBreakdownPrompt(request.idea, formatOptions);
      const breakdownResult = await model.withStructuredOutput(this.config.breakdownSchema).invoke(breakdownPrompt);

      const screenplayPrompt = buildScreenplayPrompt(breakdownResult.acts, formatOptions);
      const screenplayResult = await model.withStructuredOutput(this.config.screenplaySchema).invoke(screenplayPrompt);

      const screenplay: ScreenplayScene[] = screenplayResult.scenes.map((s: any, i: number) => ({
        id: `scene_${i}`,
        sceneNumber: i + 1,
        heading: s.heading,
        action: s.action,
        dialogue: s.dialogue.filter((d: any) => d.text.trim().length > 0),
        charactersPresent: [],
      }));

      if (screenplay.length === 0) {
        checkpoints.dispose();
        return { success: false, error: 'Script generation returned no scenes' };
      }

      // Duration validation
      const wordCount = countScriptWords(screenplay);
      const durationCheck = validateDurationConstraint(wordCount, metadata);
      if (!durationCheck.valid) {
        this.log.warn(`Duration constraint: ${durationCheck.message}`);
      }

      // === Hook: After script generation (CTA extraction, beat metadata, etc.) ===
      const postScriptData = await this.afterScriptGeneration(
        ctx, screenplay, screenplayResult, breakdownResult, durationCheck, hookData,
      );
      Object.assign(hookData, postScriptData);

      // Persist state
      const state: StoryModeState = {
        id: sessionId,
        topic: request.idea,
        breakdown: this.buildBreakdownSummary(breakdownResult),
        screenplay,
        characters: [],
        shotlist: [],
        currentStep: 'screenplay',
        updatedAt: Date.now(),
        formatId: this.config.formatId,
        language,
      };
      storyModeStore.set(sessionId, state);

      // === Script checkpoint ===
      const scriptCheckpoint = this.getScriptCheckpointConfig(
        screenplay, wordCount, durationCheck, hookData,
      );
      await this.requireApproval(
        checkpoints, scriptCheckpoint.name, scriptCheckpoint.payload,
        { screenplay, ...hookData },
      );

      // === Visual generation ===
      const visuals = await this.generateVisuals(
        ctx, screenplay, breakdownResult, metadata,
      );

      // Shotlist update
      state.shotlist = visuals.map((v, i) => ({
        id: `shot_${i}`,
        sceneId: v.sceneId,
        shotNumber: i + 1,
        description: screenplay[i]?.action ?? '',
        cameraAngle: this.config.shotDefaults.cameraAngle,
        movement: this.config.shotDefaults.movement,
        lighting: this.config.shotDefaults.lighting,
        dialogue: this.buildShotDialogue(screenplay[i]),
        imageUrl: v.imageUrl,
      }));
      state.currentStep = 'shotlist';
      state.updatedAt = Date.now();
      storyModeStore.set(sessionId, state);

      // === Hook: After visual generation (beat alignment, etc.) ===
      const postVisualData = await this.afterVisualGeneration(
        ctx, visuals, screenplay, hookData,
      );
      Object.assign(hookData, postVisualData);

      // === Visual checkpoint ===
      const visualCheckpoint = this.getVisualCheckpointConfig(visuals, screenplay, hookData);
      await this.requireApproval(
        checkpoints, visualCheckpoint.name, visualCheckpoint.payload,
        { screenplay, visuals, ...hookData },
      );

      // === Narration ===
      const { scenes, narrationSegments } = await this.generateNarration(
        ctx, screenplay, durationCheck, hookData,
      );

      // === Assembly ===
      const totalDuration = narrationSegments.reduce((sum, s) => sum + s.audioDuration, 0);
      const assemblyData = await this.buildAssembly(
        ctx, totalDuration, screenplay, narrationSegments, hookData,
      );

      // === Final checkpoint ===
      await this.requireApproval(
        checkpoints, 'final-assembly',
        {
          sceneCount: screenplay.length,
          visualCount: visuals.length,
          narrationCount: narrationSegments.length,
          totalDuration,
        },
        { screenplay, visuals, narrationSegments, ...hookData },
      );

      // === Finalize ===
      state.currentStep = 'production';
      state.updatedAt = Date.now();
      state.checkpoints = checkpoints.getAllCheckpoints();
      storyModeStore.set(sessionId, state);

      checkpoints.dispose();
      storyModeStore.delete(sessionId);

      const pipelineData: PipelineData = {
        screenplay, breakdownResult, screenplayResult,
        visuals, narrationSegments, scenes, totalDuration,
        shotlist: state.shotlist, wordCount, durationCheck,
        assemblyData, hookData,
      };

      this.log.info(`${this.config.loggerName} complete: ${screenplay.length} scenes, ${visuals.length} visuals`);
      return this.buildSuccessResult(sessionId, pipelineData);

    } catch (error) {
      checkpoints.dispose();
      storyModeStore.delete(sessionId);

      if (error instanceof PipelineRejectedError) {
        this.log.info(`${error.phase} rejected by user`);
        return { success: false, error: error.message, partialResults: error.partialResults };
      }

      const msg = error instanceof Error ? error.message : String(error);
      this.log.error(`${this.config.loggerName} failed:`, msg);
      return { success: false, error: msg };
    }
  }

  // --------------------------------------------------------------------------
  // Shared helpers
  // --------------------------------------------------------------------------

  /**
   * Require user approval via checkpoint. Throws PipelineRejectedError if rejected.
   */
  protected async requireApproval(
    checkpoints: CheckpointSystem,
    phase: string,
    payload: Record<string, unknown>,
    partialResults: Record<string, unknown>,
  ): Promise<void> {
    const approval = await checkpoints.createCheckpoint(phase, payload);
    if (!approval.approved) {
      throw new PipelineRejectedError(phase, partialResults);
    }
  }

  /** Generate visuals in parallel for all screenplay scenes */
  protected async generateVisuals(
    ctx: PipelineContext,
    screenplay: ScreenplayScene[],
    breakdownResult: Record<string, unknown>,
    metadata: FormatMetadata,
  ): Promise<Array<{ sceneId: string; imageUrl: string }>> {
    const acts = (breakdownResult as any).acts ?? [];

    const visualTasks: Task<{ sceneId: string; imageUrl: string }>[] = screenplay.map((scene, i) => ({
      id: `visual_${i}`,
      type: 'visual' as const,
      priority: 1,
      retryable: true,
      timeout: 60_000,
      execute: async () => {
        const guide = buildImageStyleGuide({
          scene: scene.action,
          style: this.getVisualStyle(ctx, i),
          background: scene.heading,
          mood: acts[i]?.emotionalHook ?? this.config.defaultMood,
        });

        const imageUrl = await generateImageFromPrompt(
          scene.action,
          this.getVisualStyle(ctx, i),
          '',
          this.config.aspectRatio,
          true,
          undefined,
          ctx.sessionId,
          i,
          guide,
        );
        return { sceneId: scene.id, imageUrl };
      },
    }));

    const visualResults = await this.parallelEngine.execute(visualTasks, {
      concurrencyLimit: metadata.concurrencyLimit,
      retryAttempts: 2,
      retryDelay: this.config.retryDelay,
      exponentialBackoff: true,
    });

    const visuals = visualResults
      .filter(r => r.success && r.data)
      .map(r => r.data!);

    const failedCount = visualResults.filter(r => !r.success).length;
    if (failedCount > 0) {
      this.log.warn(`${failedCount} visual(s) failed to generate`);
    }
    this.log.info(`Visuals generated: ${visuals.length}/${screenplay.length}`);

    return visuals;
  }

  /** Generate narration for all scenes */
  protected async generateNarration(
    ctx: PipelineContext,
    screenplay: ScreenplayScene[],
    durationCheck: { estimatedSeconds: number },
    _hookData?: Record<string, unknown>,
  ): Promise<{ scenes: Scene[]; narrationSegments: NarrationSegment[] }> {
    const scenes: Scene[] = screenplay.map((s, i) => ({
      id: s.id,
      name: s.heading,
      duration: durationCheck.estimatedSeconds / screenplay.length,
      visualDescription: s.action,
      narrationScript: s.dialogue.map(d => d.text).join(' '),
      emotionalTone: this.config.emotionalTone as any,
    }));

    const voiceConfig = getFormatVoiceForLanguage(this.config.formatId, ctx.language);
    const narratorConfig: NarratorConfig = {
      defaultVoice: voiceConfig.voiceName,
      videoPurpose: this.config.videoPurpose,
      language: ctx.language as LanguageCode,
      styleOverride: voiceConfig.stylePrompt,
    };

    const narrationSegments: NarrationSegment[] = [];
    for (const scene of scenes) {
      if (ctx.cancelled) break;
      try {
        const segment = await narrateScene(scene, narratorConfig, ctx.sessionId);
        narrationSegments.push(segment);
      } catch (err) {
        this.log.warn(`Narration failed for scene ${scene.id}:`, err);
      }
    }

    this.log.info(`Narration complete: ${narrationSegments.length}/${scenes.length} segments`);
    return { scenes, narrationSegments };
  }

  // --------------------------------------------------------------------------
  // Overridable hooks — subclasses provide format-specific behavior
  // --------------------------------------------------------------------------

  /**
   * Hook: Runs before script generation. Override for research, lyrics analysis, etc.
   * Return value is stored in hookData and passed to all subsequent hooks.
   */
  protected async beforePipeline(_ctx: PipelineContext): Promise<Record<string, unknown>> {
    return {};
  }

  /**
   * Hook: Additional format options merged into FormatAwareGenerationOptions.
   * Override to add researchSummary, researchCitations, etc.
   */
  protected getFormatOptions(
    _ctx: PipelineContext,
    _hookData: Record<string, unknown>,
  ): Record<string, unknown> {
    return {};
  }

  /**
   * Hook: After script generation. Override for CTA extraction, beat metadata, etc.
   * Returned data is merged into hookData.
   */
  protected async afterScriptGeneration(
    _ctx: PipelineContext,
    _screenplay: ScreenplayScene[],
    _screenplayResult: Record<string, unknown>,
    _breakdownResult: Record<string, unknown>,
    _durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    _hookData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return {};
  }

  /**
   * Hook: After visual generation. Override for beat alignment, etc.
   * Returned data is merged into hookData.
   */
  protected async afterVisualGeneration(
    _ctx: PipelineContext,
    _visuals: Array<{ sceneId: string; imageUrl: string }>,
    _screenplay: ScreenplayScene[],
    _hookData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return {};
  }

  /**
   * Returns the visual style string for a given scene index.
   * Override if style depends on request.genre (e.g., music video).
   */
  protected getVisualStyle(_ctx: PipelineContext, _sceneIndex: number): string {
    return this.config.visualStyle;
  }

  /**
   * Build the breakdown summary string for StoryModeState.
   * Override if breakdown acts have different field names (e.g., chapterTitle).
   */
  protected buildBreakdownSummary(breakdownResult: Record<string, unknown>): string {
    const acts = (breakdownResult as any).acts ?? [];
    return acts.map((a: any) => `${a.title}: ${a.narrativeBeat}`).join('\n');
  }

  /**
   * Extract dialogue text for a shotlist entry.
   * Default: first dialogue line. Override for different join strategy.
   */
  protected buildShotDialogue(scene?: ScreenplayScene): string {
    return scene?.dialogue[0]?.text ?? '';
  }

  /**
   * Build assembly rules and format-specific assembly data.
   * Override to add CTA markers, chapter markers, beat metadata, etc.
   */
  protected async buildAssembly(
    _ctx: PipelineContext,
    totalDuration: number,
    _screenplay: ScreenplayScene[],
    _narrationSegments: NarrationSegment[],
    _hookData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return { assemblyRules: buildAssemblyRules(this.config.formatId, { totalDuration }) };
  }

  /**
   * Build the visual checkpoint config. Override for format-specific payload
   * (e.g., music video includes lyrics per visual).
   */
  protected getVisualCheckpointConfig(
    visuals: Array<{ sceneId: string; imageUrl: string }>,
    screenplay: ScreenplayScene[],
    _hookData: Record<string, unknown>,
  ): { name: string; payload: Record<string, unknown> } {
    return {
      name: 'visual-preview',
      payload: {
        visualCount: visuals.length,
        totalScenes: screenplay.length,
        visuals: visuals.map(v => ({ sceneId: v.sceneId, imageUrl: v.imageUrl })),
      },
    };
  }

  // --------------------------------------------------------------------------
  // Abstract methods — every subclass must implement
  // --------------------------------------------------------------------------

  /**
   * Return the script checkpoint name and payload.
   * Each format names its first checkpoint differently and includes different data.
   */
  protected abstract getScriptCheckpointConfig(
    screenplay: ScreenplayScene[],
    wordCount: number,
    durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    hookData: Record<string, unknown>,
  ): { name: string; payload: Record<string, unknown> };

  /**
   * Build the final success result with format-specific fields.
   */
  protected abstract buildSuccessResult(
    sessionId: string,
    data: PipelineData,
  ): PipelineResult;
}
