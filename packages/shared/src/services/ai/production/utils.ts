/**
 * Production Agent Utilities
 * 
 * Utility functions for language detection and helper operations.
 */

import { agentLogger } from "../../logger";

const log = agentLogger.child('Production');

/**
 * Detect language from text content using Unicode character analysis.
 * Used to auto-select the appropriate TTS voice for narration.
 * 
 * @param text - The text to analyze
 * @returns Language code (e.g., 'ar', 'en', 'he', 'zh')
 */
export function detectLanguageFromText(text: string): string {
    if (!text || text.trim().length === 0) {
        return 'en';
    }

    // Count characters in different Unicode ranges
    let arabicCount = 0;
    let hebrewCount = 0;
    let chineseCount = 0;
    let japaneseCount = 0;
    let koreanCount = 0;
    let cyrillicCount = 0;
    let greekCount = 0;
    let latinCount = 0;
    let totalAlpha = 0;

    for (const char of text) {
        const code = char.charCodeAt(0);

        // Arabic: U+0600–U+06FF, U+0750–U+077F (Arabic Supplement)
        if ((code >= 0x0600 && code <= 0x06FF) || (code >= 0x0750 && code <= 0x077F)) {
            arabicCount++;
            totalAlpha++;
        }
        // Hebrew: U+0590–U+05FF
        else if (code >= 0x0590 && code <= 0x05FF) {
            hebrewCount++;
            totalAlpha++;
        }
        // CJK (Chinese): U+4E00–U+9FFF
        else if (code >= 0x4E00 && code <= 0x9FFF) {
            chineseCount++;
            totalAlpha++;
        }
        // Japanese (Hiragana + Katakana): U+3040–U+30FF
        else if (code >= 0x3040 && code <= 0x30FF) {
            japaneseCount++;
            totalAlpha++;
        }
        // Korean (Hangul): U+AC00–U+D7AF
        else if (code >= 0xAC00 && code <= 0xD7AF) {
            koreanCount++;
            totalAlpha++;
        }
        // Cyrillic (Russian, etc.): U+0400–U+04FF
        else if (code >= 0x0400 && code <= 0x04FF) {
            cyrillicCount++;
            totalAlpha++;
        }
        // Greek: U+0370–U+03FF
        else if (code >= 0x0370 && code <= 0x03FF) {
            greekCount++;
            totalAlpha++;
        }
        // Latin (A-Z, a-z, extended Latin)
        else if ((code >= 0x0041 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x024F)) {
            latinCount++;
            totalAlpha++;
        }
    }

    // Determine majority language (need at least 20% of text to be in that script)
    const threshold = totalAlpha * 0.2;

    if (arabicCount > threshold && arabicCount >= Math.max(hebrewCount, chineseCount, japaneseCount, koreanCount, cyrillicCount, latinCount)) {
        return 'ar';
    }
    if (hebrewCount > threshold && hebrewCount >= Math.max(arabicCount, chineseCount, japaneseCount, koreanCount, cyrillicCount, latinCount)) {
        return 'he';
    }
    if (chineseCount > threshold && chineseCount >= Math.max(arabicCount, hebrewCount, japaneseCount, koreanCount, cyrillicCount, latinCount)) {
        return 'zh';
    }
    if (japaneseCount > threshold && japaneseCount >= Math.max(arabicCount, hebrewCount, chineseCount, koreanCount, cyrillicCount, latinCount)) {
        return 'ja';
    }
    if (koreanCount > threshold && koreanCount >= Math.max(arabicCount, hebrewCount, chineseCount, japaneseCount, cyrillicCount, latinCount)) {
        return 'ko';
    }
    if (cyrillicCount > threshold && cyrillicCount >= Math.max(arabicCount, hebrewCount, chineseCount, japaneseCount, koreanCount, latinCount)) {
        return 'ru';
    }
    if (greekCount > threshold && greekCount >= Math.max(arabicCount, hebrewCount, chineseCount, japaneseCount, koreanCount, cyrillicCount, latinCount)) {
        return 'el';
    }

    // Default to English for Latin script or mixed content
    return 'en';
}

/**
 * Generate unique ID for each production session
 */
export function generateSessionId(): string {
    return `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate that a contentPlanId is a real session ID, not a placeholder.
 * Returns an error response if invalid, null if valid.
 * 
 * This prevents the AI from using placeholder values like "plan_123" or "cp_01"
 * which would cause "Content plan not found" errors.
 */
export function validateContentPlanId(contentPlanId: string): string | null {
    if (!contentPlanId) {
        return JSON.stringify({
            success: false,
            error: `Missing contentPlanId. You must provide the sessionId returned by plan_video or generate_breakdown.`
        });
    }

    // Check for common placeholder patterns
    if (contentPlanId.match(/^(plan_\d+|cp_\d+|session_\d+|plan_\w{3,8}|cp_\w{3,8})$/)) {
        return JSON.stringify({
            success: false,
            error: `Invalid contentPlanId: "${contentPlanId}". You must use the ACTUAL sessionId returned by plan_video or generate_breakdown. Never use placeholder values.`
        });
    }

    // Check if it matches the expected formats (prod_ or story_)
    if (!contentPlanId.startsWith('prod_') && !contentPlanId.startsWith('story_')) {
        return JSON.stringify({
            success: false,
            error: `Invalid contentPlanId format: "${contentPlanId}". Expected format: prod_TIMESTAMP_HASH or story_TIMESTAMP. Make sure you are using the exact sessionId returned by plan_video or generate_breakdown.`
        });
    }

    return null; // Valid
}

/**
 * Validate a sessionId at runtime (not a placeholder).
 * Returns true if valid, false if invalid.
 */
export function isValidSessionId(sessionId: string | null | undefined): sessionId is string {
    if (!sessionId) return false;
    
    // Check for common placeholder patterns
    if (sessionId.match(/^(plan_\d+|cp_\d+|session_\d+|plan_\w{3,8}|cp_\w{3,8})$/)) {
        return false;
    }
    
    // Check if it matches the expected formats (prod_ or story_)
    return sessionId.startsWith('prod_') || sessionId.startsWith('story_');
}

/**
 * Create a step identifier for duplicate tool call prevention.
 * This combines tool name with key arguments to identify unique execution steps.
 * 
 * Requirement 10.1 - Track executed tools per step
 */
export function createStepIdentifier(toolName: string, toolArgs: any): string {
    // For scene-specific tools, include scene index first (before contentPlanId check)
    if (toolArgs.sceneIndex !== undefined) {
        return `${toolName}_${toolArgs.contentPlanId || 'default'}_scene_${toolArgs.sceneIndex}`;
    }

    // For most tools, the contentPlanId is the key identifier
    if (toolArgs.contentPlanId) {
        return `${toolName}_${toolArgs.contentPlanId}`;
    }

    // For import tools, use URL or path as identifier
    if (toolArgs.url) {
        return `${toolName}_${toolArgs.url}`;
    }
    if (toolArgs.audioPath) {
        return `${toolName}_${toolArgs.audioPath}`;
    }

    // For tools without specific identifiers, use tool name only
    return toolName;
}
