/**
 * NLP Intent Parser Service
 * 
 * Parses natural language input to identify:
 * - User intent (what they want to do)
 * - Entities (specific details extracted)
 * - Sentiment and urgency
 * - Whether clarification is needed
 */

import type { ConversationContext } from '@/stores/appStore';

// Supported intents
export type IntentType =
  | 'greeting'
  | 'create_video'
  | 'generate_music'
  | 'edit_content'
  | 'export_video'
  | 'get_help'
  | 'ask_question'
  | 'feedback'
  | 'escalate_human'
  | 'ambiguous'
  | 'unknown';

// Entity types
export interface ExtractedEntity {
  type: string;
  value: string;
  confidence: number;
}

// Intent result
export interface IntentResult {
  intent: IntentType;
  confidence: number; // 0-1
  entities: ExtractedEntity[];
  requiresClarification: boolean;
  clarificationQuestions?: string[];
  suggestedWorkflows: string[];
  response?: string;
}

// Keyword patterns for intent detection
const INTENT_PATTERNS: Record<IntentType, RegExp[]> = {
  greeting: [
    /^(hi|hello|hey|good morning|good afternoon|good evening|howdy)/i,
    /^(what's up|whats up|sup)/i,
  ],
  create_video: [
    /create\s+(a\s+)?video/i,
    /make\s+(a\s+)?video/i,
    /generate\s+(a\s+)?video/i,
    /produce\s+(a\s+)?video/i,
    /i\s+want\s+(to\s+)?(make|create|generate)/i,
    /video\s+about/i,
    /video\s+for/i,
    /turn\s+(this|my)\s+(audio|music|song)/i,
  ],
  generate_music: [
    /create\s+(a\s+)?(song|music|track|beat|soundtrack)/i,
    /generate\s+(a\s+)?(song|music|track|beat)/i,
    /make\s+(a\s+)?(song|music|track|beat)/i,
    /compose\s+(a\s+)?(song|music)/i,
    /original\s+(music|song|track)/i,
  ],
  edit_content: [
    /edit\s+(my|this|the)/i,
    /modify\s+(my|this|the)/i,
    /change\s+(the|my)/i,
    /adjust\s+(the|my)/i,
    /refine\s+(my|this)/i,
    /enhance\s+(my|this)/i,
    /improve\s+(my|this)/i,
  ],
  export_video: [
    /export\s+(my|this|the)/i,
    /download\s+(my|this|the)/i,
    /save\s+(my|this|the)/i,
    /render\s+(my|this|the)/i,
    /output\s+(my|this|the)/i,
  ],
  get_help: [
    /help\s+(me|with)/i,
    /how\s+(to|do)/i,
    /can\s+you\s+(help|do)/i,
    /what\s+(can|does)/i,
    /explain\s+(me|how)/i,
    /guide\s+(me|through)/i,
  ],
  ask_question: [
    /\?$/,
    /what\s+is/i,
    /how\s+does/i,
    /why\s+(does|is)/i,
    /when\s+(can|do)/i,
    /where\s+(can|do)/i,
    /who\s+(can|does)/i,
  ],
  feedback: [
    /feedback/i,
    /suggestion/i,
    /recommend/i,
    /improve/i,
    /better\s+(way|option)/i,
  ],
  escalate_human: [
    /talk\s+(to|a)\s+human/i,
    /speak\s+(to|a)\s+(real\s+)?(person|agent|support)/i,
    /customer\s+support/i,
    /human\s+assistance/i,
    /get\s+(real\s+)?(person|human)/i,
  ],
  ambiguous: [],
  unknown: [],
};

// Entity patterns
const ENTITY_PATTERNS: Record<string, RegExp[]> = {
  topic: [
    /(?:about|for|on|regarding)\s+([^.,!?]+)/i,
    /(?:subject|topic|theme)[:\s]+([^.,!?]+)/i,
  ],
  duration: [
    /(\d+)\s*(second|minute|hour)s?/i,
    /(short|medium|long)\s*(?:video|duration)?/i,
  ],
  aspectRatio: [
    /(16:9|9:16|1:1|4:3)/,
    /(landscape|portrait|square)/i,
  ],
  style: [
    /(cinematic|anime|watercolor|film noir|documentary|modern|vintage)/i,
    /(realistic|stylized|abstract)/i,
  ],
  mood: [
    /(happy|sad|energetic|calm|mysterious|dramatic|romantic|triumphant)/i,
  ],
  audioUrl: [
    /(?:youtube\.com|youtu\.be|mp3|wav|audio)[:\s]+([^\s]+)/i,
  ],
  fileReference: [
    /(?:this|my|the)\s+(file|audio|video|image)s?/i,
  ],
};

// Contextual modifiers that affect intent confidence
const MODIFIER_PATTERNS: Array<{ pattern: RegExp; modifier: number }> = [
  { pattern: /please/i, modifier: 0.1 },
  { pattern: /i\s+want/i, modifier: 0.15 },
  { pattern: /i\s+need/i, modifier: 0.15 },
  { pattern: /could\s+you/i, modifier: -0.05 },
  { pattern: /maybe/i, modifier: -0.1 },
  { pattern: /not\s+sure/i, modifier: -0.15 },
];

/**
 * Parse natural language input into structured intent
 */
export function parseIntent(
  input: string,
  context?: ConversationContext
): IntentResult {
  const normalizedInput = input.trim().toLowerCase();
  let bestIntent: IntentType = 'unknown';
  let bestConfidence = 0;
  const allEntities: ExtractedEntity[] = [];

  // Check each intent pattern
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intent === 'ambiguous' || intent === 'unknown') continue;
    
    for (const pattern of patterns) {
      if (pattern.test(normalizedInput)) {
        const baseConfidence = 0.7; // Base confidence for pattern match
        const confidence = Math.min(1, baseConfidence + calculateModifier(input));
        
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestIntent = intent as IntentType;
        }
        break;
      }
    }
  }

  // Extract entities
  for (const [entityType, patterns] of Object.entries(ENTITY_PATTERNS)) {
    for (const pattern of patterns) {
      const match = normalizedInput.match(pattern);
      if (match) {
        allEntities.push({
          type: entityType,
          value: match[1] || match[0],
          confidence: 0.8,
        });
      }
    }
  }

  // Apply context from previous conversation
  if (context && context.lastIntent && bestConfidence < 0.8) {
    // If context suggests a direction, increase confidence slightly
    if (relatedToContext(normalizedInput, context.lastIntent)) {
      bestConfidence += 0.1;
    }
  }

  // Determine if clarification is needed
  const { requiresClarification, clarificationQuestions } = checkClarification(
    bestIntent,
    allEntities,
    context
  );

  // Generate suggested workflows
  const suggestedWorkflows = getSuggestedWorkflows(bestIntent, allEntities);

  // Generate response for certain intents
  let response: string | undefined;
  if (bestIntent === 'greeting') {
    response = generateGreetingResponse(context);
  }

  return {
    intent: bestIntent,
    confidence: Math.min(1, bestConfidence),
    entities: allEntities,
    requiresClarification,
    clarificationQuestions: requiresClarification ? clarificationQuestions : undefined,
    suggestedWorkflows,
    response,
  };
}

