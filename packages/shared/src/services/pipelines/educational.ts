/**
 * Educational Pipeline
 *
 * Produces structured educational videos with visual aids, diagrams, and
 * clear learning objectives. Phases: Script → Visuals with Overlays → Audio → Assembly.
 *
 * Requirements: 5.1–5.6
 */

import type { FormatMetadata, ScreenplayScene, NarrationSegment } from '../../types';
import type { PipelineResult } from '../format/formatRouter';
import { ResearchService, type ResearchResult } from '../content/researchService';
import { ParallelExecutionEngine, type Task } from '../orchestration/parallelExecutionEngine';
import {
  buildAssemblyRules,
  buildChapterMarkers,
} from '../ffmpeg/formatAssembly';
import { generateImageFromPrompt } from '../media/imageService';
import { buildImageStyleGuide } from '../prompt/imageStyleGuide';
import { buildBreakdownSchema, buildScreenplaySchema } from './schemas';
import { z } from 'zod';
import {
  BasePipeline,
  type FormatConfig,
  type PipelineContext,
  type PipelineData,
} from './BasePipeline';

const config: FormatConfig = {
  formatId: 'educational',
  sessionPrefix: 'edu',
  loggerName: 'EducationalPipeline',
  temperature: 0.6,
  visualStyle: 'Educational Diagram',
  defaultMood: 'informative and clear',
  aspectRatio: '16:9',
  emotionalTone: 'friendly',
  videoPurpose: 'educational',
  shotDefaults: { cameraAngle: 'Static', movement: 'None', lighting: 'Bright' },
  retryDelay: 1000,
  breakdownSchema: buildBreakdownSchema({
    minActs: 3, maxActs: 6,
    extraActFields: { learningObjective: z.string() },
  }),
  screenplaySchema: buildScreenplaySchema({ minScenes: 3, maxScenes: 8 }),
};

export class EducationalPipeline extends BasePipeline {
  private researchService: ResearchService;

  constructor(researchService?: ResearchService, parallelEngine?: ParallelExecutionEngine) {
    super(config, parallelEngine);
    this.researchService = researchService ?? new ResearchService();
  }

  protected async beforePipeline(ctx: PipelineContext): Promise<Record<string, unknown>> {
    this.log.info('Phase 1: Research');

    const researchResult: ResearchResult = await this.researchService.research({
      topic: ctx.request.idea,
      language: ctx.language as 'ar' | 'en',
      depth: 'medium',
      sources: ['web', 'knowledge-base', ...(ctx.request.referenceDocuments?.length ? ['references' as const] : [])],
      maxResults: 8,
      referenceDocuments: ctx.request.referenceDocuments,
    });

    this.log.info(`Research complete: ${researchResult.sources.length} sources, confidence=${researchResult.confidence.toFixed(2)}`);

    await this.requireApproval(ctx.checkpoints, 'research-and-sources', {
      sourceCount: researchResult.sources.length,
      confidence: researchResult.confidence,
      topics: researchResult.sources.map(s => s.title).slice(0, 5),
      summaryPreview: researchResult.summary.slice(0, 300),
    }, { research: researchResult });

    return { research: researchResult };
  }

  protected getFormatOptions(
    _ctx: PipelineContext,
    hookData: Record<string, unknown>,
  ): Record<string, unknown> {
    const research = hookData.research as ResearchResult;
    return {
      researchSummary: research.summary,
      researchCitations: research.citations.map(c => c.text).join('; '),
    };
  }

  /** Extract learning objectives from breakdown into hookData */
  protected async afterScriptGeneration(
    _ctx: PipelineContext,
    _screenplay: ScreenplayScene[],
    _screenplayResult: Record<string, unknown>,
    breakdownResult: Record<string, unknown>,
    _durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    _hookData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const acts = (breakdownResult as any).acts ?? [];
    const learningObjectives = acts.map((a: any) => a.learningObjective);
    return { learningObjectives, breakdownActs: acts };
  }

