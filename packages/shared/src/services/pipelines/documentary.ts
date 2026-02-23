/**
 * Documentary Pipeline
 *
 * Produces deeply researched long-form videos with chapter structure, citations,
 * and archival visuals. Phases: Research → Script → Visuals → Audio → Assembly.
 *
 * Requirements: 7.1–7.6
 */

import type { FormatMetadata, VideoFormat, Scene, NarrationSegment, ScreenplayScene } from '../../types';
import type { FormatPipeline, PipelineRequest, PipelineResult, PipelineCallbacks } from '../formatRouter';
import { formatRegistry } from '../formatRegistry';
import { ResearchService, type ResearchResult } from '../researchService';
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
  buildChapterMarkers,
  validateChapterSequence,
} from '../ffmpeg/formatAssembly';
import { detectLanguage } from '../languageDetector';
import { storyModeStore } from '../ai/production/store';
import type { StoryModeState } from '../ai/production/types';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GEMINI_API_KEY, MODELS } from '../shared/apiClient';
import { z } from 'zod';
import { agentLogger } from '../logger';

const FORMAT_ID: VideoFormat = 'documentary';
const log = agentLogger.child('DocumentaryPipeline');

// ============================================================================
// Schemas
// ============================================================================

const BreakdownSchema = z.object({
  acts: z.array(z.object({
    title: z.string(),
    emotionalHook: z.string(),
    narrativeBeat: z.string(),
    chapterTitle: z.string(),
  })).min(4).max(8),
});

const ScreenplaySchema = z.object({
  scenes: z.array(z.object({
    heading: z.string(),
    action: z.string(),
    dialogue: z.array(z.object({
      speaker: z.string().max(30),
      text: z.string().min(1),
    })),
  })).min(4).max(10),
});

// ============================================================================
// Pipeline Implementation
// ============================================================================

export class DocumentaryPipeline implements FormatPipeline {
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

  async execute(request: PipelineRequest, callbacks?: PipelineCallbacks): Promise<PipelineResult> {
    const sessionId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const language = request.language ?? detectLanguage(request.idea);
    const metadata = this.getMetadata();

    let cancelled = false;
    const checkpoints = new CheckpointSystem({
      maxCheckpoints: metadata.checkpointCount,
      onCheckpointCreated: callbacks?.onCheckpointCreated,
    });
    callbacks?.onCheckpointSystemCreated?.(checkpoints);
    callbacks?.onCancelRequested?.(() => { cancelled = true; checkpoints.dispose(); });

    log.info(`Starting Documentary pipeline: "${request.idea.slice(0, 60)}..." [${language}]`);

    try {
      // ----------------------------------------------------------------
      // Phase 1: Extensive research with multiple sources — Requirements 7.2, 7.6
      // ----------------------------------------------------------------
      log.info('Phase 1: Deep research across multiple sources');

      const researchResult: ResearchResult = await this.researchService.research({
        topic: request.idea,
        language,
        depth: 'deep',
        sources: ['web', 'knowledge-base', ...(request.referenceDocuments?.length ? ['references' as const] : [])],
        maxResults: 20,
        referenceDocuments: request.referenceDocuments,
      });

      log.info(`Research complete: ${researchResult.sources.length} sources, confidence=${researchResult.confidence.toFixed(2)}`);

      // Checkpoint 1: Research Summary — Requirement 7.5
      const researchApproval = await checkpoints.createCheckpoint('research-summary', {
        sourceCount: researchResult.sources.length,
        confidence: researchResult.confidence,
        keyTopics: researchResult.summary.slice(0, 200),
        citationCount: researchResult.citations.length,
      });
      if (!researchApproval.approved) {
        log.info('Research rejected by user');
        checkpoints.dispose();
        return { success: false, error: 'Research rejected by user', partialResults: { research: researchResult } };
      }

      // ----------------------------------------------------------------
      // Phase 2: Chapter-structured script with citations — Requirement 7.3
      // ----------------------------------------------------------------
      log.info('Phase 2: Chapter-structured script generation');

      const formatOptions: FormatAwareGenerationOptions = {
        formatId: FORMAT_ID,
        genre: request.genre,
        language,
        researchSummary: researchResult.summary,
        researchCitations: researchResult.citations.map(c => c.text).join('; '),
      };

      const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey: GEMINI_API_KEY,
        temperature: 0.6,
      });

      const breakdownPrompt = buildBreakdownPrompt(request.idea, formatOptions);
      const breakdownResult = await model.withStructuredOutput(BreakdownSchema).invoke(breakdownPrompt);

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

      const wordCount = countScriptWords(screenplay);
      const durationCheck = validateDurationConstraint(wordCount, metadata);
      if (!durationCheck.valid) {
        log.warn(`Duration constraint: ${durationCheck.message}`);
      }

      // Persist state
      const state: StoryModeState = {
        id: sessionId,
        topic: request.idea,
        breakdown: breakdownResult.acts.map(a => `${a.chapterTitle}: ${a.narrativeBeat}`).join('\n'),
        screenplay,
        characters: [],
        shotlist: [],
        currentStep: 'screenplay',
        updatedAt: Date.now(),
        formatId: FORMAT_ID,
        language,
      };
      storyModeStore.set(sessionId, state);