/**
 * Calculate confidence modifier based on input characteristics
 */
function calculateModifier(input: string): number {
  let modifier = 0;
  
  for (const { pattern, modifier: mod } of MODIFIER_PATTERNS) {
    if (pattern.test(input)) {
      modifier += mod;
    }
  }

  // Length factor - very short or very long inputs are less certain
  const wordCount = input.split(/\s+/).length;
  if (wordCount < 3) modifier -= 0.1;
  if (wordCount > 50) modifier -= 0.05;

  return modifier;
}

/**
 * Check if clarification is needed based on intent and entities
 */
function checkClarification(
  intent: IntentType,
  entities: ExtractedEntity[],
  context?: ConversationContext
): { requiresClarification: boolean; clarificationQuestions: string[] } {
  const questions: string[] = [];

  switch (intent) {
    case 'create_video':
      if (!entities.find(e => e.type === 'topic')) {
        questions.push("What would you like your video to be about?");
      }
      if (!entities.find(e => e.type === 'duration')) {
        questions.push("How long should the video be?");
      }
      if (!entities.find(e => e.type === 'style')) {
        questions.push("What visual style appeals to you (cinematic, anime, etc.)?");
      }
      break;

    case 'generate_music':
      if (!entities.find(e => e.type === 'mood')) {
        questions.push("What mood or feeling should the music have?");
      }
      if (!entities.find(e => e.type === 'duration')) {
        questions.push("How long should the track be?");
      }
      break;

    case 'edit_content':
      if (!entities.find(e => e.type === 'fileReference')) {
        questions.push("Which file would you like to edit?");
      }
      questions.push("What specific changes would you like to make?");
      break;

    case 'ask_question':
      // Questions are valid as-is
      break;

    case 'escalate_human':
      // No clarification needed
      break;

    default:
      questions.push("Could you tell me more about what you're trying to do?");
  }

  return {
    requiresClarification: questions.length > 0,
    clarificationQuestions: questions,
  };
}

