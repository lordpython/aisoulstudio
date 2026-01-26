export interface WordTiming {
  word: string;
  startTime: number; // seconds
  endTime: number; // seconds
}

export interface SubtitleItem {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  translation?: string;
  words?: WordTiming[]; // Optional for backward-compat with word-level timing
}

/**
 * Asset generation type for each prompt card
 * - image: Generate a still image only
 * - video: Generate a video directly from prompt (Veo)
 * - video_with_image: Generate image first, then animate it (DeAPI style)
 */
export type AssetType = "image" | "video" | "video_with_image";

export interface ImagePrompt {
  id: string;
  text: string;
  mood: string;
  timestamp?: string; // Rough timestamp string (e.g. "00:01:30")
  timestampSeconds?: number; // Parsed seconds for sorting/display
  assetType?: AssetType; // Per-card generation type (defaults to global setting)
}

export interface GeneratedImage {
  promptId: string;
  imageUrl: string;
  type?: "image" | "video";
  /** URL to the generated video file if applicable */
  videoUrl?: string;
  /** Whether this is an animated version of an image */
  isAnimated?: boolean;
  /** Whether the video was generated using Veo 3.1 */
  generatedWithVeo?: boolean;
  /** If video_with_image, stores the base image separately */
  baseImageUrl?: string;
  /** Whether this is a placeholder image due to generation failure */
  isPlaceholder?: boolean;
  /** Cached blob URL for offline/re-export use (prevents expired URL issues) */
  cachedBlobUrl?: string;
}

export enum AppState {
  IDLE = "IDLE",
  CONFIGURING = "CONFIGURING",
  PROCESSING_AUDIO = "PROCESSING_AUDIO",
  TRANSCRIBING = "TRANSCRIBING",
  ANALYZING_LYRICS = "ANALYZING_LYRICS",
  GENERATING_PROMPTS = "GENERATING_PROMPTS",
  READY = "READY",
  ERROR = "ERROR",
  // Multi-agent production pipeline states
  CONTENT_PLANNING = "CONTENT_PLANNING",
  NARRATING = "NARRATING",
  EDITING = "EDITING",
  VALIDATING = "VALIDATING",
}

// --- Multi-Agent Production Types ---

/**
 * Emotional tone for narration voice matching
 */
export type EmotionalTone =
  | "professional"
  | "dramatic"
  | "friendly"
  | "urgent"
  | "calm";

/**
 * Camera shot type for cinematography
 */
export type ShotType =
  | "extreme-close-up"
  | "close-up"
  | "medium"
  | "full"
  | "wide"
  | "extreme-wide";

/**
 * Camera movement type for animations
 */
export type CameraMovement =
  | "static"
  | "zoom-in"
  | "zoom-out"
  | "pan"
  | "tracking"
  | "pull-back";

/**
 * Character definition for visual consistency across scenes
 */
export interface CharacterDefinition {
  name: string;
  appearance: string; // Detailed physical description
  clothing: string; // Specific garments and colors
  distinguishingFeatures?: string; // Scars, tattoos, jewelry, etc.
}

/**
 * Scene structure produced by ContentPlanner
 */
export interface Scene {
  id: string;
  name: string;
  duration: number; // seconds
  visualDescription: string;
  narrationScript: string;
  emotionalTone: EmotionalTone;
  transitionTo?: TransitionType;
  /** AI-suggested ambient sound effect ID */
  ambientSfx?: string;
  /** Cinematography - shot type */
  shotType?: ShotType;
  /** Cinematography - camera movement */
  cameraMovement?: CameraMovement;
  /** Cinematography - lighting description */
  lighting?: string;
}

/**
 * Full content plan from ContentPlanner agent
 */
export interface ContentPlan {
  title: string;
  totalDuration: number; // seconds
  targetAudience: string;
  scenes: Scene[];
  overallTone: string;
  /** Character definitions for visual consistency */
  characters?: CharacterDefinition[];
}

/**
 * Narration output from Narrator agent
 */
export interface NarrationSegment {
  sceneId: string;
  audioBlob: Blob;
  audioDuration: number; // seconds
  transcript: string;
}

/**
 * Validation result from Editor/Critic agent
 */
