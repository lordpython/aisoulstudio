/**
 * Format Registry
 * 
 * Centralized registry of all supported video formats with metadata and configuration.
 * Each format defines its pipeline characteristics, constraints, and requirements.
 */

import { FormatMetadata, VideoFormat } from '../types';

/**
 * Format Registry class for managing video format metadata
 */
export class FormatRegistry {
  private formats: Map<VideoFormat, FormatMetadata> = new Map();

  constructor() {
    // Register all 8 formats on initialization
    this.registerAllFormats();
  }

  /**
   * Get format metadata by ID
   * @param id Format identifier
   * @returns Format metadata or null if not found
   */
  getFormat(id: string): FormatMetadata | null {
    return this.formats.get(id as VideoFormat) || null;
  }

  /**
   * Get all registered formats
   * @returns Array of all format metadata
   */
  getAllFormats(): FormatMetadata[] {
    return Array.from(this.formats.values());
  }

  /**
   * Register a new format or update existing
   * @param metadata Format metadata to register
   */
  registerFormat(metadata: FormatMetadata): void {
    this.formats.set(metadata.id, metadata);
  }

  /**
   * Get all active (non-deprecated) formats
   * @returns Array of non-deprecated format metadata
   */
  getActiveFormats(): FormatMetadata[] {
    return Array.from(this.formats.values()).filter(f => !f.deprecated);
  }

  /**
   * Get all deprecated formats
   * @returns Array of deprecated format metadata
   */
  getDeprecatedFormats(): FormatMetadata[] {
    return Array.from(this.formats.values()).filter(f => f.deprecated === true);
  }

  /**
   * Check if a format is deprecated
   * @param id Format identifier
   * @returns True if format exists and is deprecated
   */
  isDeprecated(id: string): boolean {
    const format = this.formats.get(id as VideoFormat);
    return format?.deprecated === true;
  }

  /**
   * Mark a format as deprecated
   * @param id Format identifier
   * @param message Optional deprecation message
   */
  deprecateFormat(id: string, message?: string): void {
    const format = this.formats.get(id as VideoFormat);
    if (format) {
      format.deprecated = true;
      if (message) {
        format.deprecationMessage = message;
      }
    }
  }

  /**
   * Check if a format ID is valid
   * @param id Format identifier to validate
   * @returns True if format exists in registry (including deprecated formats)
   */
  isValidFormat(id: string): boolean {
    return this.formats.has(id as VideoFormat);
  }

