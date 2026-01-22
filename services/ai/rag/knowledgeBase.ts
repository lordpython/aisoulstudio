/**
 * Video Production Knowledge Base
 * 
 * RAG (Retrieval-Augmented Generation) implementation for video production knowledge.
 * Provides keyword-based search over style guides and best practices.
 * Supports Arabic query translation for multilingual search.
 */

import { STYLE_GUIDES } from "./documents/styleGuides";
import { BEST_PRACTICES } from "./documents/bestPractices";
import { AI_CONFIG } from "../config";
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini for translations
const GEMINI_API_KEY = typeof process !== 'undefined'
  ? (process.env?.VITE_GEMINI_API_KEY || process.env?.GEMINI_API_KEY || '')
  : '';

/**
 * Detect if text contains significant Arabic characters.
 * Returns true if >30% of alphabetic characters are Arabic.
 */
function isArabicText(text: string): boolean {
  let arabicCount = 0;
  let latinCount = 0;

  for (const char of text) {
    const code = char.charCodeAt(0);
    // Arabic Unicode range: U+0600 to U+06FF
    if (code >= 0x0600 && code <= 0x06FF) {
      arabicCount++;
    }
    // Latin letters
    else if ((code >= 0x0041 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x024F)) {
      latinCount++;
    }
  }

  const totalAlpha = arabicCount + latinCount;
  return totalAlpha > 0 && (arabicCount / totalAlpha) > 0.3;
}

/**
 * Translate Arabic query to English keywords for RAG search.
 * Uses Gemini API for fast, lightweight translation.
 */
async function translateQueryToEnglish(query: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    console.warn('[KnowledgeBase] No Gemini API key for translation, using original query');
    return query;
  }

  try {
    const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const prompt = `Translate this Arabic text to English keywords for video production search. Return ONLY the English keywords, no explanation:

"${query}"`;

    const response = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    const translation = response.text?.trim() || query;

    console.log(`[KnowledgeBase] Translated Arabic query: "${query.substring(0, 30)}..." → "${translation.substring(0, 50)}..."`);
    return translation;
  } catch (error) {
    console.warn('[KnowledgeBase] Translation failed, using original query:', error);
    return query;
  }
}

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

      // Translate Arabic queries to English for keyword matching
      let searchQuery = query;
      if (isArabicText(query)) {
        console.log('[KnowledgeBase] Arabic query detected, translating...');
        searchQuery = await translateQueryToEnglish(query);
      }

      const queryLower = searchQuery.toLowerCase();
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
