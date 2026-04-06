/**
 * AI Assistant Types — Conversation, intents, workflows
 */

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