/**
 * Get suggested workflows based on intent
 */
function getSuggestedWorkflows(
  intent: IntentType,
  entities: ExtractedEntity[]
): string[] {
  const workflowMap: Record<IntentType, string[]> = {
    greeting: ['show_capabilities'],
    create_video: ['runProductionPipeline', 'generateVisuals', 'generateNarration'],
    generate_music: ['generateMusicTrack', 'musicProducerAgent'],
    edit_content: ['editScene', 'adjustTimeline', 'modifyVisuals'],
    export_video: ['exportVideo', 'renderFinal'],
    get_help: ['showDocumentation', 'explainWorkflow'],
    ask_question: ['answerQuestion', 'showDocumentation'],
    feedback: ['collectFeedback', 'suggestImprovements'],
    escalate_human: ['transferToHuman', 'createSupportTicket'],
    ambiguous: ['clarifyIntent'],
    unknown: ['fallbackResponse'],
  };

  return workflowMap[intent] || ['fallbackResponse'];
}

/**
 * Check if input is related to previous context
 */
function relatedToContext(input: string, lastIntent: string): boolean {
  const relatedPatterns: Record<string, RegExp[]> = {
    create_video: [/yes/i, /that/i, /video/i, /go/i, /do\s+it/i],
    generate_music: [/music/i, /song/i, /track/i, /beat/i, /yes/i],
    ask_question: [/yes/i, /that/i, /explain/i, /more/i],
  };

  const patterns = relatedPatterns[lastIntent];
  if (!patterns) return false;

  return patterns.some(pattern => pattern.test(input));
}

/**
 * Generate contextual greeting response
 */
function generateGreetingResponse(context?: ConversationContext): string {
  const greetings = [
    "Hello! I'm ready to help you create something amazing. What would you like to work on today?",
    "Hi there! I can help you with video creation, music generation, and more. What's on your mind?",
    "Hey! Let's create something together. What would you like to make?",
  ];

  const base = greetings[Math.floor(Math.random() * greetings.length)] || "Hello! How can I help you today?";

  // Add contextual suggestion if we have previous context
  if (context && context.userGoals.length > 0) {
    const lastGoal = context.userGoals[context.userGoals.length - 1];
    return `${base} I remember you were interested in ${lastGoal}. Would you like to continue with that?`;
  }

  return base;
}

/**
 * Detect if input is a clarification response
 */
export function isClarificationResponse(
  input: string,
  expectedEntity: string
): boolean {
  const positivePatterns = [/yes/i, /sure/i, /correct/i, /right/i, /that's?/i];
  const negativePatterns = [/^no/i, /^not/i, /^actually/i, /^wait/i, /^different/i];

  if (positivePatterns.some(p => p.test(input))) {
    return true;
  }

  if (negativePatterns.some(p => p.test(input))) {
    return false;
  }

  // If the input contains the entity we're asking about, it's a clarification
  return input.toLowerCase().includes(expectedEntity.toLowerCase());
}

/**
 * Generate a response for ambiguous inputs
 */
export function handleAmbiguousInput(input: string): IntentResult {
  return {
    intent: 'ambiguous',
    confidence: 0.4,
    entities: [],
    requiresClarification: true,
    clarificationQuestions: [
      "I'd like to help, but I'm not sure what you mean. Could you clarify?",
      "Are you trying to create a video, generate music, or something else?",
    ],
    suggestedWorkflows: ['clarifyIntent', 'showOptions'],
    response: "I want to make sure I help you correctly. Could you tell me more about what you'd like to do?",
  };
}
