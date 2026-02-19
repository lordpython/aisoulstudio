/**
 * YouTube Narrator Pipeline
 *
 * Produces long-form YouTube narrator videos with conversational narration
 * and B-roll visuals. Phases: Research → Script → Visuals → Audio → Assembly.
 *
 * Requirements: 3.1–3.7
 */

import type { FormatMetadata, VideoFormat, Scene, NarrationSegment, ScreenplayScene } from '../../types';
import type { FormatPipeline, PipelineRequest, PipelineResult } from '../formatRouter';
import { formatRegistry } from '../formatRegistry';
import { ResearchService, type ResearchResult } from '../researchService';
import {
  buildBreakdownPrompt,
  buildScreenplayPrompt,
  generateVoiceoverScripts,
  countScriptWords,
  validateDurationConstraint,
  type FormatAwareGenerationOptions,
} from '../ai/storyPipeline';
import { ParallelExecutionEngine, type Task } from '../parallelExecutionEngine';
import { CheckpointSystem, type CheckpointApproval } from '../checkpointSystem';
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

const FORMAT_ID: VideoFormat = 'youtube-narrator';
const log = agentLogger.child('YouTubeNarratorPipeline');

// ============================================================================
// Schemas
// ============================================================================

const BreakdownSchema = z.object({
  acts: z.array(z.object({
    title: z.string(),
    emotionalHook: z.string(),
    narrativeBeat: z.string(),
  })).min(3).max(5),
});

const ScreenplaySchema = z.object({
  scenes: z.array(z.object({
    heading: z.string(),
    action: z.string(),
    dialogue: z.array(z.object({
      speaker: z.string().max(30),
      text: z.string().min(1),
    })),
  })).min(3).max(8),
});

// ============================================================================
// Pipeline Implementation
// ============================================================================

export class YouTubeNarratorPipeline implements FormatPipeline {
  private researchService: ResearchService;
  private parallelEngine: ParallelExecutionEngine;

  constructor(
    researchService?: ResearchService,
    parallelEngine?: ParallelExecutionEngine,
  ) {
    this.researchService = researchService ?? new ResearchService();
    this.parallelEngine = parallelEngine ?? new ParallelExecutionEngine();
  }

  getMetadata(): FormatMetadata {
    return formatRegistry.getFormat(FORMAT_ID)!;
  }

  async validate(request: PipelineRequest): Promise<boolean> {
    return !!request.idea && request.idea.trim().length > 0;
  }

