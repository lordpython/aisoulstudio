/**
 * Advertisement Pipeline
 *
 * Produces short, high-impact promotional videos with clear CTAs.
 * Phases: Script → Visuals → Audio → Assembly.
 *
 * Requirements: 4.1–4.6
 */

import type { ScreenplayScene } from '../../types';
import type { PipelineResult } from '../formatRouter';
import { ParallelExecutionEngine } from '../parallelExecutionEngine';
import { buildAssemblyRules, buildCTAMarker, validateCTAPosition } from '../ffmpeg/formatAssembly';
import { buildBreakdownSchema, buildScreenplaySchema } from './schemas';
import { z } from 'zod';
import {
  BasePipeline,
  type FormatConfig,
  type PipelineContext,
  type PipelineData,
} from './BasePipeline';
import type { NarrationSegment } from '../../types';

const config: FormatConfig = {
  formatId: 'advertisement',
  sessionPrefix: 'ad',
  loggerName: 'AdvertisementPipeline',
  temperature: 0.8,
  visualStyle: 'High-Impact Commercial',
  defaultMood: 'energetic',
  aspectRatio: '16:9',
  emotionalTone: 'urgent',
  videoPurpose: 'commercial',
  shotDefaults: { cameraAngle: 'Dynamic', movement: 'Fast', lighting: 'High-Key' },
  retryDelay: 1000,
  breakdownSchema: buildBreakdownSchema({ minActs: 2, maxActs: 4 }),
  screenplaySchema: buildScreenplaySchema({
    minScenes: 2,
    maxScenes: 5,
    extraFields: {
      ctaText: z.string().describe('A short, punchy call-to-action (e.g. "Shop Now", "Try Free Today", "Learn More"). Max 6 words.'),
    },
  }),
};

export class AdvertisementPipeline extends BasePipeline {
  constructor(parallelEngine?: ParallelExecutionEngine) {
    super(config, parallelEngine);
  }

  protected async afterScriptGeneration(
    _ctx: PipelineContext,
    _screenplay: ScreenplayScene[],
    screenplayResult: Record<string, unknown>,
    _breakdownResult: Record<string, unknown>,
    _durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    _hookData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const ctaText = (screenplayResult as any).ctaText || 'Learn More';
    return { ctaText };
  }

  protected getScriptCheckpointConfig(
    screenplay: ScreenplayScene[],
    wordCount: number,
    durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    hookData: Record<string, unknown>,
  ): { name: string; payload: Record<string, unknown> } {
    return {
      name: 'script-with-cta',
      payload: {
        sceneCount: screenplay.length,
        scenes: screenplay.map(s => ({
          heading: s.heading,
          action: s.action.slice(0, 200),
        })),
        ctaText: hookData.ctaText,
        wordCount,
        estimatedDuration: durationCheck.estimatedSeconds,
        durationValid: durationCheck.valid,
      },
    };
  }

  protected async buildAssembly(
    _ctx: PipelineContext,
    totalDuration: number,
    _screenplay: ScreenplayScene[],
    _narrationSegments: NarrationSegment[],
    hookData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const ctaText = hookData.ctaText as string;
    const ctaMarker = buildCTAMarker(ctaText, totalDuration);
    const ctaValid = validateCTAPosition(ctaMarker, totalDuration);
    if (!ctaValid) {
      this.log.warn('CTA position validation failed — adjusting');
    }
    const assemblyRules = buildAssemblyRules('advertisement', { totalDuration, ctaText });
    return { assemblyRules, ctaMarker, ctaValid };
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
        totalDuration: data.totalDuration,
        shotlist: data.shotlist,
      },
    };
  }
}
