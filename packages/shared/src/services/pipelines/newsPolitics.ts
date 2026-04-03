/**
 * News/Politics Pipeline
 *
 * Produces balanced, factual news-style videos with multi-source research,
 * citations, and neutral voiceover.
 * Phases: Research → Script → Visuals → Audio → Assembly.
 *
 * Requirements: 9.1–9.6
 */

import type { ScreenplayScene } from '../../types';
import type { PipelineResult } from '../format/formatRouter';
import { ResearchService, type ResearchResult } from '../content/researchService';
import { ParallelExecutionEngine } from '../orchestration/parallelExecutionEngine';
import { buildBreakdownSchema, buildScreenplaySchema } from './schemas';
import {
  BasePipeline,
  type FormatConfig,
  type PipelineContext,
  type PipelineData,
} from './BasePipeline';

const config: FormatConfig = {
  formatId: 'news-politics',
  sessionPrefix: 'news',
  loggerName: 'NewsPoliticsPipeline',
  temperature: 0.5,
  visualStyle: 'News Broadcast',
  defaultMood: 'serious',
  aspectRatio: '16:9',
  emotionalTone: 'professional',
  videoPurpose: 'news_report',
  shotDefaults: { cameraAngle: 'Medium', movement: 'Static', lighting: 'Studio' },
  retryDelay: 1000,
  breakdownSchema: buildBreakdownSchema({ minActs: 3, maxActs: 5 }),
  screenplaySchema: buildScreenplaySchema({ minScenes: 3, maxScenes: 7 }),
};

export class NewsPoliticsPipeline extends BasePipeline {
  private researchService: ResearchService;

  constructor(researchService?: ResearchService, parallelEngine?: ParallelExecutionEngine) {
    super(config, parallelEngine);
    this.researchService = researchService ?? new ResearchService();
  }

  protected async beforePipeline(ctx: PipelineContext): Promise<Record<string, unknown>> {
    this.log.info('Phase 1: Balanced multi-source research');

    const researchResult: ResearchResult = await this.researchService.research({
      topic: ctx.request.idea,
      language: ctx.language as 'ar' | 'en',
      depth: 'medium',
      sources: ['web', 'knowledge-base', ...(ctx.request.referenceDocuments?.length ? ['references' as const] : [])],
      maxResults: 12,
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

  protected getScriptCheckpointConfig(
    screenplay: ScreenplayScene[],
    _wordCount: number,
    _durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    _hookData: Record<string, unknown>,
  ): { name: string; payload: Record<string, unknown> } {
    return {
      name: 'script-review',
      payload: {
        sceneCount: screenplay.length,
        scenes: screenplay.map(s => ({
          heading: s.heading,
          actionPreview: s.action.slice(0, 120),
        })),
      },
    };
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