  /**
   * Register all default formats
   */
  private registerAllFormats(): void {
    // YouTube Narrator Format
    this.registerFormat({
      id: 'youtube-narrator',
      name: 'YouTube Narrator',
      description: 'Conversational long-form content with B-roll visuals and research-backed narration',
      icon: '🎙️',
      durationRange: { min: 480, max: 1500 }, // 8-25 minutes
      aspectRatio: '16:9',
      applicableGenres: [
        'Educational',
        'Documentary',
        'Commentary',
        'Review',
        'Tutorial',
        'Explainer',
        'History',
        'Science',
        'Technology'
      ],
      checkpointCount: 3,
      concurrencyLimit: 5,
      requiresResearch: true,
      supportedLanguages: ['ar', 'en']
    });

    // Advertisement Format
    this.registerFormat({
      id: 'advertisement',
      name: 'Advertisement',
      description: 'Short, high-impact promotional videos with clear call-to-action',
      icon: '📢',
      durationRange: { min: 15, max: 60 }, // 15-60 seconds
      aspectRatio: '16:9',
      applicableGenres: [
        'Product Launch',
        'Brand Story',
        'Service Promotion',
        'App Demo',
        'Event Announcement',
        'Sale/Offer',
        'Testimonial'
      ],
      checkpointCount: 2,
      concurrencyLimit: 3,
      requiresResearch: false,
      supportedLanguages: ['ar', 'en']
    });

    // Movie/Animation Format (existing pipeline)
    this.registerFormat({
      id: 'movie-animation',
      name: 'Movie/Animation',
      description: 'Cinematic storytelling with character-driven narratives and visual consistency',
      icon: '🎬',
      durationRange: { min: 300, max: 1800 }, // 5-30 minutes
      aspectRatio: '16:9',
      applicableGenres: [
        'Drama',
        'Comedy',
        'Thriller',
        'Horror',
        'Sci-Fi',
        'Fantasy',
        'Romance',
        'Action',
        'Mystery',
        'Adventure'
      ],
      checkpointCount: 4,
      concurrencyLimit: 4,
      requiresResearch: false,
      supportedLanguages: ['ar', 'en']
    });

    // Educational Format
    this.registerFormat({
      id: 'educational',
      name: 'Educational Tutorial',
      description: 'Structured learning content with visual aids, diagrams, and clear explanations',
      icon: '📚',
      durationRange: { min: 300, max: 1200 }, // 5-20 minutes
      aspectRatio: '16:9',
      applicableGenres: [
        'Math',
        'Science',
        'Language',
        'Programming',
        'Business',
        'Art',
        'Music',
        'History',
        'Health',
        'Skills Training'
      ],
      checkpointCount: 3,
      concurrencyLimit: 4,
      requiresResearch: true,
      supportedLanguages: ['ar', 'en']
    });

    // Shorts/Reels Format
    this.registerFormat({
      id: 'shorts',
      name: 'Shorts/Reels',
      description: 'Vertical short-form content optimized for mobile with hook-first engagement',
      icon: '📱',
      durationRange: { min: 15, max: 60 }, // 15-60 seconds
      aspectRatio: '9:16',
      applicableGenres: [
        'Comedy',
        'Life Hack',
        'Quick Tip',
        'Trending',
        'Challenge',
        'Behind the Scenes',
        'Teaser',
        'Reaction'
      ],
      checkpointCount: 2,
      concurrencyLimit: 3,
      requiresResearch: false,
      supportedLanguages: ['ar', 'en']
    });

    // Documentary Format
    this.registerFormat({
      id: 'documentary',
      name: 'Documentary',
      description: 'Deeply researched long-form content with chapter structure and citations',
      icon: '🎥',
      durationRange: { min: 900, max: 3600 }, // 15-60 minutes
      aspectRatio: '16:9',
      applicableGenres: [
        'Investigative',
        'Historical',
        'Nature',
        'Biography',
        'Social Issues',
        'True Crime',
        'Cultural',
        'Scientific'
      ],
      checkpointCount: 4,
      concurrencyLimit: 5,
      requiresResearch: true,
      supportedLanguages: ['ar', 'en']
    });

    // Music Video Format
    this.registerFormat({
      id: 'music-video',
      name: 'Music Video',
      description: 'AI-generated music with beat-synchronized visuals and lyrics',
      icon: '🎵',
      durationRange: { min: 120, max: 480 }, // 2-8 minutes
      aspectRatio: '16:9',
      applicableGenres: [
        'Pop',
        'Rock',
        'Hip Hop',
        'Electronic',
        'Jazz',
        'Classical',
        'R&B',
        'Country',
        'Indie',
        'Ambient'
      ],
      checkpointCount: 3,
      concurrencyLimit: 4,
      requiresResearch: false,
      supportedLanguages: ['ar', 'en']
    });

    // News/Politics Format
    this.registerFormat({
      id: 'news-politics',
      name: 'News/Politics',
      description: 'Factual reporting with balanced perspectives and source citations',
      icon: '📰',
      durationRange: { min: 180, max: 900 }, // 3-15 minutes
      aspectRatio: '16:9',
      applicableGenres: [
        'Breaking News',
        'Political Analysis',
        'Election Coverage',
        'Policy Explainer',
        'International Affairs',
        'Local News',
        'Investigative Journalism'
      ],
      checkpointCount: 3,
      concurrencyLimit: 5,
      requiresResearch: true,
      supportedLanguages: ['ar', 'en']
    });
  }
}

// Export singleton instance
export const formatRegistry = new FormatRegistry();
