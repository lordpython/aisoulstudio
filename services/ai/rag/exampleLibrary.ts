/**
 * Example Library
 * 
 * Stores successful video creations as examples for future recommendations.
 * Uses simple keyword matching for finding similar examples.
 */

export interface VideoExample {
  id: string;
  topic: string;
  style: string;
  duration: number;
  userFeedback?: {
    helpful: boolean;
    rating: number;
    comment?: string;
  };
  timestamp: number;
  success: boolean;
  metadata?: {
    mood?: string;
    targetAudience?: string;
    cameraAngle?: string;
    lightingMood?: string;
  };
}

export class ExampleLibrary {
  private examples: VideoExample[] = [];

  constructor() {
    console.log('[ExampleLibrary] ✅ Initialized');
  }

  /**
   * Add a video creation example to the library.
   */
  async addExample(example: VideoExample): Promise<void> {
    try {
      // Store in examples array
      this.examples.push(example);

      // Keep only last 500 examples (memory management)
      if (this.examples.length > 500) {
        this.examples = this.examples.slice(-500);
      }

      console.log(
        `[ExampleLibrary] ✅ Added example: ${example.style} video about "${example.topic.substring(0, 30)}..."`
      );
    } catch (error) {
      console.error('[ExampleLibrary] Failed to add example:', error);
    }
  }

  /**
   * Find similar examples based on query using keyword matching.
   */
  async findSimilarExamples(
    query: string,
    k: number = 3
  ): Promise<VideoExample[]> {
    try {
      const queryLower = query.toLowerCase();
      const keywords = queryLower.split(/\s+/).filter(w => w.length > 2);

      // Score examples based on keyword matches
      const scored = this.examples
        .filter(ex => ex.success)
        .map(ex => {
          const searchText = this._createSearchText(ex).toLowerCase();
          const score = keywords.reduce((sum, keyword) => {
            return sum + (searchText.includes(keyword) ? 1 : 0);
          }, 0);
          return { example: ex, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return b.example.timestamp - a.example.timestamp;
        });

      const examples = scored.slice(0, k).map(item => item.example);

      if (examples.length > 0) {
        console.log(
          `[ExampleLibrary] ✅ Found ${examples.length} similar examples for query:`,
          query.substring(0, 50) + '...'
        );
      }

      return examples;
    } catch (error) {
      console.error('[ExampleLibrary] Failed to find similar examples:', error);
      return [];
    }
  }

  /**
   * Get successful examples, optionally filtered by style.
   */
  async getSuccessfulExamples(style?: string): Promise<VideoExample[]> {
    let filtered = this.examples.filter((ex) => ex.success);

    if (style) {
      filtered = filtered.filter(
        (ex) => ex.style.toLowerCase() === style.toLowerCase()
      );
    }

    // Sort by rating (if available) and timestamp
    filtered.sort((a, b) => {
      const ratingA = a.userFeedback?.rating || 0;
      const ratingB = b.userFeedback?.rating || 0;

      if (ratingA !== ratingB) {
        return ratingB - ratingA; // Higher rating first
      }

      return b.timestamp - a.timestamp; // More recent first
    });

    return filtered.slice(0, 10); // Return top 10
  }

  /**
   * Get formatted context string for similar examples.
   */
  async getExampleContext(query: string): Promise<string> {
    const examples = await this.findSimilarExamples(query, 3);

    if (examples.length === 0) {
      return '';
    }

    const formattedExamples = examples.map((ex, i) => {
      const rating = ex.userFeedback?.rating
        ? `⭐ ${ex.userFeedback.rating}/5`
        : 'No rating';
      const helpful = ex.userFeedback?.helpful ? '👍 Helpful' : '';

      return `${i + 1}. **${ex.style}** video about "${ex.topic}"
   - Duration: ${ex.duration}s
   - User Feedback: ${rating} ${helpful}
   - Created: ${new Date(ex.timestamp).toLocaleDateString()}`;
    });

    return `## SIMILAR SUCCESSFUL EXAMPLES:

${formattedExamples.join('\n\n')}

These examples show what worked well for similar requests. Consider using similar approaches.`;
  }

  /**
   * Get example count.
   */
  getExampleCount(): number {
    return this.examples.length;
  }

  /**
   * Get success rate across all examples.
   */
  getSuccessRate(): number {
    if (this.examples.length === 0) return 0;

    const successful = this.examples.filter((ex) => ex.success).length;
    return successful / this.examples.length;
  }

  /**
   * Get statistics about examples.
   */
  getStatistics(): {
    total: number;
    successful: number;
    successRate: number;
    byStyle: Record<string, number>;
    averageRating: number;
  } {
    const total = this.examples.length;
    const successful = this.examples.filter((ex) => ex.success).length;
    const successRate = total > 0 ? successful / total : 0;

    // Count by style
    const byStyle: Record<string, number> = {};
    this.examples.forEach((ex) => {
      byStyle[ex.style] = (byStyle[ex.style] || 0) + 1;
    });

    // Calculate average rating
    const ratingsSum = this.examples.reduce((sum, ex) => {
      return sum + (ex.userFeedback?.rating || 0);
    }, 0);
    const ratingsCount = this.examples.filter(
      (ex) => ex.userFeedback?.rating
    ).length;
    const averageRating = ratingsCount > 0 ? ratingsSum / ratingsCount : 0;

    return {
      total,
      successful,
      successRate,
      byStyle,
      averageRating,
    };
  }

  /**
   * Create searchable text from example.
   */
  private _createSearchText(example: VideoExample): string {
    const parts = [
      `Topic: ${example.topic}`,
      `Style: ${example.style}`,
      `Duration: ${example.duration} seconds`,
    ];

    if (example.metadata?.mood) {
      parts.push(`Mood: ${example.metadata.mood}`);
    }

    if (example.metadata?.targetAudience) {
      parts.push(`Audience: ${example.metadata.targetAudience}`);
    }

    if (example.userFeedback?.comment) {
      parts.push(`Feedback: ${example.userFeedback.comment}`);
    }

    return parts.join('\n');
  }
}

// Export singleton instance
export const exampleLibrary = new ExampleLibrary();
