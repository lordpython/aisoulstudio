/**
 * Story Service — Direct tool invocations for the Story Mode workflow
 *
 * Replaces the `runProductionAgent` LLM-in-the-loop pattern where natural
 * language prompts were sent to the agent just to invoke a single tool.
 * Each function calls the tool logic directly, eliminating LLM overhead.
 */

import { agentLogger } from '../../infrastructure/logger';

const log = agentLogger.child('StoryService');

// ---------------------------------------------------------------------------
// Result type returned by all story service functions
// ---------------------------------------------------------------------------

export interface StoryToolResult {
    success: boolean;
    sessionId?: string;
    message?: string;
    error?: string;
    [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Parse a tool's JSON string response into a typed result
// ---------------------------------------------------------------------------

function parseToolResult(json: string): StoryToolResult {
    try {
        return JSON.parse(json) as StoryToolResult;
    } catch {
        return { success: false, error: `Failed to parse tool response: ${json.slice(0, 200)}` };
    }
}

// ---------------------------------------------------------------------------
// Step 1: Generate Breakdown
// ---------------------------------------------------------------------------

export async function invokeGenerateBreakdown(
    topic: string,
    sessionId?: string,
    targetDurationSeconds?: number,
): Promise<StoryToolResult> {
    log.info(`Direct: generate_breakdown for "${topic.slice(0, 50)}..."${targetDurationSeconds ? ` target=${targetDurationSeconds}s` : ''}`);
    const { generateBreakdownTool } = await import('./tools/storyTools');
    const result = await generateBreakdownTool.invoke({ topic, sessionId, targetDuration: targetDurationSeconds });
    return parseToolResult(result);
}

// ---------------------------------------------------------------------------
// Step 2: Create Screenplay
// ---------------------------------------------------------------------------

export async function invokeCreateScreenplay(
    sessionId: string,
): Promise<StoryToolResult> {
    log.info(`Direct: create_screenplay for session ${sessionId}`);
    const { createScreenplayTool } = await import('./tools/storyTools');
    const result = await createScreenplayTool.invoke({ sessionId });
    return parseToolResult(result);
}

// ---------------------------------------------------------------------------
// Step 3: Generate Characters
// ---------------------------------------------------------------------------

export async function invokeGenerateCharacters(
    sessionId: string,
): Promise<StoryToolResult> {
    log.info(`Direct: generate_characters for session ${sessionId}`);
    const { generateCharactersTool } = await import('./tools/storyTools');
    const result = await generateCharactersTool.invoke({ sessionId });
    return parseToolResult(result);
}

// ---------------------------------------------------------------------------
// Step 4: Generate Shotlist
// ---------------------------------------------------------------------------

export async function invokeGenerateShotlist(
    sessionId: string,
): Promise<StoryToolResult> {
    log.info(`Direct: generate_shotlist for session ${sessionId}`);
    const { generateShotlistTool } = await import('./tools/storyTools');
    const result = await generateShotlistTool.invoke({ sessionId });
    return parseToolResult(result);
}

// ---------------------------------------------------------------------------
// Step 5: Verify Character Consistency
// ---------------------------------------------------------------------------

export async function invokeVerifyCharacterConsistency(
    sessionId: string,
    characterName: string,
): Promise<StoryToolResult> {
    log.info(`Direct: verify_character_consistency for "${characterName}" in ${sessionId}`);
    const { verifyCharacterConsistencyTool } = await import('./tools/storyTools');
    const result = await verifyCharacterConsistencyTool.invoke({ sessionId, characterName });
    return parseToolResult(result);
}

// ---------------------------------------------------------------------------
// Regenerate Scene — direct LLM call (no tool exists for this)
//
// The old agent path sent a natural language prompt to the LLM hoping it
// would figure out how to regenerate a specific scene. Since there's no
// dedicated tool, we call the breakdown tool again with augmented context.
// ---------------------------------------------------------------------------

export async function invokeRegenerateScene(
    sessionId: string,
    sceneNumber: number,
    feedback: string,
): Promise<StoryToolResult> {
    log.info(`Direct: regenerate scene ${sceneNumber} in ${sessionId}`);

    const { storyModeStore } = await import('./store');
    const state = storyModeStore.get(sessionId);
    if (!state) {
        return { success: false, error: 'Session not found. Generate a breakdown first.' };
    }

    // Re-run breakdown with augmented topic that incorporates the feedback
    const augmentedTopic = `${state.topic}\n\nFeedback for scene ${sceneNumber}: ${feedback}. ` +
        `Please regenerate the story keeping the overall structure but improving scene ${sceneNumber} based on this feedback.`;

    const { generateBreakdownTool } = await import('./tools/storyTools');
    const result = await generateBreakdownTool.invoke({ topic: augmentedTopic, sessionId });
    return parseToolResult(result);
}
