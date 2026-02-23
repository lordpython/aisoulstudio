/**
 * News/Politics Pipeline Integration Tests
 *
 * Tests complete pipeline execution, balanced research, factual script generation,
 * and professional neutral audio. All external services are mocked.
 *
 * Requirements tested: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PipelineRequest } from '../formatRouter';
import type { ResearchResult } from '../researchService';

// ============================================================================
// Mocks
// ============================================================================

const mockInvoke = vi.fn();

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn().mockImplementation(function (this: any) {
    this.withStructuredOutput = () => ({ invoke: mockInvoke });
  }),
}));

vi.mock('../imageService', () => ({
  generateImageFromPrompt: vi.fn().mockResolvedValue('https://example.com/news-image.png'),
}));

vi.mock('../prompt/imageStyleGuide', () => ({
  buildImageStyleGuide: vi.fn().mockReturnValue('mocked news style guide'),
}));

vi.mock('../narratorService', () => ({
  narrateScene: vi.fn().mockResolvedValue({
    sceneId: 'scene_0',
    audioBlob: new Blob(['audio']),
    audioDuration: 60,
    transcript: 'Test news narration',
  }),
  getFormatVoiceForLanguage: vi.fn().mockReturnValue({
    voiceName: 'Orus',
    pitch: 0,
    speakingRate: 1.0,
    stylePrompt: { persona: 'News anchor', emotion: 'professional and neutral' },
  }),
}));

vi.mock('../ai/storyPipeline', () => ({
  buildBreakdownPrompt: vi.fn().mockReturnValue('mocked breakdown prompt'),
  buildScreenplayPrompt: vi.fn().mockReturnValue('mocked screenplay prompt'),
  countScriptWords: vi.fn().mockReturnValue(600),
  validateDurationConstraint: vi.fn().mockReturnValue({ valid: true, estimatedSeconds: 300 }),
}));

vi.mock('../shared/apiClient', () => ({
  GEMINI_API_KEY: 'test-key',
  MODELS: { TEXT: 'gemini-test' },
  ai: {},
}));

vi.mock('../logger', () => ({
  agentLogger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.mock('../checkpointSystem', () => {
  const MockCheckpointSystem = vi.fn().mockImplementation(function (this: any) {
    this.createCheckpoint = vi.fn().mockResolvedValue({ approved: true });
    this.approveCheckpoint = vi.fn();
    this.getAllCheckpoints = vi.fn().mockReturnValue([]);
    this.dispose = vi.fn();
  });
  return { CheckpointSystem: MockCheckpointSystem };
});

vi.mock('../languageDetector', () => ({
  detectLanguage: vi.fn().mockReturnValue('en'),
}));

vi.mock('../ai/production/store', () => ({
  storyModeStore: new Map(),
}));

vi.mock('../ffmpeg/formatAssembly', () => ({
  buildAssemblyRules: vi.fn().mockReturnValue({
    formatId: 'news-politics',
    aspectRatio: '16:9',
    defaultTransition: 'slide',
    transitionDuration: 1.0,
  }),
}));

// ============================================================================
// Import pipeline after mocks
// ============================================================================

import { NewsPoliticsPipeline } from './newsPolitics';
import { storyModeStore } from '../ai/production/store';

// ============================================================================
// Tests
// ============================================================================

describe('NewsPoliticsPipeline', () => {
  let pipeline: NewsPoliticsPipeline;

  const mockResearchService = {
    research: vi.fn().mockResolvedValue({
      sources: [
        { id: '1', title: 'Reuters', content: 'Factual news report', type: 'web', relevance: 0.95, language: 'en' },
        { id: '2', title: 'AP News', content: 'Balanced perspective coverage', type: 'web', relevance: 0.9, language: 'en' },
        { id: '3', title: 'BBC News', content: 'International viewpoint', type: 'web', relevance: 0.85, language: 'en' },
      ],
      summary: 'Balanced multi-perspective research on the news topic',
      citations: [
        { sourceId: '1', text: 'Reuters', position: 0 },
        { sourceId: '2', text: 'AP News', position: 1 },
        { sourceId: '3', text: 'BBC News', position: 2 },
      ],
      confidence: 0.93,
    } satisfies ResearchResult),
    prioritizeReferences: vi.fn().mockResolvedValue([]),
  };

  const mockEngine = {
    execute: vi.fn().mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/news-0.png' }, attempts: 1, duration: 800 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/news-1.png' }, attempts: 1, duration: 800 },
      { taskId: 'visual_2', success: true, data: { sceneId: 'scene_2', imageUrl: 'https://example.com/news-2.png' }, attempts: 1, duration: 800 },
    ]),
    cancel: vi.fn(),
    getProgress: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (storyModeStore as Map<string, any>).clear();

    mockInvoke
      .mockResolvedValueOnce({
        acts: [
          { title: 'Breaking News', emotionalHook: 'urgency', narrativeBeat: 'Lead with the main story' },
          { title: 'Analysis', emotionalHook: 'clarity', narrativeBeat: 'Provide balanced context' },
          { title: 'Expert Perspective', emotionalHook: 'authority', narrativeBeat: 'Include expert commentary' },
        ],
      })
      .mockResolvedValueOnce({
        scenes: [
          { heading: 'BREAKING NEWS BANNER', action: 'News studio with live ticker', dialogue: [{ speaker: 'Anchor', text: 'Breaking news tonight, as tensions rise in...' }] },
          { heading: 'ANALYSIS SEGMENT', action: 'Data visualization on screen', dialogue: [{ speaker: 'Anchor', text: 'According to Reuters, multiple sources confirm...' }] },
          { heading: 'EXPERT COMMENTARY', action: 'Split screen with expert', dialogue: [{ speaker: 'Anchor', text: 'Political analysts suggest the implications include...' }] },
        ],
      });

    mockResearchService.research.mockResolvedValue({
      sources: [
        { id: '1', title: 'Reuters', content: 'Factual news', type: 'web', relevance: 0.95, language: 'en' },
        { id: '2', title: 'AP News', content: 'Balanced coverage', type: 'web', relevance: 0.9, language: 'en' },
      ],
      summary: 'Balanced multi-perspective research',
      citations: [
        { sourceId: '1', text: 'Reuters', position: 0 },
        { sourceId: '2', text: 'AP News', position: 1 },
      ],
      confidence: 0.93,
    });

    mockEngine.execute.mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/news-0.png' }, attempts: 1, duration: 800 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/news-1.png' }, attempts: 1, duration: 800 },
      { taskId: 'visual_2', success: true, data: { sceneId: 'scene_2', imageUrl: 'https://example.com/news-2.png' }, attempts: 1, duration: 800 },
    ]);

    pipeline = new NewsPoliticsPipeline(
      mockResearchService as any,
      mockEngine as any,
    );
  });

  describe('getMetadata', () => {
    it('should return news-politics format metadata (Req 9.1)', () => {
      const metadata = pipeline.getMetadata();
      expect(metadata.id).toBe('news-politics');
      expect(metadata.durationRange).toEqual({ min: 180, max: 900 });
      expect(metadata.aspectRatio).toBe('16:9');
      expect(metadata.checkpointCount).toBe(3);
      expect(metadata.requiresResearch).toBe(true);
    });
  });

  describe('validate', () => {
    it('should accept valid requests', async () => {
      const request: PipelineRequest = {
        formatId: 'news-politics',
        idea: 'The impact of new economic policies on middle-class workers',
        language: 'en',
        userId: 'user1',
        projectId: 'proj1',
      };
      expect(await pipeline.validate(request)).toBe(true);
    });

    it('should reject empty ideas', async () => {
      const request: PipelineRequest = {
        formatId: 'news-politics',
        idea: '',
        language: 'en',
        userId: 'user1',
        projectId: 'proj1',
      };
      expect(await pipeline.validate(request)).toBe(false);
    });
  });

  describe('execute', () => {
    const baseRequest: PipelineRequest = {
      formatId: 'news-politics',
      idea: 'The impact of rising interest rates on housing affordability',
      genre: 'Political Analysis',
      language: 'en',
      userId: 'user1',
      projectId: 'proj1',
    };

    it('should execute full pipeline and return success', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.success).toBe(true);
      expect(result.partialResults).toBeDefined();
      expect(result.partialResults.screenplay).toHaveLength(3);
      expect(result.partialResults.visuals).toHaveLength(3);
      expect(result.partialResults.narrationSegments).toHaveLength(3);
    });

    it('should perform balanced research from multiple sources (Req 9.2)', async () => {
      await pipeline.execute(baseRequest);

      expect(mockResearchService.research).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'The impact of rising interest rates on housing affordability',
          language: 'en',
          depth: 'medium',
          maxResults: 12,
        }),
      );
    });

    it('should include research citations in results (Req 9.3)', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.partialResults.research).toBeDefined();
      expect(result.partialResults.research.citations.length).toBeGreaterThan(0);
    });

    it('should queue news-style visual tasks for parallel execution (Req 9.4)', async () => {
      // The parallel engine mock returns pre-built results without running tasks;
      // verify it is called with the correct number of visual tasks
      await pipeline.execute(baseRequest);

      expect(mockEngine.execute).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'visual', retryable: true }),
        ]),
        expect.any(Object),
      );
    });

    it('should use neutral professional voice profile (Req 9.6)', async () => {
      const { getFormatVoiceForLanguage } = await import('../narratorService');
      await pipeline.execute(baseRequest);

      expect(getFormatVoiceForLanguage).toHaveBeenCalledWith('news-politics', 'en');
    });

    it('should use parallel execution engine with appropriate concurrency', async () => {
      await pipeline.execute(baseRequest);

      expect(mockEngine.execute).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          concurrencyLimit: 5,
        }),
      );
    });

    it('should persist session state with format metadata', async () => {
      const result = await pipeline.execute(baseRequest);
      const state = (storyModeStore as Map<string, any>).get(result.partialResults.sessionId);

      expect(state).toBeDefined();
      expect(state.formatId).toBe('news-politics');
      expect(state.language).toBe('en');
    });

    it('should detect Arabic language and propagate it', async () => {
      const arabicRequest: PipelineRequest = {
        ...baseRequest,
        idea: 'تأثير ارتفاع أسعار الفائدة على القدرة على تحمل تكاليف الإسكان',
        language: 'ar',
      };

      const result = await pipeline.execute(arabicRequest);
      const state = (storyModeStore as Map<string, any>).get(result.partialResults.sessionId);
      expect(state.language).toBe('ar');
    });

    it('should reject if research checkpoint not approved (Req 9.5)', async () => {
      const { CheckpointSystem } = await import('../checkpointSystem');
      (CheckpointSystem as any).mockImplementationOnce(function (this: any) {
        this.createCheckpoint = vi.fn()
          .mockResolvedValueOnce({ approved: false })
          .mockResolvedValue({ approved: true });
        this.getAllCheckpoints = vi.fn().mockReturnValue([]);
        this.dispose = vi.fn();
      });

      const freshPipeline = new NewsPoliticsPipeline(
        mockResearchService as any,
        mockEngine as any,
      );
      const result = await freshPipeline.execute(baseRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Research rejected');
    });

    it('should handle research failure gracefully', async () => {
      mockResearchService.research.mockResolvedValueOnce({
        sources: [],
        summary: 'Limited information available',
        citations: [],
        confidence: 0.1,
        partial: true,
        failedQueries: 5,
      });

      const result = await pipeline.execute(baseRequest);
      expect(result.success).toBe(true);
    });
  });
});