  async execute(request: PipelineRequest): Promise<PipelineResult> {
    const sessionId = `yt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const language = request.language ?? detectLanguage(request.idea);
    const metadata = this.getMetadata();

    const checkpoints = new CheckpointSystem({ maxCheckpoints: metadata.checkpointCount });

    log.info(`Starting YouTube Narrator pipeline: "${request.idea.slice(0, 60)}..." [${language}]`);

    try {
      // ----------------------------------------------------------------
      // Phase 1: Research (parallel web queries) — Requirement 3.5
      // ----------------------------------------------------------------
      log.info('Phase 1: Research');

      let researchResult: ResearchResult | undefined;
      let indexedDocs;

      if (request.referenceDocuments?.length) {
        indexedDocs = await this.researchService.prioritizeReferences(request.referenceDocuments);
      }

      researchResult = await this.researchService.research({
        topic: request.idea,
        language,
        depth: 'medium',
        sources: ['web', 'knowledge-base', ...(indexedDocs ? ['references' as const] : [])],
        maxResults: 10,
        referenceDocuments: indexedDocs,
      });

      log.info(`Research complete: ${researchResult.sources.length} sources, confidence=${researchResult.confidence.toFixed(2)}`);

      // ----------------------------------------------------------------
      // Phase 2: Script generation — Requirements 3.1, 3.2
      // ----------------------------------------------------------------
      log.info('Phase 2: Script generation');

      const formatOptions: FormatAwareGenerationOptions = {
        formatId: FORMAT_ID,
        genre: request.genre,
        language,
        researchSummary: researchResult.summary,
        researchCitations: researchResult.citations.map(c => c.text).join('; '),
      };

      // Step 2a: Breakdown
      const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.7,
      });

      const breakdownPrompt = buildBreakdownPrompt(request.idea, formatOptions);
      const breakdownResult = await model.withStructuredOutput(BreakdownSchema).invoke(breakdownPrompt);

      // Step 2b: Screenplay
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

      // Duration validation
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

      // Checkpoint 1: Script Review — Requirement 3.6
      const scriptApproval = await checkpoints.createCheckpoint('script-review');
      if (!scriptApproval.approved) {
        log.info('Script rejected by user');
        checkpoints.dispose();
        return { success: false, error: 'Script rejected by user', partialResults: { screenplay } };
      }

      // ----------------------------------------------------------------
      // Phase 3: Visual generation (B-roll, 16:9) — Requirement 3.3
      // ----------------------------------------------------------------
      log.info('Phase 3: Visual generation');

      const visualTasks: Task<{ sceneId: string; imageUrl: string }>[] = screenplay.map((scene, i) => ({
        id: `visual_${i}`,
        type: 'visual' as const,
        priority: 1,
        retryable: true,
        timeout: 60_000,
        execute: async () => {
          const guide = buildImageStyleGuide({
            scene: scene.action,
            style: 'B-roll Documentary',
            background: scene.heading,
            mood: breakdownResult.acts[i]?.emotionalHook ?? 'informative',
          });

          const imageUrl = await generateImageFromPrompt(
            scene.action,
            'B-roll Documentary',
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

      // Update state with visuals
      state.shotlist = visuals.map((v, i) => ({
        id: `shot_${i}`,
        sceneId: v.sceneId,
        shotNumber: i + 1,
        description: screenplay[i]?.action ?? '',
        cameraAngle: 'Wide',
        movement: 'Static',
        lighting: 'Natural',
        dialogue: screenplay[i]?.dialogue[0]?.text ?? '',
        imageUrl: v.imageUrl,
      }));
      state.currentStep = 'shotlist';
      state.updatedAt = Date.now();
      storyModeStore.set(sessionId, state);

      // Checkpoint 2: Visual Preview — Requirement 3.6
      const visualApproval = await checkpoints.createCheckpoint('visual-preview');
      if (!visualApproval.approved) {
        log.info('Visuals rejected by user');
        checkpoints.dispose();
        return { success: false, error: 'Visuals rejected by user', partialResults: { screenplay, visuals } };
      }

      // ----------------------------------------------------------------
      // Phase 4: Audio generation (conversational voice) — Requirement 3.4
      // ----------------------------------------------------------------
      log.info('Phase 4: Audio generation');

      // Generate voiceover scripts with delivery markers
      const voiceoverMap = await generateVoiceoverScripts(
        screenplay,
        breakdownResult.acts.map(a => a.emotionalHook),
      );

      // Convert screenplay to Scene[] for narrator service
      const scenes: Scene[] = screenplay.map((s, i) => ({
        id: s.id,
        name: s.heading,
        duration: durationCheck.estimatedSeconds / screenplay.length,
        visualDescription: s.action,
        narrationScript: voiceoverMap.get(s.id) ?? s.dialogue.map(d => d.text).join(' '),
        emotionalTone: 'friendly' as const,
      }));

      const voiceConfig = getFormatVoiceForLanguage(FORMAT_ID, language);
      const narratorConfig: NarratorConfig = {
        defaultVoice: voiceConfig.voiceName,
        videoPurpose: 'documentary',
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
      // Phase 5: Assembly — Requirements 3.1
      // ----------------------------------------------------------------
      log.info('Phase 5: Assembly');

      const totalDuration = narrationSegments.reduce((sum, s) => sum + s.audioDuration, 0);
      const assemblyRules = buildAssemblyRules(FORMAT_ID, { totalDuration });

      // Checkpoint 3: Final Assembly — Requirement 3.6
      const assemblyApproval = await checkpoints.createCheckpoint('final-assembly');
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

      log.info(`YouTube Narrator pipeline complete: ${screenplay.length} scenes, ${visuals.length} visuals, ${narrationSegments.length} narrations`);

      return {
        success: true,
        partialResults: {
          sessionId,
          screenplay,
          visuals,
          narrationSegments,
          assemblyRules,
          research: researchResult,
          totalDuration,
        },
      };

    } catch (error) {
      checkpoints.dispose();
      const msg = error instanceof Error ? error.message : String(error);
      log.error('YouTube Narrator pipeline failed:', msg);
      return { success: false, error: msg };
    }
  }
}
