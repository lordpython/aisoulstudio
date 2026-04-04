/**
 * FallbackProcessor
 *
 * Alternative processing when primary JSON extraction fails.
 * Extracts visual prompts from unstructured text content.
 */

import type {
  BasicStoryboard,
  FallbackMetrics,
  FallbackNotification,
  FallbackNotificationCallback,
  StoryboardScene,
  TextExtractionResult,
  ExtractorLogger,
} from './types';
import { defaultLogger } from './types';

export class FallbackProcessor {
  private metrics: FallbackMetrics;
  private notificationCallbacks: FallbackNotificationCallback[] = [];
  private logger: ExtractorLogger;

  constructor(logger?: ExtractorLogger) {
    this.logger = logger || defaultLogger;
    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): FallbackMetrics {
    return {
      totalFallbackUsages: 0,
      successfulFallbacks: 0,
      failedFallbacks: 0,
      averagePromptsExtracted: 0,
      lastFallbackTimestamp: null,
      fallbackReasons: new Map()
    };
  }

  registerNotificationCallback(callback: FallbackNotificationCallback): void {
    this.notificationCallbacks.push(callback);
  }

  unregisterNotificationCallback(callback: FallbackNotificationCallback): void {
    const index = this.notificationCallbacks.indexOf(callback);
    if (index > -1) {
      this.notificationCallbacks.splice(index, 1);
    }
  }

  private notifyFallbackUsed(notification: FallbackNotification): void {
    for (const callback of this.notificationCallbacks) {
      try {
        callback(notification);
      } catch (error) {
        this.logger.error('Notification callback error', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  extractPromptsFromText(content: string): TextExtractionResult {
    const result: TextExtractionResult = {
      prompts: [],
      emotionalContent: [],
      sceneDescriptions: [],
      confidence: 0
    };

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return result;
    }

    const visualPatterns = [
      /(?:scene|visual|image|picture|shot|frame|view|setting)[\s:]+([^.!?\n]{15,200})/gi,
      /(?:show|display|depict|illustrate|portray|capture|reveal)s?\s+([^.!?\n]{15,200})/gi,
      /(?:^|\.\s+)((?:a|an|the)\s+(?:\w+\s+){1,5}(?:scene|landscape|portrait|view|moment|setting)[^.!?\n]{10,150})/gi,
      /([^.!?\n]*(?:beautiful|stunning|dramatic|serene|vibrant|dark|bright|colorful|moody|atmospheric)[^.!?\n]{15,150})/gi,
    ];

    const emotionalPatterns = [
      /(?:mood|emotion|feeling|atmosphere|tone)[\s:]+([^.!?\n]{5,100})/gi,
      /(?:evokes?|conveys?|expresses?|captures?)\s+(?:a\s+)?(?:sense\s+of\s+)?([^.!?\n]{5,100})/gi,
      /(?:melancholic|hopeful|intense|peaceful|dramatic|serene|joyful|somber|nostalgic|ethereal)[^.!?\n]{0,50}/gi,
    ];

    const extractedPrompts = new Set<string>();
    for (const pattern of visualPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const prompt = (match[1] || match[0]).trim();
        if (prompt.length >= 15 && prompt.length <= 300) {
          extractedPrompts.add(this.cleanPromptText(prompt));
        }
      }
    }

    const extractedEmotions = new Set<string>();
    for (const pattern of emotionalPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const emotion = (match[1] || match[0]).trim();
        if (emotion.length >= 3 && emotion.length <= 100) {
          extractedEmotions.add(emotion.toLowerCase());
        }
      }
    }

    if (extractedPrompts.size === 0) {
      const sentences = this.extractSentences(content);
      for (const sentence of sentences) {
        if (this.looksLikeVisualDescription(sentence)) {
          extractedPrompts.add(this.cleanPromptText(sentence));
        }
      }
    }

    const scenePatterns = [
      /(?:scene\s*\d+|part\s*\d+|section\s*\d+)[\s:]+([^.!?\n]{15,200})/gi,
      /(?:\d+\.\s*)([^.!?\n]{15,200})/gi,
      /(?:intro|verse|chorus|bridge|outro)[\s:]+([^.!?\n]{15,200})/gi,
    ];

    for (const pattern of scenePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const scene = (match[1] || match[0]).trim();
        if (scene.length >= 15) {
          result.sceneDescriptions.push(this.cleanPromptText(scene));
        }
      }
    }

    result.prompts = Array.from(extractedPrompts);
    result.emotionalContent = Array.from(extractedEmotions);
    result.confidence = this.calculateExtractionConfidence(result, content);

    return result;
  }

