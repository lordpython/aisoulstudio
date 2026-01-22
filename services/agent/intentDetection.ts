/**
 * Intent Detection for Production Agent Tool Selection
 * 
 * Provides functions to detect user intent from natural language input
 * and determine which tools should be executed.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

/**
 * Result of intent detection analysis
 */
export interface IntentDetectionResult {
  /** Whether input contains a YouTube URL */
  hasYouTubeUrl: boolean;
  /** Extracted YouTube URL if present */
  youtubeUrl: string | null;
  /** Whether input contains an audio file path */
  hasAudioFile: boolean;
  /** Extracted audio file path if present */
  audioFilePath: string | null;
  /** Whether user wants animated/motion visuals */
  wantsAnimation: boolean;
  /** Whether user wants background music */
  wantsMusic: boolean;
  /** Detected visual style (or null if not specified) */
  detectedStyle: string | null;
  /** Whether user wants background removal */
  wantsBackgroundRemoval: boolean;
  /** Whether user wants subtitles */
  wantsSubtitles: boolean;
  /** First tool that should be called based on input */
  firstTool: 'import_youtube_content' | 'transcribe_audio_file' | 'plan_video';
  /** List of optional tools to include based on keywords */
  optionalTools: string[];
}

// --- URL Detection Patterns ---

/**
 * Pattern to detect YouTube URLs in user input.
 * Matches:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 * - youtube.com/shorts/VIDEO_ID
 * - youtube.com/embed/VIDEO_ID
 * 
 * Requirement: 5.4
 */
const YOUTUBE_URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&][^\s]*)?/i;

/**
 * Pattern to detect audio file paths in user input.
 * Matches common audio file extensions.
 */
const AUDIO_FILE_PATTERN = /(?:^|\s)([^\s]+\.(?:mp3|wav|m4a|ogg|flac|aac))(?:\s|$)/i;

// --- Keyword Detection Patterns ---

/**
 * Keywords that indicate user wants animated/motion visuals.
 * Note: "video" alone is too generic since all outputs are videos.
 * We look for explicit animation intent.
 * Requirement: 5.2
 */
const ANIMATION_KEYWORDS = [
  'animated',
  'animation',
  'motion',
  'moving',
  'dynamic',
  'animate',
  'movement',
  'kinetic',
  'live action',
  'motion graphics',
  'video clips',  // More specific than just "video"
  'moving images',
  'video loops',
];

/**
 * Pattern to detect animation keywords.
 * Uses word boundaries to avoid false positives.
 */
const ANIMATION_PATTERN = new RegExp(
  `\\b(${ANIMATION_KEYWORDS.join('|')})\\b`,
  'i'
);

/**
 * Keywords that indicate user wants background music.
 * Requirement: 5.3
 */
const MUSIC_KEYWORDS = [
  'music',
  'background music',
  'soundtrack',
  'bgm',
  'score',
  'musical',
  'audio track',
  'backing track',
  'instrumental',
  'melody',
];

/**
 * Pattern to detect music keywords.
 */
const MUSIC_PATTERN = new RegExp(
  `\\b(${MUSIC_KEYWORDS.join('|').replace(/\s+/g, '\\s+')})\\b`,
  'i'
);

/**
 * Supported visual styles with their variations.
 * Requirement: 5.5
 */
const STYLE_KEYWORDS: Record<string, string[]> = {
  'Cinematic': ['cinematic', 'cinema', 'film', 'movie', 'hollywood'],
  'Anime': ['anime', 'manga', 'japanese animation', 'animated japanese'],
  'Watercolor': ['watercolor', 'watercolour', 'water color', 'aquarelle'],
  'Oil Painting': ['oil painting', 'oil paint', 'painted', 'classical painting'],
  'Documentary': ['documentary', 'docu', 'journalistic', 'news style'],
  'Realistic': ['realistic', 'photorealistic', 'real', 'lifelike', 'natural'],
  'Vintage': ['vintage', 'retro', 'old school', 'classic', 'nostalgic'],
  'Modern': ['modern', 'contemporary', 'sleek', 'minimalist'],
  'Fantasy': ['fantasy', 'magical', 'mythical', 'enchanted'],
  'Sci-Fi': ['sci-fi', 'science fiction', 'futuristic', 'cyberpunk', 'space'],
  'Horror': ['horror', 'dark', 'creepy', 'scary', 'gothic'],
  'Noir': ['noir', 'film noir', 'black and white', 'detective'],
};

/**
 * Keywords that indicate user wants background removal.
 */
const BACKGROUND_REMOVAL_KEYWORDS = [
  'remove background',
  'transparent background',
  'no background',
  'cut out',
  'cutout',
  'isolated',
  'green screen',
];

/**
 * Pattern to detect background removal keywords.
 */
const BACKGROUND_REMOVAL_PATTERN = new RegExp(
  `\\b(${BACKGROUND_REMOVAL_KEYWORDS.join('|').replace(/\s+/g, '\\s+')})\\b`,
  'i'
);

/**
 * Keywords that indicate user wants subtitles.
 */
const SUBTITLE_KEYWORDS = [
  'subtitle',
  'subtitles',
  'caption',
  'captions',
  'closed caption',
  'cc',
  'srt',
  'vtt',
  'accessible',
  'accessibility',
];

/**
 * Pattern to detect subtitle keywords.
 */
const SUBTITLE_PATTERN = new RegExp(
  `\\b(${SUBTITLE_KEYWORDS.join('|')})s?\\b`,
  'i'
);

// --- Detection Functions ---

/**
 * Detect if input contains a YouTube URL.
 * 
 * @param input User input string
 * @returns Object with detection result and extracted URL
 * 
 * Requirement: 5.4
 */