      // Checkpoint 2: Chapter Structure — Requirement 7.5
      const chapterApproval = await checkpoints.createCheckpoint('chapter-structure', {
        sceneCount: screenplay.length,
        scenes: screenplay.map(s => ({
          heading: s.heading,
          action: s.action.slice(0, 120),
        })),
      });
      if (!chapterApproval.approved) {
        log.info('Chapter structure rejected by user');
        checkpoints.dispose();
        return { success: false, error: 'Chapter structure rejected by user', partialResults: { screenplay, research: researchResult } };
      }

      // ----------------------------------------------------------------
      // Phase 3: Archival visuals and data visualizations — Requirement 7.4
      // ----------------------------------------------------------------
      log.info('Phase 3: Archival visual generation');

      const visualTasks: Task<{ sceneId: string; imageUrl: string }>[] = screenplay.map((scene, i) => ({
        id: `visual_${i}`,
        type: 'visual' as const,
        priority: 1,
        retryable: true,
        timeout: 60_000,
        execute: async () => {
          const guide = buildImageStyleGuide({
            scene: scene.action,
            style: 'Archival Documentary',
            background: scene.heading,
            mood: breakdownResult.acts[i]?.emotionalHook ?? 'solemn',
          });

          const imageUrl = await generateImageFromPrompt(
            scene.action,
            'Archival Documentary',
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
        retryDelay: 1500,
        exponentialBackoff: true,
      });

      const visuals = visualResults
        .filter(r => r.success && r.data)
        .map(r => r.data!);

      log.info(`Visuals generated: ${visuals.length}/${screenplay.length}`);

      // Update state
      state.shotlist = visuals.map((v, i) => ({
        id: `shot_${i}`,
        sceneId: v.sceneId,
        shotNumber: i + 1,
        description: screenplay[i]?.action ?? '',
        cameraAngle: 'Wide',
        movement: 'Slow Pan',
        lighting: 'Natural',
        dialogue: screenplay[i]?.dialogue[0]?.text ?? '',
        imageUrl: v.imageUrl,
      }));
      state.currentStep = 'shotlist';
      state.updatedAt = Date.now();
      storyModeStore.set(sessionId, state);

      // Checkpoint 3: Visual Preview — Requirement 7.5
      const visualApproval = await checkpoints.createCheckpoint('visual-preview', {
        visualCount: visuals.length,
        totalScenes: screenplay.length,
        visuals: visuals.map(v => ({
          sceneId: v.sceneId,
          imageUrl: v.imageUrl,
        })),
      });
      if (!visualApproval.approved) {
        log.info('Visuals rejected by user');
        checkpoints.dispose();
        return {
          success: false,
          error: 'Visuals rejected by user',
          partialResults: { screenplay, visuals, research: researchResult },
        };
      }

      // ----------------------------------------------------------------
      // Phase 4: Audio generation (neutral voice) — Requirements 7.1
      // ----------------------------------------------------------------
      log.info('Phase 4: Audio generation');

      const scenes: Scene[] = screenplay.map((s, i) => ({
        id: s.id,
        name: s.heading,
        duration: durationCheck.estimatedSeconds / screenplay.length,
        visualDescription: s.action,
        narrationScript: s.dialogue.map(d => d.text).join(' '),
        emotionalTone: 'dramatic',
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
      // Phase 5: Assembly with chapter markers — Requirement 7.5
      // ----------------------------------------------------------------
      log.info('Phase 5: Assembly with chapter markers');

      const sceneDurations = narrationSegments.map(s => s.audioDuration);
      const totalDuration = sceneDurations.reduce((sum, d) => sum + d, 0);

      const chapters = buildChapterMarkers(screenplay, sceneDurations);
      const chaptersValid = validateChapterSequence(chapters);
      if (!chaptersValid) {
        log.warn('Chapter sequence validation failed — some chapters may overlap');
      }

      const assemblyRules = buildAssemblyRules(FORMAT_ID, {
        totalDuration,
        scenes: screenplay,
        sceneDurations,
      });

      // Checkpoint 4: Final Assembly — Requirement 7.5
      const assemblyApproval = await checkpoints.createCheckpoint('final-assembly', {
        sceneCount: screenplay.length,
        visualCount: visuals.length,
        narrationCount: narrationSegments.length,
        totalDuration,
      });
      if (!assemblyApproval.approved) {
        log.info('Assembly rejected by user');
        checkpoints.dispose();
        return {
          success: false,
          error: 'Assembly rejected by user',
          partialResults: { screenplay, visuals, narrationSegments, chapters },
        };
      }

      state.currentStep = 'production';
      state.updatedAt = Date.now();
      state.checkpoints = checkpoints.getAllCheckpoints();
      storyModeStore.set(sessionId, state);

      checkpoints.dispose();

      log.info(`Documentary pipeline complete: ${screenplay.length} scenes, ${chapters.length} chapters, ${researchResult.citations.length} citations`);

      return {
        success: true,
        partialResults: {
          sessionId,
          screenplay,
          visuals,
          narrationSegments,
          assemblyRules,
          chapters,
          research: researchResult,
          totalDuration,
        },
      };

    } catch (error) {
      checkpoints.dispose();
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Documentary pipeline failed:', msg);
      return { success: false, error: msg };
    }
  }
}
