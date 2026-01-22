/**
 * Video Production Knowledge Base
 * 
 * RAG (Retrieval-Augmented Generation) implementation for video production knowledge.
 * Provides keyword-based search over style guides and best practices.
 */

import { STYLE_GUIDES } from "./documents/styleGuides";
import { BEST_PRACTICES } from "./documents/bestPractices";
import { AI_CONFIG } from "../config";

interface KnowledgeDocument {
  content: string;
  metadata: {
    type: string;
    style?: string;
    category?: string;
    title: string;
    keywords: string[];
  };
}

export class VideoProductionKnowledgeBase {
  private documents: KnowledgeDocument[] = [];
  private initialized = false;

  constructor() {
    this._initializeDocuments();
  }

  private _initializeDocuments(): void {
    try {
      console.log('[KnowledgeBase] Initializing...');
      const startTime = Date.now();

      // Add style guides
      for (const [key, guide] of Object.entries(STYLE_GUIDES)) {
        this.documents.push({
          content: guide.content,
          metadata: {
            type: 'style-guide',
            style: key,
            title: guide.title,
            keywords: guide.keywords,
          },
        });
      }

      // Add best practices
      for (const [key, practice] of Object.entries(BEST_PRACTICES)) {
        this.documents.push({
          content: practice.content,
          metadata: {
            type: 'best-practice',
            category: key,
            title: practice.title,
            keywords: practice.keywords,
          },
        });
      }

      this.initialized = true;
      const duration = Date.now() - startTime;
      console.log(
        `[KnowledgeBase] ✅ Initialized with ${this.documents.length} documents in ${duration}ms`
      );
    } catch (error) {
      console.error('[KnowledgeBase] ❌ Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get relevant knowledge for a query using keyword matching.
   * Returns formatted string ready for prompt injection.
   */
  async getRelevantKnowledge(query: string, k: number = AI_CONFIG.rag.maxDocuments): Promise<string> {
    // Check if RAG is enabled
    if (!AI_CONFIG.rag.enabled) {
      return '';
    }

    try {
      if (!this.initialized) {
        console.warn('[KnowledgeBase] Not initialized');
        return '';
      }

      const queryLower = query.toLowerCase();
      const keywords = queryLower.split(/\s+/).filter(w => w.length > 2);

      // Score documents based on keyword matches
      const scored = this.documents.map(doc => {
        const contentLower = doc.content.toLowerCase();
        const titleLower = doc.metadata.title.toLowerCase();
        const keywordsLower = doc.metadata.keywords.map(k => k.toLowerCase());

        let score = 0;
        keywords.forEach(keyword => {
          if (titleLower.includes(keyword)) score += 3;
          if (keywordsLower.some(k => k.includes(keyword))) score += 2;
          if (contentLower.includes(keyword)) score += 1;
        });

        return { doc, score };
      });

      const results = scored
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map(item => item.doc);

      if (results.length === 0) {
        console.log('[KnowledgeBase] No relevant knowledge found for query:', query);
        return '';
      }

      // Format results for prompt injection
      const formattedKnowledge = this._formatResults(results);
      
      console.log(
        `[KnowledgeBase] ✅ Retrieved ${results.length} documents for query:`,
        query.substring(0, 50) + '...'
      );

      return formattedKnowledge;
    } catch (error) {
      console.error('[KnowledgeBase] Failed to retrieve knowledge:', error);
      return ''; // Graceful degradation - return empty string
    }
  }

  /**
   * Search for knowledge about a specific video style.
   */
  async searchByStyle(style: string): Promise<string> {
    const query = `${style} style video production characteristics and best practices`;
    return await this.getRelevantKnowledge(query);
  }

  /**
   * Search for knowledge about a specific topic.
   */
  async searchByTopic(topic: string): Promise<string> {
    const query = `best practices for ${topic} in video production`;
    return await this.getRelevantKnowledge(query);
  }

  /**
   * Format search results for prompt injection.
   */
  private _formatResults(results: KnowledgeDocument[]): string {
    const sections = results.map((doc, i) => {
      const title = doc.metadata.title || 'Relevant Knowledge';
      const type = doc.metadata.type || 'unknown';
      
      return `### ${i + 1}. ${title} (${type})
${doc.content}`;
    });

    return `## RELEVANT KNOWLEDGE FROM VIDEO PRODUCTION GUIDES:

${sections.join('\n\n---\n\n')}

Use this knowledge to inform your recommendations, but adapt it to the user's specific needs.`;
  }

  /**
   * Get initialization status.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get document count.
   */
  getDocumentCount(): number {
    const styleCount = Object.keys(STYLE_GUIDES).length;
    const practiceCount = Object.keys(BEST_PRACTICES).length;
    return styleCount + practiceCount;
  }
}

// Export singleton instance
export const knowledgeBase = new VideoProductionKnowledgeBase();