export function detectYouTubeUrl(input: string): { hasUrl: boolean; url: string | null } {
  const match = input.match(YOUTUBE_URL_PATTERN);
  if (match) {
    // Reconstruct the full URL
    const videoId = match[1];
    return {
      hasUrl: true,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }
  return { hasUrl: false, url: null };
}

/**
 * Detect if input contains an audio file path.
 * 
 * @param input User input string
 * @returns Object with detection result and extracted path
 */
export function detectAudioFile(input: string): { hasFile: boolean; path: string | null } {
  const match = input.match(AUDIO_FILE_PATTERN);
  if (match) {
    return {
      hasFile: true,
      path: match[1],
    };
  }
  return { hasFile: false, path: null };
}

/**
 * Detect if user wants animated/motion visuals.
 * 
 * @param input User input string
 * @returns true if animation keywords are detected
 * 
 * Requirement: 5.2
 */
export function shouldAnimate(input: string): boolean {
  return ANIMATION_PATTERN.test(input);
}

/**
 * Detect if user wants background music.
 * 
 * @param input User input string
 * @returns true if music keywords are detected
 * 
 * Requirement: 5.3
 */
export function shouldGenerateMusic(input: string): boolean {
  return MUSIC_PATTERN.test(input);
}

/**
 * Extract visual style from user input.
 * 
 * @param input User input string
 * @returns Detected style name or null if not specified
 * 
 * Requirement: 5.5
 */
export function extractStyle(input: string): string | null {
  const normalizedInput = input.toLowerCase();
  
  for (const [styleName, keywords] of Object.entries(STYLE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (normalizedInput.includes(keyword)) {
        return styleName;
      }
    }
  }
  
  return null;
}

/**
 * Detect if user wants background removal.
 * 
 * @param input User input string
 * @returns true if background removal keywords are detected
 */
export function shouldRemoveBackground(input: string): boolean {
  return BACKGROUND_REMOVAL_PATTERN.test(input);
}

/**
 * Detect if user wants subtitles.
 * 
 * @param input User input string
 * @returns true if subtitle keywords are detected
 */
export function shouldGenerateSubtitles(input: string): boolean {
  return SUBTITLE_PATTERN.test(input);
}

/**
 * Analyze user input and determine which tools should be executed.
 * This is the main entry point for intent-based tool selection.
 * 
 * @param input User input string
 * @returns Complete intent detection result
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export function analyzeIntent(input: string): IntentDetectionResult {
  // Detect URLs and file paths
  const youtubeResult = detectYouTubeUrl(input);
  const audioResult = detectAudioFile(input);
  
  // Detect optional features
  const wantsAnimation = shouldAnimate(input);
  const wantsMusic = shouldGenerateMusic(input);
  const detectedStyle = extractStyle(input);
  const wantsBackgroundRemoval = shouldRemoveBackground(input);
  const wantsSubtitles = shouldGenerateSubtitles(input);
  
  // Determine first tool based on input type
  let firstTool: IntentDetectionResult['firstTool'] = 'plan_video';
  if (youtubeResult.hasUrl) {
    firstTool = 'import_youtube_content';
  } else if (audioResult.hasFile) {
    firstTool = 'transcribe_audio_file';
  }
  
  // Build list of optional tools
  const optionalTools: string[] = [];
  if (wantsAnimation) {
    optionalTools.push('animate_image');
  }
  if (wantsMusic) {
    optionalTools.push('generate_music');
  }
  if (wantsBackgroundRemoval) {
    optionalTools.push('remove_background');
  }
  if (wantsSubtitles) {
    optionalTools.push('generate_subtitles');
  }
  
  return {
    hasYouTubeUrl: youtubeResult.hasUrl,
    youtubeUrl: youtubeResult.url,
    hasAudioFile: audioResult.hasFile,
    audioFilePath: audioResult.path,
    wantsAnimation,
    wantsMusic,
    detectedStyle,
    wantsBackgroundRemoval,
    wantsSubtitles,
    firstTool,
    optionalTools,
  };
}

/**
 * Get a list of available visual styles.
 * Useful for suggesting styles when user input is unrecognized.
 * 
 * @returns Array of available style names
 */
export function getAvailableStyles(): string[] {
  return Object.keys(STYLE_KEYWORDS);
}

/**
 * Generate a hint message for the agent based on detected intent.
 * This can be prepended to the system prompt or user message.
 * 
 * @param result Intent detection result
 * @returns Hint message for the agent
 */
export function generateIntentHint(result: IntentDetectionResult): string {
  const hints: string[] = [];
  
  if (result.hasYouTubeUrl) {
    hints.push(`[DETECTED: YouTube URL - Start with import_youtube_content using URL: ${result.youtubeUrl}]`);
  } else if (result.hasAudioFile) {
    hints.push(`[DETECTED: Audio file - Start with transcribe_audio_file using path: ${result.audioFilePath}]`);
  }
  
  if (result.wantsAnimation) {
    hints.push('[DETECTED: Animation requested - Include animate_image for each scene]');
  }
  
  if (result.wantsMusic) {
    hints.push('[DETECTED: Music requested - Include generate_music]');
  }
  
  if (result.detectedStyle) {
    hints.push(`[DETECTED: Style "${result.detectedStyle}" - Use this for generate_visuals]`);
  }
  
  if (result.wantsBackgroundRemoval) {
    hints.push('[DETECTED: Background removal requested - Include remove_background]');
  }
  
  if (result.wantsSubtitles) {
    hints.push('[DETECTED: Subtitles requested - Include generate_subtitles]');
  }
  
  return hints.join('\n');
}
