/**
 * Music Video Pipeline
 *
 * Produces AI-generated music videos with lyrics, music composition, and
 * beat-synchronized visuals.
 * Phases: Lyrics → Music → Visuals → Assembly.
 *
 * Requirements: 8.1–8.6
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
import {
  buildAssemblyRules,
  generateBeatMetadata,
  alignTransitionsToBeat,
} from '../ffmpeg/formatAssembly';
import { detectLanguage } from '../languageDetector';
import { storyModeStore } from '../ai/production/store';
import type { StoryModeState } from '../ai/production/types';
import type { BeatMetadata } from '../../types';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GEMINI_API_KEY, MODELS } from '../shared/apiClient';
import { z } from 'zod';
import { agentLogger } from '../logger';

const FORMAT_ID: VideoFormat = 'music-video';
const log = agentLogger.child('MusicVideoPipeline');

// Default BPM map per genre for beat metadata generation
const GENRE_BPM: Record<string, number> = {
  'Pop': 120,
  'Rock': 130,
  'Hip Hop': 95,
  'Electronic': 128,
  'Jazz': 80,
  'Classical': 70,
  'R&B': 90,
  'Country': 100,
  'Indie': 110,
  'Ambient': 60,
};

// ============================================================================
// Schemas
// ============================================================================

const LyricsBreakdownSchema = z.object({
  acts: z.array(z.object({
    title: z.string(),      // e.g., "Verse 1", "Chorus", "Bridge"
    emotionalHook: z.string(),
    narrativeBeat: z.string(),
  })).min(2).max(5),
});

const LyricsScreenplaySchema = z.object({
  scenes: z.array(z.object({
    heading: z.string(),   // e.g., "VERSE 1 - CITY STREETS"
    action: z.string(),    // visual description for this lyric section
    dialogue: z.array(z.object({
      speaker: z.string().max(30),
      text: z.string().min(1),  // lyric lines
    })),
  })).min(2).max(5),
});

// ============================================================================
// Pipeline Implementation
// ============================================================================

export class MusicVideoPipeline implements FormatPipeline {
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
    const sessionId = `mv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const language = request.language ?? detectLanguage(request.idea);
    const metadata = this.getMetadata();

    const checkpoints = new CheckpointSystem({ maxCheckpoints: metadata.checkpointCount });

    log.info(`Starting Music Video pipeline: "${request.idea.slice(0, 60)}..." genre=${request.genre ?? 'Pop'} [${language}]`);

    try {
      // ----------------------------------------------------------------
      // Phase 1: Lyrics generation — Requirement 8.2
      // ----------------------------------------------------------------
      log.info('Phase 1: Lyrics generation');

      const formatOptions: FormatAwareGenerationOptions = {
        formatId: FORMAT_ID,
        genre: request.genre,
        language,
      };

      const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.9,
      });

      const breakdownPrompt = buildBreakdownPrompt(request.idea, formatOptions);
      const breakdownResult = await model.withStructuredOutput(LyricsBreakdownSchema).invoke(breakdownPrompt);

      const screenplayPrompt = buildScreenplayPrompt(breakdownResult.acts, formatOptions);
      const screenplayResult = await model.withStructuredOutput(LyricsScreenplaySchema).invoke(screenplayPrompt);

      // Lyrics are stored in dialogue lines
      const screenplay: ScreenplayScene[] = screenplayResult.scenes.map((s, i) => ({
        id: `scene_${i}`,
        sceneNumber: i + 1,
        heading: s.heading,
        action: s.action,
        dialogue: s.dialogue.filter(d => d.text.trim().length > 0),
        charactersPresent: [],
      }));

      const lyrics = screenplay.map(s => ({
        section: s.heading,
        lines: s.dialogue.map(d => d.text),
      }));

      // ----------------------------------------------------------------
      // Phase 2: Music composition (beat metadata) — Requirement 8.3
      // ----------------------------------------------------------------
      log.info('Phase 2: Music composition');

      const wordCount = countScriptWords(screenplay);
      const durationCheck = validateDurationConstraint(wordCount, metadata);
      if (!durationCheck.valid) {
        log.warn(`Duration constraint: ${durationCheck.message}`);
      }

      const bpm = GENRE_BPM[request.genre ?? 'Pop'] ?? 120;
      const estimatedDuration = durationCheck.estimatedSeconds;

      // Generate beat metadata for synchronization
      const beatMetadata: BeatMetadata = generateBeatMetadata(bpm, estimatedDuration);

      log.info(`Beat metadata: ${bpm} BPM, ${beatMetadata.beats.length} beats over ${estimatedDuration.toFixed(1)}s`);

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

      // Checkpoint 1: Lyrics and Music — Requirement 8.5
      const lyricsApproval = await checkpoints.createCheckpoint('lyrics-and-music');
      if (!lyricsApproval.approved) {
        log.info('Lyrics rejected by user');
        checkpoints.dispose();
        return { success: false, error: 'Lyrics rejected by user', partialResults: { lyrics, beatMetadata } };
      }

      // ----------------------------------------------------------------
      // Phase 3: Beat-synchronized visual generation — Requirement 8.4
      // ----------------------------------------------------------------
      log.info('Phase 3: Beat-synchronized visual generation');

      const visualTasks: Task<{ sceneId: string; imageUrl: string }>[] = screenplay.map((scene, i) => ({
        id: `visual_${i}`,
        type: 'visual' as const,
        priority: 1,
        retryable: true,
        timeout: 60_000,
        execute: async () => {
          const guide = buildImageStyleGuide({
            scene: scene.action,
            style: `${request.genre ?? 'Pop'} Music Video`,
            background: scene.heading,
            mood: breakdownResult.acts[i]?.emotionalHook ?? 'energetic',
          });

          const imageUrl = await generateImageFromPrompt(
            scene.action,
            `${request.genre ?? 'Pop'} Music Video`,
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

      // Align visual transitions to beats — Requirement 8.6
      const rawTransitionTimes = screenplay.map((_, i) =>
        (i / screenplay.length) * estimatedDuration
      );
      const beatAlignedTransitions = alignTransitionsToBeat(rawTransitionTimes, beatMetadata.beats);
      log.info(`Transitions aligned to beats: ${beatAlignedTransitions.map(t => t.toFixed(2)).join(', ')}s`);

      // Update state
      state.shotlist = visuals.map((v, i) => ({
        id: `shot_${i}`,
        sceneId: v.sceneId,
        shotNumber: i + 1,
        description: screenplay[i]?.action ?? '',
        cameraAngle: 'Dynamic',
        movement: 'Cut',
        lighting: 'Atmospheric',
        dialogue: screenplay[i]?.dialogue.map(d => d.text).join(' ') ?? '',
        imageUrl: v.imageUrl,
      }));
      state.currentStep = 'shotlist';
      state.updatedAt = Date.now();
      storyModeStore.set(sessionId, state);

      // Checkpoint 2: Visual Preview — Requirement 8.5
      const visualApproval = await checkpoints.createCheckpoint('visual-preview');
      if (!visualApproval.approved) {
        log.info('Visuals rejected by user');
        checkpoints.dispose();
        return {
          success: false,
          error: 'Visuals rejected by user',
          partialResults: { lyrics, beatMetadata, visuals },
        };
      }

      // ----------------------------------------------------------------
      // Phase 4: Vocal narration (sung delivery) — Requirement 8.3
      // ----------------------------------------------------------------
      log.info('Phase 4: Vocal generation');

      const scenes: Scene[] = screenplay.map((s, i) => ({
        id: s.id,
        name: s.heading,
        duration: estimatedDuration / screenplay.length,
        visualDescription: s.action,
        narrationScript: s.dialogue.map(d => d.text).join('\n'),
        emotionalTone: 'joyful' as const,
      }));

      const voiceConfig = getFormatVoiceForLanguage(FORMAT_ID, language);
      const narratorConfig: NarratorConfig = {
        defaultVoice: voiceConfig.voiceName,
        videoPurpose: 'music',
        language: language as any,
        styleOverride: voiceConfig.stylePrompt,
      };

      const narrationSegments: NarrationSegment[] = [];
      for (const scene of scenes) {
        try {
          const segment = await narrateScene(scene, narratorConfig, sessionId);
          narrationSegments.push(segment);
        } catch (err) {
          log.warn(`Vocal generation failed for scene ${scene.id}:`, err);
        }
      }

      log.info(`Vocal generation complete: ${narrationSegments.length}/${scenes.length} segments`);

      // ----------------------------------------------------------------
      // Phase 5: Assembly with beat synchronization — Requirement 8.6
      // ----------------------------------------------------------------
      log.info('Phase 5: Beat-synchronized assembly');

      const totalDuration = narrationSegments.reduce((sum, s) => sum + s.audioDuration, 0);

      const assemblyRules = buildAssemblyRules(FORMAT_ID, {
        totalDuration,
        beatMetadata,
      });

      // Checkpoint 3: Final Assembly — Requirement 8.5
      const assemblyApproval = await checkpoints.createCheckpoint('final-assembly');
      if (!assemblyApproval.approved) {
        log.info('Assembly rejected by user');
        checkpoints.dispose();
        return {
          success: false,
          error: 'Assembly rejected by user',
          partialResults: { lyrics, beatMetadata, visuals, narrationSegments },
        };
      }

      state.currentStep = 'production';
      state.updatedAt = Date.now();
      state.checkpoints = checkpoints.getAllCheckpoints();
      storyModeStore.set(sessionId, state);

      checkpoints.dispose();

      log.info(`Music Video pipeline complete: ${screenplay.length} sections, ${visuals.length} visuals, ${beatMetadata.beats.length} beats`);

      return {
        success: true,
        partialResults: {
          sessionId,
          screenplay,
          lyrics,
          visuals,
          narrationSegments,
          assemblyRules,
          beatMetadata,
          beatAlignedTransitions,
          totalDuration,
        },
      };

    } catch (error) {
      checkpoints.dispose();
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Music Video pipeline failed:', msg);
      return { success: false, error: msg };
    }
  }
}