export interface ValidationResult {
  approved: boolean;
  score: number; // 0-100
  issues: Array<{ scene: string; type: string; message: string }>;
  suggestions: string[];
}

export interface SongData {
  fileName: string;
  audioUrl: string; // Blob URL for playback
  srtContent: string;
  parsedSubtitles: SubtitleItem[];
  prompts: ImagePrompt[];
  generatedImages: GeneratedImage[];
}

/**
 * Transition effects between scenes during video export
 */
export type TransitionType =
  | "none"      // Hard cut
  | "fade"      // Fade through black
  | "dissolve"  // Cross-dissolve (blend)
  | "zoom"      // Zoom into next scene
  | "slide";    // Slide left/right

/**
 * Text reveal direction for wipe animations
 */
export type TextRevealDirection = "ltr" | "rtl" | "center-out" | "center-in";

/**
 * Layout zone definition for zone-based rendering
 * Uses normalized coordinates (0-1) for responsive scaling
 */
export interface LayoutZone {
  name: string;
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  width: number; // normalized 0-1
  height: number; // normalized 0-1
  zIndex: number;
}

/**
 * Layout configuration with zone definitions
 */
export interface LayoutConfig {
  orientation: "landscape" | "portrait";
  zones: {
    background: LayoutZone;
    visualizer: LayoutZone;
    text: LayoutZone;
    translation: LayoutZone;
  };
}

/**
 * Text animation configuration for wipe effects
 */
export interface TextAnimationConfig {
  revealDirection: TextRevealDirection;
  revealDuration: number; // seconds
  wordReveal: boolean; // word-by-word or line-by-line
}

/**
 * Visualizer configuration options
 */
export interface VisualizerConfig {
  enabled: boolean;
  opacity: number; // 0.0-1.0
  maxHeightRatio: number; // 0.0-1.0
  zIndex: number;
  barWidth: number; // pixels
  barGap: number; // pixels
  colorScheme: "cyan-purple" | "rainbow" | "monochrome";
}

// --- SFX Types ---

export type SFXCategory =
  | "ambient"      // Background atmosphere
  | "nature"       // Natural sounds
  | "urban"        // City/industrial sounds
  | "weather"      // Weather effects
  | "transition"   // Scene transition sounds
  | "musical"      // Musical stingers/beds
  | "supernatural" // Eerie/mystical sounds
  | "action";      // Impact/movement sounds

export interface AmbientSFX {
  id: string;
  name: string;
  description: string;
  category: SFXCategory;
  moods: EmotionalTone[];
  keywords: string[];
  /** Duration in seconds (0 = loopable) */
  duration: number;
  /** Volume level 0-1 (relative to narration) */
  suggestedVolume: number;
  /** URL to audio file (if available) */
  audioUrl?: string;
  /** Base64 audio data (if generated) */
  audioData?: string;
}

export interface SceneSFXPlan {
  sceneId: string;
  ambientTrack: AmbientSFX | null;
  transitionIn: AmbientSFX | null;
  transitionOut: AmbientSFX | null;
  accentSounds: AmbientSFX[];
}

export interface VideoSFXPlan {
  scenes: SceneSFXPlan[];
  backgroundMusic: AmbientSFX | null;
  masterVolume: number;
  /** AI-generated music track from Suno API */
  generatedMusic?: {
    trackId: string;
    audioUrl: string;
    duration: number;
    title: string;
  };
}

// --- AI Assistant Types ---

export type ConversationRole = "user" | "assistant" | "system";

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  timestamp: number;
  /** Optional: Intent parsed from user message */
  intent?: ParsedIntent;
  /** Optional: Workflow triggered by this message */
  workflowId?: string;
  /** Optional: Whether this is a clarification request */
  isClarification?: boolean;
  /** Optional: Confidence score of intent parsing (0-1) */
  confidence?: number;
}

export interface ConversationContext {
  /** Thread of messages for context */
  messages: ConversationMessage[];
  /** Current user goal if known */
  currentGoal?: string;
  /** Any extracted entities from conversation */
  entities: ExtractedEntity[];
  /** Number of exchanges in current conversation */
  exchangeCount: number;
  /** Whether context has been established */
  contextEstablished: boolean;
}

