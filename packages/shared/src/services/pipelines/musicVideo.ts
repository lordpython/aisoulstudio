/**
 * Music Video Pipeline
 *
 * Produces AI-generated music videos with lyrics, music composition, and
 * beat-synchronized visuals.
 * Phases: Lyrics → Music → Visuals → Assembly.
 *
 * Requirements: 8.1–8.6
 */

import type { EmotionalTone, ScreenplayScene, NarrationSegment, BeatMetadata } from '../../types';
import type { PipelineResult } from '../format/formatRouter';
import { ParallelExecutionEngine } from '../orchestration/parallelExecutionEngine';
import {
  buildAssemblyRules,
  generateBeatMetadata,
  alignTransitionsToBeat,
} from '../ffmpeg/formatAssembly';
import { buildBreakdownSchema, buildScreenplaySchema } from './schemas';
import {
  BasePipeline,
  type FormatConfig,
  type PipelineContext,
  type PipelineData,
} from './BasePipeline';

// Default BPM map per genre for beat metadata generation
const GENRE_BPM: Record<string, number> = {
  'Pop': 120, 'Rock': 130, 'Hip Hop': 95, 'Electronic': 128,
  'Jazz': 80, 'Classical': 70, 'R&B': 90, 'Country': 100,
  'Indie': 110, 'Ambient': 60,
};

// Maps music genre to the closest emotional tone for narrator delivery
const GENRE_TONE: Record<string, EmotionalTone> = {
  'Pop': 'friendly', 'Rock': 'dramatic', 'Hip Hop': 'urgent', 'Electronic': 'urgent',
  'Jazz': 'calm', 'Classical': 'calm', 'R&B': 'friendly', 'Country': 'friendly',
  'Indie': 'calm', 'Ambient': 'calm',
};

const config: FormatConfig = {
  formatId: 'music-video',
  sessionPrefix: 'mv',
  loggerName: 'MusicVideoPipeline',
  temperature: 0.9,
  visualStyle: 'Pop Music Video',  // overridden by getVisualStyle based on genre
  defaultMood: 'energetic',
  aspectRatio: '16:9',
  emotionalTone: 'friendly',  // overridden per genre in scene construction
  videoPurpose: 'music_video',
  shotDefaults: { cameraAngle: 'Dynamic', movement: 'Cut', lighting: 'Atmospheric' },
  retryDelay: 1000,
  breakdownSchema: buildBreakdownSchema({ minActs: 2, maxActs: 5 }),
  screenplaySchema: buildScreenplaySchema({ minScenes: 2, maxScenes: 5 }),
};

export class MusicVideoPipeline extends BasePipeline {
  constructor(parallelEngine?: ParallelExecutionEngine) {
    super(config, parallelEngine);
  }

  /** Extract lyrics and generate beat metadata after script generation */
  protected async afterScriptGeneration(
    ctx: PipelineContext,
    screenplay: ScreenplayScene[],
    _screenplayResult: Record<string, unknown>,
    _breakdownResult: Record<string, unknown>,
    durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    _hookData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const lyrics = screenplay.map(s => ({
      section: s.heading,
      lines: s.dialogue.map(d => d.text),
    }));

    const bpm = GENRE_BPM[ctx.request.genre ?? 'Pop'] ?? 120;
    const estimatedDuration = durationCheck.estimatedSeconds;
    const beatMetadata: BeatMetadata = generateBeatMetadata(bpm, estimatedDuration);

    this.log.info(`Beat metadata: ${bpm} BPM, ${beatMetadata.beats.length} beats over ${estimatedDuration.toFixed(1)}s`);

    return { lyrics, bpm, estimatedDuration, beatMetadata };
  }

  /** Visual style depends on genre */
  protected getVisualStyle(ctx: PipelineContext, _sceneIndex: number): string {
    return `${ctx.request.genre ?? 'Pop'} Music Video`;
  }

  /** Join all dialogue lines for shotlist (lyrics need full text) */
  protected buildShotDialogue(scene?: ScreenplayScene): string {
    return scene?.dialogue.map(d => d.text).join(' ') ?? '';
  }

  protected getScriptCheckpointConfig(
    screenplay: ScreenplayScene[],
    _wordCount: number,
    _durationCheck: { valid: boolean; message?: string; estimatedSeconds: number },
    hookData: Record<string, unknown>,
  ): { name: string; payload: Record<string, unknown> } {
    const lyrics = hookData.lyrics as Array<{ section: string; lines: string[] }>;
    const beatMetadata = hookData.beatMetadata as BeatMetadata;
    return {
      name: 'lyrics-and-music',
      payload: {
        sceneCount: screenplay.length,
        scenes: screenplay.map(s => ({
          heading: s.heading,
          action: s.action.slice(0, 120),
        })),
        lyrics: lyrics.map(l => ({ section: l.section, lines: l.lines })),
        bpm: hookData.bpm,
        estimatedDuration: hookData.estimatedDuration,
        beatCount: beatMetadata.beats.length,
      },
    };
  }

  /** Visual checkpoint includes lyrics per visual */
  protected getVisualCheckpointConfig(
    visuals: Array<{ sceneId: string; imageUrl: string }>,
    screenplay: ScreenplayScene[],
    hookData: Record<string, unknown>,
  ): { name: string; payload: Record<string, unknown> } {
    const lyrics = hookData.lyrics as Array<{ section: string; lines: string[] }>;
    return {
      name: 'visual-preview',
      payload: {
        visuals: visuals.map((v, i) => ({
          sceneId: v.sceneId,
          imageUrl: v.imageUrl,
          section: lyrics[i]?.section ?? '',
          lines: lyrics[i]?.lines ?? [],
        })),
        visualCount: visuals.length,
        totalScenes: screenplay.length,
      },
    };
  }

  /** Beat-align transitions after visual generation */
  protected async afterVisualGeneration(
    ctx: PipelineContext,
    _visuals: Array<{ sceneId: string; imageUrl: string }>,
    screenplay: ScreenplayScene[],
    hookData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const beatMetadata = hookData.beatMetadata as BeatMetadata;
    const estimatedDuration = hookData.estimatedDuration as number;

    const rawTransitionTimes = screenplay.map((_, i) =>
      (i / screenplay.length) * estimatedDuration,
    );
    const beatAlignedTransitions = alignTransitionsToBeat(rawTransitionTimes, beatMetadata.beats);
    this.log.info(`Transitions aligned to beats: ${beatAlignedTransitions.map(t => t.toFixed(2)).join(', ')}s`);

    return { beatAlignedTransitions };
  }

  protected async buildAssembly(
    _ctx: PipelineContext,
    totalDuration: number,
    _screenplay: ScreenplayScene[],
    _narrationSegments: NarrationSegment[],
    hookData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const assemblyRules = buildAssemblyRules('music-video', {
      totalDuration,
      beatMetadata: hookData.beatMetadata as BeatMetadata | undefined,
    });
    return { assemblyRules };
  }

  protected buildSuccessResult(sessionId: string, data: PipelineData): PipelineResult {
    return {
      success: true,
      partialResults: {
        sessionId,
        screenplay: data.screenplay,
        lyrics: data.hookData.lyrics,
        visuals: data.visuals,
        narrationSegments: data.narrationSegments,
        ...data.assemblyData,
        beatMetadata: data.hookData.beatMetadata,
        beatAlignedTransitions: data.hookData.beatAlignedTransitions,
        totalDuration: data.totalDuration,
        shotlist: data.shotlist,
      },
    };
  }
}