  private cleanPromptText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
      .trim();
  }

  private extractSentences(content: string): string[] {
    const sentences = content.split(/(?<=[.!?])\s+/);
    return sentences
      .map(s => s.trim())
      .filter(s => s.length >= 15 && s.length <= 300);
  }

  private looksLikeVisualDescription(sentence: string): boolean {
    const visualKeywords = [
      'scene', 'visual', 'image', 'picture', 'view', 'landscape',
      'portrait', 'setting', 'background', 'foreground', 'color',
      'light', 'shadow', 'sky', 'ocean', 'mountain', 'forest',
      'city', 'room', 'person', 'figure', 'silhouette'
    ];

    const visualAdjectives = [
      'beautiful', 'stunning', 'dramatic', 'serene', 'vibrant',
      'dark', 'bright', 'colorful', 'moody', 'atmospheric',
      'ethereal', 'mystical', 'peaceful', 'intense', 'soft'
    ];

    const lowerSentence = sentence.toLowerCase();
    return visualKeywords.some(kw => lowerSentence.includes(kw)) ||
      visualAdjectives.some(adj => lowerSentence.includes(adj));
  }

  private calculateExtractionConfidence(result: TextExtractionResult, originalContent: string): number {
    let confidence = 0;

    if (result.prompts.length > 0) {
      confidence += Math.min(0.3, result.prompts.length * 0.1);
    }
    if (result.emotionalContent.length > 0) {
      confidence += Math.min(0.2, result.emotionalContent.length * 0.05);
    }
    if (result.sceneDescriptions.length > 0) {
      confidence += Math.min(0.2, result.sceneDescriptions.length * 0.05);
    }

    const totalExtractedLength = result.prompts.join(' ').length +
      result.sceneDescriptions.join(' ').length;
    const coverageRatio = totalExtractedLength / originalContent.length;
    confidence += Math.min(0.3, coverageRatio);

    return Math.min(1, Math.max(0, confidence));
  }

  generateBasicStoryboard(content: string, reason: string = 'json_extraction_failed'): BasicStoryboard {
    const startTime = Date.now();
    const extraction = this.extractPromptsFromText(content);

    const storyboard: BasicStoryboard = {
      prompts: [],
      metadata: {
        source: 'fallback',
        extractionMethod: 'text_based',
        confidence: extraction.confidence,
        originalContentLength: content.length,
        processingTimestamp: new Date().toISOString(),
        warnings: []
      }
    };

    const allPrompts = [...extraction.prompts, ...extraction.sceneDescriptions];
    const uniquePrompts = [...new Set(allPrompts)];

    for (let i = 0; i < uniquePrompts.length; i++) {
      const prompt = uniquePrompts[i];
      const scene: StoryboardScene = {
        scene: i + 1,
        prompt,
        source: 'fallback',
        confidence: extraction.confidence
      };

      if (extraction.emotionalContent.length > 0) {
        const moodIndex = i % extraction.emotionalContent.length;
        scene.mood = extraction.emotionalContent[moodIndex];
      }

      storyboard.prompts.push(scene);
    }

    if (storyboard.prompts.length === 0) {
      storyboard.metadata.warnings.push('No visual prompts could be extracted from content');

      const trimmedContent = content.trim();
      if (trimmedContent.length >= 15) {
        const fallbackPrompt = trimmedContent.length > 200
          ? trimmedContent.substring(0, 200) + '...'
          : trimmedContent;

        storyboard.prompts.push({
          scene: 1,
          prompt: fallbackPrompt,
          source: 'fallback',
          confidence: 0.1
        });
        storyboard.metadata.warnings.push('Created minimal scene from raw content');
      }
    }

    this.updateMetrics(storyboard.prompts.length, reason, storyboard.prompts.length > 0);

    this.notifyFallbackUsed({
      type: 'fallback_used',
      message: `Fallback processing was used because: ${reason}. ${storyboard.prompts.length} prompts were extracted.`,
      originalContentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
      extractedPromptCount: storyboard.prompts.length,
      timestamp: new Date().toISOString(),
      reducedFunctionality: this.getReducedFunctionalityList(storyboard)
    });

    this.logger.info('Fallback storyboard generated', {
      promptCount: storyboard.prompts.length,
      confidence: storyboard.metadata.confidence,
      processingTimeMs: Date.now() - startTime,
      reason
    });

    return storyboard;
  }

  private getReducedFunctionalityList(storyboard: BasicStoryboard): string[] {
    const reduced: string[] = [];

    if (storyboard.metadata.confidence < 0.5) {
      reduced.push('Low confidence in extracted prompts - results may not match original intent');
    }
    if (storyboard.prompts.length === 0) {
      reduced.push('No prompts could be extracted - storyboard is empty');
    } else if (storyboard.prompts.length < 3) {
      reduced.push('Limited number of prompts extracted - storyboard may be incomplete');
    }
    if (!storyboard.prompts.some(p => p.mood)) {
      reduced.push('Emotional/mood information could not be extracted');
    }
    if (storyboard.metadata.warnings.length > 0) {
      reduced.push('Processing warnings occurred - review storyboard carefully');
    }

    return reduced;
  }

  private updateMetrics(promptCount: number, reason: string, success: boolean): void {
    this.metrics.totalFallbackUsages++;
    this.metrics.lastFallbackTimestamp = new Date().toISOString();

    if (success) {
      this.metrics.successfulFallbacks++;
      const totalPrompts = this.metrics.averagePromptsExtracted * (this.metrics.successfulFallbacks - 1) + promptCount;
      this.metrics.averagePromptsExtracted = totalPrompts / this.metrics.successfulFallbacks;
    } else {
      this.metrics.failedFallbacks++;
    }

    const currentCount = this.metrics.fallbackReasons.get(reason) || 0;
    this.metrics.fallbackReasons.set(reason, currentCount + 1);
  }

  getMetrics(): FallbackMetrics {
    return {
      ...this.metrics,
      fallbackReasons: new Map(this.metrics.fallbackReasons)
    };
  }

  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
  }

  getMetricsSummary(): {
    totalUsages: number;
    successRate: number;
    averagePrompts: number;
    topReasons: { reason: string; count: number }[];
  } {
    const topReasons = Array.from(this.metrics.fallbackReasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalUsages: this.metrics.totalFallbackUsages,
      successRate: this.metrics.totalFallbackUsages > 0
        ? this.metrics.successfulFallbacks / this.metrics.totalFallbackUsages
        : 0,
      averagePrompts: this.metrics.averagePromptsExtracted,
      topReasons
    };
  }

  processWithFallback(content: string, extractionError: string): BasicStoryboard | null {
    this.logger.info('Starting fallback processing', {
      contentLength: content.length,
      extractionError
    });

    try {
      const storyboard = this.generateBasicStoryboard(content, extractionError);

      if (storyboard.prompts.length === 0) {
        this.logger.warn('Fallback processing produced no prompts');
        return null;
      }

      return storyboard;
    } catch (error) {
      this.logger.error('Fallback processing failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      this.updateMetrics(0, 'fallback_error', false);
      return null;
    }
  }
}