export interface ExtractedEntity {
  type: "video_type" | "duration" | "mood" | "topic" | "style" | "language" | "custom";
  value: string;
  confidence: number;
  sourceMessageId: string;
}

export interface ParsedIntent {
  /** Unique intent type identifier */
  intentType: IntentType;
  /** Human-readable description of what user wants */
  description: string;
  /** Extracted parameters for workflow */
  parameters: Record<string, unknown>;
  /** Confidence score (0-1) */
  confidence: number;
  /** Whether clarification is needed */
  needsClarification: boolean;
  /** Questions to ask if clarification needed */
  clarificationQuestions?: string[];
  /** Suggested follow-up intents */
  suggestedIntents?: IntentType[];
}

export type IntentType =
  | "create_video"
  | "edit_video"
  | "generate_music"
  | "transcribe_audio"
  | "translate_content"
  | "export_project"
  | "import_project"
  | "analyze_lyrics"
  | "generate_images"
  | "add_sfx"
  | "set_timeline"
  | "get_help"
  | "show_features"
  | "pricing_info"
  | "technical_support"
  | "general_chat"
  | "clarification_request"
  | "escalate_to_human"
  | "unknown";

export interface WorkflowDefinition<TParams = Record<string, unknown>, TResult = unknown> {
  id: string;
  name: string;
  description: string;
  intentTypes: IntentType[];
  requiredParams: string[];
  optionalParams: string[];
  execute: (params: TParams) => Promise<WorkflowResult<TResult>>;
  estimatedDuration?: string;
  complexity?: "simple" | "moderate" | "complex";
}

export interface WorkflowResult<TData = unknown> {
  success: boolean;
  data?: TData;
  error?: string;
  message?: string;
  nextSteps?: string[];
}

export interface AIAssistantState {
  isOpen: boolean;
  isTyping: boolean;
  conversationContext: ConversationContext;
  currentIntent?: ParsedIntent;
  suggestedWorkflows: WorkflowDefinition[];
  errorState?: AIErrorState;
  showEscalationOption: boolean;
}

export interface AIErrorState {
  hasError: boolean;
  errorType: "parsing_error" | "workflow_error" | "context_error" | "network_error";
  message: string;
  canRetry: boolean;
  fallbackMessage: string;
}

export interface SuggestionChip {
  id: string;
  text: string;
  icon?: string;
  intentType: IntentType;
  params?: Record<string, unknown>;
}

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  intentType: IntentType;
  shortcut?: string;
}

// --- Story Mode Types ---

/**
 * Character profile for visual consistency across story scenes
 */
export interface CharacterProfile {
  id: string;
  name: string;
  role: string;
  visualDescription: string; // The "Golden Prompt" for consistency
  referenceImageUrl?: string; // Generated "Sheet" for the character
}

/**
 * Screenplay scene in standard format
 */
export interface ScreenplayScene {
  id: string;
  sceneNumber: number;
  heading: string; // INT. BEDROOM - DAY
  action: string;
  dialogue: Array<{ speaker: string; text: string }>;
  charactersPresent: string[];
}

/**
 * Shotlist entry for storyboard generation
 */
export interface ShotlistEntry {
  id: string;
  sceneId: string;
  shotNumber: number;
  description: string;
  cameraAngle: string; // "Wide", "Close-up"
  movement: string; // "Pan", "Static"
  imageUrl?: string; // The final generated image
}

/**
 * Story Mode workflow step
 */
export type StoryStep = 'idea' | 'breakdown' | 'script' | 'characters' | 'storyboard';

/**
 * Result of a character consistency check
 */
export interface ConsistencyReport {
  score: number;
  isConsistent: boolean;
  issues: string[];
  suggestions: string[];
  details: string;
}

/**
 * Story Mode complete state
 */
export interface StoryState {
  currentStep: StoryStep;
  breakdown: ScreenplayScene[];
  script: { title: string; scenes: ScreenplayScene[] } | null;
  characters: CharacterProfile[];
  shotlist: ShotlistEntry[];
  consistencyReports?: Record<string, ConsistencyReport>; // characterId -> report
}
