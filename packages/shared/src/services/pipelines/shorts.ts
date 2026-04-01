/**
 * Shorts/Reels Pipeline
 *
 * Produces vertical short-form videos (15–60s) optimized for mobile with
 * hook-first engagement and fast-paced visuals.
 * Phases: Script → Visuals → Audio → Assembly.
 *
 * Requirements: 6.1–6.5
 */

import type { ScreenplayScene } from '../../types';
import type { PipelineResult } from '../formatRouter';
import { ParallelExecutionEngine } from '../parallelExecutionEngine';
import { buildBreakdownSchema, buildScreenplaySchema } from './schemas';
import { BasePipeline, type FormatConfig, type PipelineData } from './BasePipeline';

const config: FormatConfig = {
  formatId: 'shorts',
  sessionPrefix: 'sht',
  loggerName: 'ShortsPipeline',
  temperature: 0.85,
  visualStyle: 'Fast-Paced Vertical',
  defaultMood: 'exciting',
  aspectRatio: '9:16',
  emotionalTone: 'urgent',
  videoPurpose: 'social_short',
  shotDefaults: { cameraAngle: 'Close-Up', movement: 'Fast', lighting: 'Vibrant' },
  retryDelay: 800,
  breakdownSchema: buildBreakdownSchema({ minActs: 2, maxActs: 3 }),
  screenplaySchema: buildScreenplaySchema({ minScenes: 2, maxScenes: 4 }),
};

export class ShortsPipeline extends BasePipeline {
  constructor(parallelEngine?: ParallelExecutionEngine) {
    super(config, parallelEngine);
  }

  protected getScriptCheckpointConfig(
    screenplay: ScreenplayScene[],
    _wordCount: number,
    _durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    _hookData: Record<string, unknown>,
  ): { name: string; payload: Record<string, unknown> } {
    return {
      name: 'hook-preview',
      payload: {
        sceneCount: screenplay.length,
        scenes: screenplay.map(s => ({
          heading: s.heading,
          action: s.action.length > 200 ? s.action.slice(0, 200) + '...' : s.action,
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
        totalDuration: data.totalDuration,
        aspectRatio: '9:16',
        shotlist: data.shotlist,
      },
    };
  }
}
