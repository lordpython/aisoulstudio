/**
 * LangChain Workflow Trigger Service
 * 
 * Bridges NLP intent parser outputs to LangChain workflow executions.
 * Handles workflow selection, parameter mapping, execution, and result formatting.
 */

import {
  ParsedIntent,
  ExtractedEntity,
  ConversationContext,
  WorkflowResult,
  IntentType
} from '../../types';
import { runProductionPipeline, ProductionConfig } from '../agentOrchestrator';
import { generatePromptsWithAgent, AgentDirectorConfig } from '../agentDirectorService';
import { agentDirectorLogger as agentLogger } from '../agent/agentLogger';
import { v4 as uuidv4 } from 'uuid';

// --- Local Types ---

export type WorkflowType = 
  | 'video_production'
  | 'image_generation'
  | 'video_editing'
  | 'narration_generation'
  | 'translation'
  | 'content_analysis'
  | 'content_planning'
  | 'video_export'
  | 'music_generation';

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'escalated';

export interface WorkflowStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message?: string;
  progress?: number;
}

export interface WorkflowMapping {
  intent: IntentType;
  workflowType: WorkflowType;
  description: string;
  requiredEntities: string[];
  optionalEntities: string[];
}

export interface WorkflowExecutionContext {
  executionId: string;
  workflowType: WorkflowType;
  intent: ParsedIntent;
  context: ConversationContext;
  startTime: Date;
  steps: WorkflowStep[];
  status: WorkflowStatus;
  result?: WorkflowResult;
  error?: string;
}

export interface WorkflowExecutorParams {
  intent: ParsedIntent;
  context: ConversationContext;
  entities: ExtractedEntity[];
  userInput: string;
  onProgress?: (step: WorkflowStep) => void;
}

// Extended result with additional fields for this service
export interface ExtendedWorkflowResult extends WorkflowResult {
  executionId?: string;
  workflowType?: WorkflowType;
  workflowName?: string;
  requiresClarification?: boolean;
  clarificationQuestion?: string;
  requiresEscalation?: boolean;
  escalationReason?: string;
  suggestion?: string;
  canRetry?: boolean;
  output?: Record<string, unknown>;
}

// --- Workflow Mapping Configuration ---

const WORKFLOW_MAPPINGS: WorkflowMapping[] = [
  {
    intent: 'create_video',
    workflowType: 'video_production',
    description: 'Generate a complete video from content',
    requiredEntities: ['topic'],
    optionalEntities: ['style', 'duration', 'language']
  },
  {
    intent: 'generate_images',
    workflowType: 'image_generation',
    description: 'Generate visual assets for scenes',
    requiredEntities: ['topic'],
    optionalEntities: ['style', 'mood']
  },
  {
    intent: 'edit_video',
    workflowType: 'video_editing',
    description: 'Edit or modify existing video',
    requiredEntities: [],
    optionalEntities: ['duration', 'style']
  },
  {
    intent: 'translate_content',
    workflowType: 'translation',
    description: 'Translate content to another language',
    requiredEntities: ['language'],
    optionalEntities: ['style']
  },
  {
    intent: 'generate_music',
    workflowType: 'music_generation',
    description: 'Generate AI music track',
    requiredEntities: [],
    optionalEntities: ['mood', 'duration', 'style']
  }
];

// --- Service Implementation ---

class WorkflowTriggerService {
  private activeExecutions: Map<string, WorkflowExecutionContext> = new Map();
  private executionHistory: WorkflowExecutionContext[] = [];
  private maxHistorySize = 50;

  /**
   * Execute a workflow based on parsed intent
   */
  async executeWorkflow(params: WorkflowExecutorParams): Promise<ExtendedWorkflowResult> {
    const { intent, context, entities, userInput, onProgress } = params;
    const executionId = uuidv4();
    const startTime = new Date();

    agentLogger.info('Starting workflow execution', {
      executionId,
      intent: intent.intentType,
      confidence: intent.confidence
    });

    // Find matching workflow
    const mapping = WORKFLOW_MAPPINGS.find(m => m.intent === intent.intentType);
    
    if (!mapping) {
      // Return a conversational response for non-workflow intents
      return {
        success: true,
        executionId,
        workflowName: 'conversation',
        message: 'Processing your request...'
      };
    }

    // Create execution context
    const executionContext: WorkflowExecutionContext = {
      executionId,
      workflowType: mapping.workflowType,
      intent,
      context,
      startTime,
      steps: [],
      status: 'running'
    };

    this.activeExecutions.set(executionId, executionContext);

    try {
      let result: ExtendedWorkflowResult;

      switch (mapping.workflowType) {
        case 'video_production':
          result = await this.executeVideoProduction(executionContext, entities, userInput, onProgress);
          break;
        case 'image_generation':
          result = await this.executeImageGeneration(executionContext, entities, userInput);
          break;
        case 'content_planning':
          result = await this.executeContentPlanning(executionContext, entities, userInput);
          break;
        default:
          result = {
            success: true,
            executionId,
            workflowType: mapping.workflowType,
            workflowName: mapping.description,
            message: `Workflow "${mapping.workflowType}" acknowledged. This feature is coming soon.`
          };
      }

      executionContext.status = result.success ? 'completed' : 'failed';
      executionContext.result = result;
      this.archiveExecution(executionContext);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      executionContext.status = 'failed';
      executionContext.error = errorMessage;
      this.archiveExecution(executionContext);

      return {
        success: false,
        executionId,
        error: errorMessage,
        message: `Workflow failed: ${errorMessage}`,
        canRetry: true
      };
    }
  }

