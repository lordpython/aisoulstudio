/**
 * JSON Utilities
 * 
 * Shared JSON sanitization and format correction utilities.
 * Extracted from agentDirectorService and promptFormatService.
 */

/**
 * Sanitizes a JSON string by replacing unescaped control characters.
 * AI models sometimes return JSON with raw newlines/tabs inside string values.
 */
export function sanitizeJsonString(jsonStr: string): string {
    // First, try to parse as-is - only sanitize if needed
    try {
        JSON.parse(jsonStr);
        return jsonStr;
    } catch {
        // Continue with sanitization
    }

    // Replace control characters that are not properly escaped
    let sanitized = jsonStr;
    sanitized = sanitized
        .replace(/[\x00-\x1F\x7F]/g, (char) => {
            switch (char) {
                case '\n': return '\\n';
                case '\r': return '\\r';
                case '\t': return '\\t';
                default: return ''; // Remove other control characters
            }
        });

    return sanitized;
}

/**
 * Extract JSON from a string that may contain markdown code blocks or extra text.
 */
export function extractJsonFromText(text: string): string | null {
    if (!text || typeof text !== 'string') {
        return null;
    }

    // Try to find JSON in markdown code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
        return codeBlockMatch[1].trim();
    }

    // Try to find JSON object or array
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch && jsonMatch[1]) {
        return jsonMatch[1].trim();
    }

    return text.trim();
}

/**
 * Safely parse JSON with sanitization fallback.
 */
export function safeJsonParse<T = unknown>(text: string): T | null {
    const extracted = extractJsonFromText(text);
    if (!extracted) return null;

    try {
        return JSON.parse(extracted) as T;
    } catch {
        // Try with sanitization
        try {
            return JSON.parse(sanitizeJsonString(extracted)) as T;
        } catch {
            return null;
        }
    }
}
