/**
 * YouTube Narrator Pipeline
 *
 * Produces long-form YouTube narrator videos with conversational narration
 * and B-roll visuals. Phases: Research → Script → Visuals → Audio → Assembly.
 *
 * Requirements: 3.1–3.7
 */

import type { ScreenplayScene, Scene, NarrationSegment } from '../../types';
import type { PipelineResult } from '../formatRouter';
import { ResearchService, type ResearchResult } from '../researchService';
import { generateVoiceoverScripts } from '../ai/storyPipeline';
import { ParallelExecutionEngine } from '../parallelExecutionEngine';
import { narrateScene, getFormatVoiceForLanguage, type NarratorConfig } from '../narratorService';
import type { LanguageCode } from '../../constants';
import { buildBreakdownSchema, buildScreenplaySchema } from './schemas';
import {
  BasePipeline,
  type FormatConfig,
  type PipelineContext,
  type PipelineData,
} from './BasePipeline';

const config: FormatConfig = {
  formatId: 'youtube-narrator',
  sessionPrefix: 'yt',
  loggerName: 'YouTubeNarratorPipeline',
  temperature: 0.7,
  visualStyle: 'B-roll Documentary',
  defaultMood: 'informative',
  aspectRatio: '16:9',
  emotionalTone: 'friendly',
  videoPurpose: 'educational',
  shotDefaults: { cameraAngle: 'Wide', movement: 'Static', lighting: 'Natural' },
  retryDelay: 1000,
  breakdownSchema: buildBreakdownSchema({ minActs: 3, maxActs: 5 }),
  screenplaySchema: buildScreenplaySchema({ minScenes: 3, maxScenes: 8 }),
};

export class YouTubeNarratorPipeline extends BasePipeline {
  private researchService: ResearchService;

  constructor(researchService?: ResearchService, parallelEngine?: ParallelExecutionEngine) {
    super(config, parallelEngine);
    this.researchService = researchService ?? new ResearchService();
  }

  /** Research phase — no checkpoint (goes straight to script) */
  protected async beforePipeline(ctx: PipelineContext): Promise<Record<string, unknown>> {
    this.log.info('Phase 1: Research');

    const researchResult: ResearchResult = await this.researchService.research({
      topic: ctx.request.idea,
      language: ctx.language as 'ar' | 'en',
      depth: 'medium',
      sources: ['web', 'knowledge-base', ...(ctx.request.referenceDocuments?.length ? ['references' as const] : [])],
      maxResults: 10,
      referenceDocuments: ctx.request.referenceDocuments,
    });

    this.log.info(`Research complete: ${researchResult.sources.length} sources, confidence=${researchResult.confidence.toFixed(2)}`);

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

  /** Store breakdown acts for voiceover script generation */
  protected async afterScriptGeneration(
    _ctx: PipelineContext,
    _screenplay: ScreenplayScene[],
    _screenplayResult: Record<string, unknown>,
    breakdownResult: Record<string, unknown>,
    _durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    _hookData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return { breakdownActs: (breakdownResult as any).acts ?? [] };
  }

  protected getScriptCheckpointConfig(
    screenplay: ScreenplayScene[],
    _wordCount: number,
    durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    _hookData: Record<string, unknown>,
  ): { name: string; payload: Record<string, unknown> } {
    return {
      name: 'script-review',
      payload: {
        sceneCount: screenplay.length,
        scenes: screenplay.map(s => ({
          heading: s.heading,
          action: s.action.length > 200 ? s.action.slice(0, 200) + '...' : s.action,
        })),
        estimatedDuration: `${Math.round(durationCheck.estimatedSeconds)}s`,
      },
    };
  }

  /**
   * Override narration to use generateVoiceoverScripts for enhanced delivery markers.
   */
  protected async generateNarration(
    ctx: PipelineContext,
    screenplay: ScreenplayScene[],
    durationCheck: { estimatedSeconds: number },
    hookData?: Record<string, unknown>,
  ): Promise<{ scenes: Scene[]; narrationSegments: NarrationSegment[] }> {
    const breakdownActs = (hookData?.breakdownActs as any[]) ?? [];

    const voiceoverMap = await generateVoiceoverScripts(
      screenplay,
      breakdownActs.map((a: any) => a.emotionalHook),
      ctx.language as 'ar' | 'en' | undefined,
    );

    const scenes: Scene[] = screenplay.map((s, i) => ({
      id: s.id,
      name: s.heading,
      duration: durationCheck.estimatedSeconds / screenplay.length,
      visualDescription: s.action,
      narrationScript: voiceoverMap.get(s.id) ?? s.dialogue.map(d => d.text).join(' '),
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