  /**
   * Generate conversational response using LLM
   */
  async generateConversationalResponse(
    userInput: string,
    conversationHistory: Array<{ role: string; content: string }>,
    context: unknown
  ): Promise<string> {
    // For now, return a template response
    // In production, this would call Gemini for natural conversation
    const greetings = ['hello', 'hi', 'hey', 'greetings'];
    const isGreeting = greetings.some(g => userInput.toLowerCase().includes(g));

    if (isGreeting) {
      return "Hello! I'm your AI creative assistant. I can help you create videos, generate music, and more. What would you like to work on today?";
    }

    return "I'm here to help! You can ask me to create videos, generate images, or help with your creative projects. What would you like to do?";
  }

  /**
   * Video Production Workflow
   */
  private async executeVideoProduction(
    context: WorkflowExecutionContext,
    entities: ExtractedEntity[],
    userInput: string,
    onProgress?: (step: WorkflowStep) => void
  ): Promise<ExtendedWorkflowResult> {
    const topic = this.extractEntityValue(entities, 'topic') || userInput;
    const style = this.extractEntityValue(entities, 'style') || 'Cinematic';
    const duration = parseInt(this.extractEntityValue(entities, 'duration') || '60');

    const step: WorkflowStep = {
      name: 'video_production',
      status: 'running',
      message: 'Starting video production...'
    };
    context.steps.push(step);
    onProgress?.(step);

    try {
      const config: ProductionConfig = {
        targetDuration: duration,
        sceneCount: Math.ceil(duration / 12),
        targetAudience: 'General audience',
        visualStyle: style,
        aspectRatio: '16:9',
        skipNarration: false,
        skipVisuals: false,
        skipValidation: false,
        maxRetries: 2
      };

      const result = await runProductionPipeline(
        { topic },
        config,
        (progress) => {
          const progressStep: WorkflowStep = {
            name: progress.stage,
            status: progress.progress < 100 ? 'running' : 'completed',
            progress: progress.progress,
            message: progress.message
          };
          onProgress?.(progressStep);
        }
      );

      return {
        success: result.success,
        executionId: context.executionId,
        workflowType: 'video_production',
        workflowName: 'Video Production',
        data: {
          contentPlan: result.contentPlan,
          narrationSegments: result.narrationSegments,
          visuals: result.visuals
        },
        message: `Video production ${result.success ? 'completed' : 'completed with issues'}`,
        nextSteps: ['Review generated content', 'Preview visuals', 'Export video']
      };

    } catch (error) {
      throw new Error(`Video production failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Image Generation Workflow
   */
  private async executeImageGeneration(
    context: WorkflowExecutionContext,
    entities: ExtractedEntity[],
    userInput: string
  ): Promise<ExtendedWorkflowResult> {
    const content = this.extractEntityValue(entities, 'topic') || userInput;
    const style = this.extractEntityValue(entities, 'style') || 'Cinematic';

    context.steps.push({
      name: 'image_generation',
      status: 'running',
      message: 'Generating image prompts...'
    });

    try {
      const prompts = await generatePromptsWithAgent(
        content,
        style,
        'story',
        'documentary',
        undefined,
        { targetAssetCount: 10 } as AgentDirectorConfig
      );

      return {
        success: true,
        executionId: context.executionId,
        workflowType: 'image_generation',
        workflowName: 'Image Generation',
        data: { prompts },
        message: `Generated ${prompts.length} image prompts`,
        nextSteps: ['Review prompts', 'Generate images', 'Add to timeline']
      };

    } catch (error) {
      throw new Error(`Image generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Content Planning Workflow
   */
  private async executeContentPlanning(
    context: WorkflowExecutionContext,
    entities: ExtractedEntity[],
    userInput: string
  ): Promise<ExtendedWorkflowResult> {
    const topic = this.extractEntityValue(entities, 'topic') || userInput;
    const duration = parseInt(this.extractEntityValue(entities, 'duration') || '60');

    context.steps.push({
      name: 'content_planning',
      status: 'running',
      message: 'Creating content plan...'
    });

    try {
      const { generateContentPlan } = await import('../contentPlannerService');
      const contentPlan = await generateContentPlan(topic, {
        targetDuration: duration,
        sceneCount: Math.ceil(duration / 12),
        targetAudience: 'General audience'
      });

      return {
        success: true,
        executionId: context.executionId,
        workflowType: 'content_planning',
        workflowName: 'Content Planning',
        data: { contentPlan },
        message: `Created plan with ${contentPlan.scenes.length} scenes`,
        nextSteps: ['Review plan', 'Modify scenes', 'Start production']
      };

    } catch (error) {
      throw new Error(`Content planning failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // --- Helper Methods ---

  private extractEntityValue(entities: ExtractedEntity[], type: string): string | undefined {
    const entity = entities.find(e => e.type === type || e.type === 'custom');
    return entity?.value;
  }

  private archiveExecution(context: WorkflowExecutionContext): void {
    this.activeExecutions.delete(context.executionId);
    this.executionHistory.push(context);
    
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  // --- Public API ---

  getExecution(executionId: string): WorkflowExecutionContext | undefined {
    return this.activeExecutions.get(executionId) ||
           this.executionHistory.find(e => e.executionId === executionId);
  }

  getAvailableWorkflows(): WorkflowMapping[] {
    return WORKFLOW_MAPPINGS;
  }

  getRecentExecutions(limit = 10): WorkflowExecutionContext[] {
    return this.executionHistory.slice(-limit).reverse();
  }
}

// Export singleton instance
export const workflowTriggerService = new WorkflowTriggerService();

// Also export as workflowExecutor for compatibility
export const workflowExecutor = workflowTriggerService;