  protected getScriptCheckpointConfig(
    screenplay: ScreenplayScene[],
    _wordCount: number,
    _durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    hookData: Record<string, unknown>,
  ): { name: string; payload: Record<string, unknown> } {
    const breakdownActs = (hookData.breakdownActs as any[]) ?? [];
    return {
      name: 'learning-structure',
      payload: {
        scenes: screenplay.map(s => ({
          heading: s.heading,
          action: s.action.length > 200 ? s.action.slice(0, 200) + '...' : s.action,
        })),
        sceneCount: screenplay.length,
        learningObjectives: hookData.learningObjectives,
        acts: breakdownActs.map((a: any) => ({ title: a.title, learningObjective: a.learningObjective })),
      },
    };
  }

  /** Override visuals to add learning-concept overlay text */
  protected async generateVisuals(
    ctx: PipelineContext,
    screenplay: ScreenplayScene[],
    breakdownResult: Record<string, unknown>,
    metadata: FormatMetadata,
  ): Promise<Array<{ sceneId: string; imageUrl: string }>> {
    const learningObjectives = (breakdownResult as any).acts?.map((a: any) => a.learningObjective) ?? [];

    const visualTasks: Task<{ sceneId: string; imageUrl: string; overlay: string }>[] = screenplay.map((scene, i) => ({
      id: `visual_${i}`,
      type: 'visual' as const,
      priority: 1,
      retryable: true,
      timeout: 60_000,
      execute: async () => {
        const keyConceptOverlay = learningObjectives[i] ?? scene.heading;

        const guide = buildImageStyleGuide({
          scene: `Educational diagram: ${scene.action}`,
          style: 'Educational Diagram',
          background: scene.heading,
          mood: 'informative and clear',
        });

        const imageUrl = await generateImageFromPrompt(
          `Educational visual: ${scene.action}`,
          'Educational Diagram',
          '',
          '16:9',
          true,
          undefined,
          ctx.sessionId,
          i,
          guide,
        );

        return { sceneId: scene.id, imageUrl, overlay: keyConceptOverlay };
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

    // Store overlays for visual checkpoint
    this._visualOverlays = visuals.map(v => v.overlay);

    return visuals.map(v => ({ sceneId: v.sceneId, imageUrl: v.imageUrl }));
  }

  private _visualOverlays: string[] = [];

  /** Custom visual checkpoint with overlay data */
  protected getVisualCheckpointConfig(
    visuals: Array<{ sceneId: string; imageUrl: string }>,
    screenplay: ScreenplayScene[],
    _hookData: Record<string, unknown>,
  ): { name: string; payload: Record<string, unknown> } {
    return {
      name: 'visual-aids',
      payload: {
        visuals: visuals.map((v, i) => ({
          imageUrl: v.imageUrl,
          sceneId: v.sceneId,
          overlay: this._visualOverlays[i] ?? '',
        })),
        visualCount: visuals.length,
        totalScenes: screenplay.length,
      },
    };
  }

  protected async buildAssembly(
    _ctx: PipelineContext,
    totalDuration: number,
    screenplay: ScreenplayScene[],
    narrationSegments: NarrationSegment[],
    _hookData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const sceneDurations = narrationSegments.map(s => s.audioDuration);
    const chapters = buildChapterMarkers(screenplay, sceneDurations);
    const assemblyRules = buildAssemblyRules('educational', {
      totalDuration,
      scenes: screenplay,
      sceneDurations,
    });
    return { assemblyRules, chapters };
  }

  protected buildSuccessResult(sessionId: string, data: PipelineData): PipelineResult {
    return {
      success: true,
      partialResults: {
        sessionId,
        screenplay: data.screenplay,
        visuals: data.visuals,
        narrationSegments: data.narrationSegments,
        ...data.assemblyData,
        learningObjectives: data.hookData.learningObjectives,
        research: data.hookData.research,
        totalDuration: data.totalDuration,
        shotlist: data.shotlist,
      },
    };
  }
}
