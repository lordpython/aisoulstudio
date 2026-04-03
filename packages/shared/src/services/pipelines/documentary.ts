/**
 * Documentary Pipeline
 *
 * Produces deeply researched long-form videos with chapter structure, citations,
 * and archival visuals. Phases: Research → Script → Visuals → Audio → Assembly.
 *
 * Requirements: 7.1–7.6
 */

import type { ScreenplayScene, NarrationSegment } from '../../types';
import type { PipelineResult } from '../format/formatRouter';
import { ResearchService, type ResearchResult } from '../content/researchService';
import { ParallelExecutionEngine } from '../orchestration/parallelExecutionEngine';
import {
  buildAssemblyRules,
  buildChapterMarkers,
  validateChapterSequence,
} from '../ffmpeg/formatAssembly';
import { buildBreakdownSchema, buildScreenplaySchema } from './schemas';
import { z } from 'zod';
import {
  BasePipeline,
  type FormatConfig,
  type PipelineContext,
  type PipelineData,
} from './BasePipeline';

const config: FormatConfig = {
  formatId: 'documentary',
  sessionPrefix: 'doc',
  loggerName: 'DocumentaryPipeline',
  temperature: 0.6,
  visualStyle: 'Archival Documentary',
  defaultMood: 'solemn',
  aspectRatio: '16:9',
  emotionalTone: 'dramatic',
  videoPurpose: 'documentary',
  shotDefaults: { cameraAngle: 'Wide', movement: 'Slow Pan', lighting: 'Natural' },
  retryDelay: 1500,
  breakdownSchema: buildBreakdownSchema({
    minActs: 4, maxActs: 8,
    extraActFields: { chapterTitle: z.string() },
  }),
  screenplaySchema: buildScreenplaySchema({ minScenes: 4, maxScenes: 10 }),
};

export class DocumentaryPipeline extends BasePipeline {
  private researchService: ResearchService;

  constructor(researchService?: ResearchService, parallelEngine?: ParallelExecutionEngine) {
    super(config, parallelEngine);
    this.researchService = researchService ?? new ResearchService();
  }

  protected async beforePipeline(ctx: PipelineContext): Promise<Record<string, unknown>> {
    this.log.info('Phase 1: Deep research across multiple sources');

    const researchResult: ResearchResult = await this.researchService.research({
      topic: ctx.request.idea,
      language: ctx.language as 'ar' | 'en',
      depth: 'deep',
      sources: ['web', 'knowledge-base', ...(ctx.request.referenceDocuments?.length ? ['references' as const] : [])],
      maxResults: 20,
      referenceDocuments: ctx.request.referenceDocuments,
    });

    this.log.info(`Research complete: ${researchResult.sources.length} sources, confidence=${researchResult.confidence.toFixed(2)}`);

    await this.requireApproval(ctx.checkpoints, 'research-summary', {
      sourceCount: researchResult.sources.length,
      confidence: researchResult.confidence,
      keyTopics: researchResult.summary.slice(0, 200),
      citationCount: researchResult.citations.length,
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

  /** Documentary breakdown uses chapterTitle instead of title */
  protected buildBreakdownSummary(breakdownResult: Record<string, unknown>): string {
    const acts = (breakdownResult as any).acts ?? [];
    return acts.map((a: any) => `${a.chapterTitle}: ${a.narrativeBeat}`).join('\n');
  }

  protected getScriptCheckpointConfig(
    screenplay: ScreenplayScene[],
    _wordCount: number,
    _durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    _hookData: Record<string, unknown>,
  ): { name: string; payload: Record<string, unknown> } {
    return {
      name: 'chapter-structure',
      payload: {
        sceneCount: screenplay.length,
        scenes: screenplay.map(s => ({
          heading: s.heading,
          action: s.action.slice(0, 120),
        })),
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
    const chaptersValid = validateChapterSequence(chapters);
    if (!chaptersValid) {
      this.log.warn('Chapter sequence validation failed — some chapters may overlap');
    }
    const assemblyRules = buildAssemblyRules('documentary', {
      totalDuration,
      scenes: screenplay,
      sceneDurations,
    });
    return { assemblyRules, chapters, chaptersValid };
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
        research: data.hookData.research,
        totalDuration: data.totalDuration,
        shotlist: data.shotlist,
      },
    };
  }
}
