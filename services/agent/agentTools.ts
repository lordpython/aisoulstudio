/**
 * Agent Tools
 * 
 * LangChain tool definitions for the Agent Director Service.
 * Extracted from agentDirectorService.ts for modularity.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { lintPrompt, getSystemPersona, refineImagePrompt } from "../promptService";
import { type AnalysisOutput, type StoryboardOutput, runAnalyzer, runStoryboarder } from "../directorService";
import { JSONExtractor, FallbackProcessor, ExtractionMethod, type StoryboardData, type FallbackNotification } from "../jsonExtractor";
import { VideoPurpose } from "../../constants";
import { agentLogger } from "./agentLogger";
import { agentMetrics } from "./agentMetrics";
import { needsFormatCorrection, preprocessFormatCorrection } from "../promptFormatService";

// Create instances for tool usage
const jsonExtractor = new JSONExtractor();
const fallbackProcessor = new FallbackProcessor();

// Register fallback notification callback
fallbackProcessor.registerNotificationCallback((notification: FallbackNotification) => {
    agentLogger.logFallbackUsage(notification);
    agentMetrics.recordFallbackUsage();
});

// Export for external use
export { jsonExtractor, fallbackProcessor };

/**
 * Sanitizes a JSON string by replacing unescaped control characters.
 */
export function sanitizeJsonString(jsonStr: string): string {
    try {
        JSON.parse(jsonStr);
        return jsonStr;
    } catch {
        // Continue with sanitization
    }

    if (needsFormatCorrection(jsonStr)) {
        const correctionResult = preprocessFormatCorrection(jsonStr);
        if (correctionResult.wasModified) {
            try {
                JSON.parse(correctionResult.corrected);
                agentLogger.debug('Format correction applied successfully', {
                    appliedCorrections: correctionResult.appliedCorrections
                });
                return correctionResult.corrected;
            } catch {
                // Continue with manual sanitization
            }
        }
    }

    return jsonStr
        .replace(/[\x00-\x1F\x7F]/g, (char) => {
            switch (char) {
                case '\n': return '\\n';
                case '\r': return '\\r';
                case '\t': return '\\t';
                default: return '';
            }
        });
}

// --- Visual References Helper ---

export function getVisualReferences(query: string, style: string): {
    cameraAngles: string[];
    lighting: string[];
    composition: string[];
    colorPalette: string[];
} {
    const queryLower = query.toLowerCase();

    const moodSuggestions: Record<string, { camera: string[]; lighting: string[]; colors: string[] }> = {
        melancholic: {
            camera: ["slow dolly out", "static wide shot", "low angle looking up"],
            lighting: ["blue hour", "overcast diffused", "single source dramatic"],
            colors: ["desaturated blues", "muted grays", "cold tones"],
        },
        energetic: {
            camera: ["dynamic tracking", "quick cuts", "dutch angle", "crane shot"],
            lighting: ["high contrast", "strobe effects", "rim lighting"],
            colors: ["vibrant saturated", "warm oranges", "electric blues"],
        },
        romantic: {
            camera: ["soft focus close-up", "two-shot", "slow pan"],
            lighting: ["golden hour", "candlelight", "soft diffused"],
            colors: ["warm pastels", "rose gold", "soft pinks"],
        },
        mysterious: {
            camera: ["obscured framing", "silhouette shot", "slow reveal"],
            lighting: ["chiaroscuro", "backlit", "fog/haze"],
            colors: ["deep shadows", "teal and orange", "noir palette"],
        },
        triumphant: {
            camera: ["hero shot low angle", "crane up", "epic wide"],
            lighting: ["dramatic rim light", "god rays", "golden backlight"],
            colors: ["rich golds", "deep reds", "royal blues"],
        },
    };

    const styleComposition: Record<string, string[]> = {
        cinematic: ["rule of thirds", "leading lines", "depth layers", "negative space"],
        anime: ["dynamic poses", "speed lines", "dramatic angles", "expressive lighting"],
        "film noir": ["high contrast shadows", "venetian blind lighting", "dutch angles"],
        watercolor: ["soft edges", "color bleeding", "organic shapes"],
        documentary: ["natural framing", "candid composition", "environmental context"],
    };

    let selectedMood = "energetic";
    for (const mood of Object.keys(moodSuggestions)) {
        if (queryLower.includes(mood) || queryLower.includes(mood.slice(0, 5))) {
            selectedMood = mood;
            break;
        }
    }

    const moodData = moodSuggestions[selectedMood] || moodSuggestions.energetic;
    const styleLower = style.toLowerCase();
    const composition = styleComposition[styleLower] || styleComposition.cinematic;

    return {
        cameraAngles: moodData?.camera ?? [],
        lighting: moodData?.lighting ?? [],
        composition: composition ?? [],
        colorPalette: moodData?.colors ?? [],
    };
}

// --- Storyboard Critique Helper ---

export function critiqueStoryboard(
    storyboard: StoryboardOutput,
    globalSubject: string
): {
    overallScore: number;
    promptCount: number;
    issues: Array<{ promptIndex: number; code: string; message: string }>;
    strengths: string[];
    recommendations: string[];
} {
    const issues: Array<{ promptIndex: number; code: string; message: string }> = [];
    const strengths: string[] = [];
    let totalScore = 100;

    const prompts = storyboard.prompts || [];

    if (prompts.length < 8) {
        issues.push({ promptIndex: -1, code: "too_few_prompts", message: `Only ${prompts.length} prompts` });
        totalScore -= 15;
    } else if (prompts.length >= 10) {
        strengths.push("Complete set of 10 prompts");
    }

    const previousPrompts: string[] = [];
    const moods = new Set<string>();

    prompts.forEach((prompt: { text: string; mood?: string }, index: number) => {
        const lintIssues = lintPrompt({
            promptText: prompt.text,
            globalSubject,
            previousPrompts,
        });

        lintIssues.forEach((issue: { code: string; message: string; severity: string }) => {
            issues.push({ promptIndex: index, code: issue.code, message: issue.message });
            totalScore -= issue.severity === "error" ? 5 : 2;
        });

        previousPrompts.push(prompt.text);
        moods.add(prompt.mood?.toLowerCase() || "unknown");
    });

    if (moods.size >= 4) {
        strengths.push(`Good emotional variety with ${moods.size} moods`);
    } else if (moods.size < 3) {
        issues.push({ promptIndex: -1, code: "low_variety", message: "Limited mood variety" });
        totalScore -= 10;
    }

    const recommendations: string[] = [];
    const errorPrompts = issues.filter(i => i.promptIndex >= 0);

    if (errorPrompts.length > 0) {
        const uniqueIndices = Array.from(new Set(errorPrompts.map(i => i.promptIndex)));
        recommendations.push(`Refine prompts at indices: ${uniqueIndices.join(", ")}`);
    }

    return {
        overallScore: Math.max(0, Math.min(100, totalScore)),
        promptCount: prompts.length,
        issues,
        strengths,
        recommendations,
    };
}

// --- Tool Definitions ---

/**
 * Tool: Analyze Content
 */
export const analyzeContentTool = tool(
    async ({ content, contentType }: { content: string; contentType: "lyrics" | "story" }) => {
        try {
            console.log("[AgentDirector] Running content analysis...");
            const analysis = await runAnalyzer(content, contentType);
            return JSON.stringify(analysis, null, 2);
        } catch (error) {
            return `Analysis failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: "analyze_content",
        description: `Analyze lyrics or story content to identify structure, emotional arc, themes, and art-directed visual scenes.
Use this FIRST before generating storyboards.
RETURNS: A JSON object with sections, emotionalArc, themes, motifs, and visualScenes (full cinematic prompts).
IMPORTANT: Copy the EXACT output of this tool and pass it directly to generate_storyboard's analysisJson parameter.`,
        schema: z.object({
            content: z.string().describe("The SRT/lyrics/story content to analyze"),
            contentType: z.enum(["lyrics", "story"]).describe("Type of content"),
        }),
    }
);

/**
 * Tool: Search Visual References
 */
export const searchVisualReferencesTool = tool(
    async ({ query, style }: { query: string; style: string }) => {
        const references = getVisualReferences(query, style);
        return JSON.stringify(references, null, 2);
    },
    {
        name: "search_visual_references",
        description: `Search for visual references, cinematography techniques, and art style guidance.`,
        schema: z.object({
            query: z.string().describe("What to search for (e.g., 'melancholic night scene')"),
            style: z.string().describe("The art style context"),
        }),
    }
);

/**
 * Tool: Analyze and Generate Storyboard (Combined)
 */
export const analyzeAndGenerateStoryboardTool = tool(
    async ({
        content,
        contentType,
        style,
        videoPurpose,
        globalSubject,
        targetAssetCount,
    }: {
        content: string;
        contentType: "lyrics" | "story";
        style: string;
        videoPurpose: string;
        globalSubject: string;
        targetAssetCount?: number;
    }) => {
        try {
            console.log("[AgentDirector] Running combined analysis + storyboard generation...");

            // Step 1: Analyze content
            console.log("[AgentDirector] Step 1: Analyzing content...");
            const analysis = await runAnalyzer(content, contentType);
            console.log(`[AgentDirector] Analysis complete: ${analysis.sections.length} sections, ${analysis.visualScenes?.length || 0} visual scenes`);

            // Step 2: Generate storyboard from analysis
            console.log("[AgentDirector] Step 2: Generating storyboard...");
            const storyboard = await runStoryboarder(
                analysis,
                style,
                videoPurpose as VideoPurpose,
                globalSubject,
                {
                    targetAssetCount: typeof targetAssetCount === "number" ? targetAssetCount : 10,
                }
            );

            if (!storyboard || !storyboard.prompts || !Array.isArray(storyboard.prompts)) {
                throw new Error("Invalid storyboard structure: missing prompts array");
            }

            if (storyboard.prompts.length === 0) {
                throw new Error("Storyboard contains no prompts");
            }

            console.log(`[AgentDirector] Storyboard generated: ${storyboard.prompts.length} prompts`);

            return JSON.stringify({
                analysis: {
                    sectionCount: analysis.sections.length,
                    themes: analysis.themes,
                    emotionalArc: analysis.emotionalArc,
                    visualScenes: analysis.visualScenes,
                },
                storyboard: storyboard,
            }, null, 2);
        } catch (error) {
            const errorMsg = `Combined analysis + storyboard failed: ${error instanceof Error ? error.message : String(error)}`;
            console.error("[AgentDirector]", errorMsg);
            return errorMsg;
        }
    },
    {
        name: "analyze_and_generate_storyboard",
        description: `RECOMMENDED: Analyze content AND generate storyboard in one step.
This is the most reliable way to create a storyboard - use this instead of calling analyze_content and generate_storyboard separately.
Returns both the analysis summary and the complete storyboard with all prompts.`,
        schema: z.object({
            content: z.string().describe("The SRT/lyrics/story content to analyze"),
            contentType: z.enum(["lyrics", "story"]).describe("Type of content"),
            style: z.string().describe("Art style (e.g., 'Cinematic', 'Anime', 'Watercolor')"),
            videoPurpose: z.string().describe("Video purpose (e.g., 'music_video', 'commercial', 'documentary')"),
            globalSubject: z.string().default("").describe("Main subject for visual consistency (optional)"),
            targetAssetCount: z.number().optional().describe("Target number of prompts to generate (default: 10)"),
        }),
    }
);

/**
 * Tool: Generate Storyboard
 */
export const generateStoryboardTool = tool(
    async ({
        analysisJson,
        style,
        videoPurpose,
        globalSubject,
        targetAssetCount
    }: {
        analysisJson: string;
        style: string;
        videoPurpose: string;
        globalSubject: string;
        targetAssetCount?: number;
    }) => {
        try {
            agentLogger.info('Generating storyboard', { style, videoPurpose, targetAssetCount });

            // Robust JSON extraction for analysis input
            const extracted = await jsonExtractor.extractJSON(analysisJson);
            if (!extracted) throw new Error("Failed to extract analysis JSON");
            
            const data = extracted.data as any;
            const analysis = data.sections ? data : (data.result || data);

            const storyboard = await runStoryboarder(
                analysis as AnalysisOutput,
                style,
                videoPurpose as VideoPurpose,
                globalSubject,
                {
                    targetAssetCount: typeof targetAssetCount === "number" ? targetAssetCount : 10,
                }
            );

            return JSON.stringify(storyboard, null, 2);
        } catch (error) {
            const errorMsg = `Storyboard generation failed: ${error instanceof Error ? error.message : String(error)}`;
            agentLogger.error('Storyboard generation failed', { error: errorMsg });

            const fallbackStoryboard = fallbackProcessor.processWithFallback(
                analysisJson,
                error instanceof Error ? error.message : String(error)
            );

            if (fallbackStoryboard && fallbackStoryboard.prompts.length > 0) {
                agentMetrics.recordExtractionMethod(ExtractionMethod.FALLBACK_TEXT);
                return JSON.stringify(fallbackStoryboard, null, 2);
            }

            return errorMsg;
        }
    },
    {
        name: "generate_storyboard",
        description: `Generate a visual storyboard with detailed image prompts based on content analysis.
CRITICAL: All prompts must share the same visual universe.
Use this AFTER analyze_content.`,
        schema: z.object({
            analysisJson: z.string().describe("Pass the EXACT raw JSON string output from analyze_content here."),
            style: z.string().describe("Art style (e.g., 'Cinematic', 'Anime', 'Watercolor')"),
            videoPurpose: z.string().describe("Video purpose (e.g., 'music_video', 'commercial', 'documentary')"),
            globalSubject: z.string().default("").describe("Main subject for consistency (can be empty string)"),
            targetAssetCount: z.number().optional().describe("Target number of prompts to generate (default: 10)"),
        }),
    }
);

/**
 * Tool: Refine Prompt
 */
export const refinePromptTool = tool(
    async ({
        promptText,
        style,
        globalSubject,
        previousPrompts
    }: {
        promptText: string;
        style: string;
        globalSubject: string;
        previousPrompts: string[];
    }) => {
        try {
            console.log("[AgentDirector] Refining prompt...");
            const result = await refineImagePrompt({
                promptText,
                style,
                globalSubject,
                intent: "auto",
                previousPrompts,
            });
            return JSON.stringify({
                refinedPrompt: result.refinedPrompt,
                issues: result.issues.map((i: { code: string; message: string }) => ({ code: i.code, message: i.message })),
                wasRefined: result.refinedPrompt !== promptText,
            }, null, 2);
        } catch (error) {
            return `Refinement failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: "refine_prompt",
        description: `Refine and improve a single image prompt.`,
        schema: z.object({
            promptText: z.string().describe("The prompt text to refine"),
            style: z.string().describe("Art style for context"),
            globalSubject: z.string().default("").describe("Main subject (can be empty)"),
            previousPrompts: z.array(z.string()).default([]).describe("Previous prompts to avoid repetition (optional)"),
        }),
    }
);

/**
 * Tool: Critique Storyboard
 */
export const critiqueStoryboardTool = tool(
    async ({
        storyboardJson,
        globalSubject
    }: {
        storyboardJson: string;
        globalSubject: string;
    }) => {
        try {
            console.log("[AgentDirector] Critiquing storyboard...");
            const sanitizedJson = sanitizeJsonString(storyboardJson);
            const storyboard: StoryboardOutput = JSON.parse(sanitizedJson);
            const critique = critiqueStoryboard(storyboard, globalSubject);
            return JSON.stringify(critique, null, 2);
        } catch (error) {
            return `Critique failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: "critique_storyboard",
        description: `Evaluate the quality of a generated storyboard.
Returns a quality score and list of issues to fix.`,
        schema: z.object({
            storyboardJson: z.string().describe("The JSON output from generate_storyboard tool"),
            globalSubject: z.string().default("").describe("Main subject (can be empty)"),
        }),
    }
);

// All tools for binding
export const allTools = [
    analyzeAndGenerateStoryboardTool,
    analyzeContentTool,
    searchVisualReferencesTool,
    generateStoryboardTool,
    refinePromptTool,
    critiqueStoryboardTool,
];

/**
 * Execute a tool call by name.
 */
export async function executeToolCall(
    toolCall: { name: string; args: Record<string, unknown> }
): Promise<string> {
    const { name, args } = toolCall;

    // Sanitize args to handle null/undefined values
    const sanitizedArgs = { ...args };
    for (const [key, value] of Object.entries(sanitizedArgs)) {
        if (value === null || value === undefined) {
            if (key === 'previousPrompts') {
                sanitizedArgs[key] = [];
            } else {
                sanitizedArgs[key] = '';
            }
        }
    }

    switch (name) {
        case "analyze_and_generate_storyboard":
            return analyzeAndGenerateStoryboardTool.invoke(sanitizedArgs as {
                content: string;
                contentType: "lyrics" | "story";
                style: string;
                videoPurpose: string;
                globalSubject: string;
                targetAssetCount?: number;
            });
        case "analyze_content":
            return analyzeContentTool.invoke(sanitizedArgs as { content: string; contentType: "lyrics" | "story" });
        case "search_visual_references":
            return searchVisualReferencesTool.invoke(sanitizedArgs as { query: string; style: string });
        case "generate_storyboard":
            return generateStoryboardTool.invoke(sanitizedArgs as { analysisJson: string; style: string; videoPurpose: string; globalSubject: string });
        case "refine_prompt":
            return refinePromptTool.invoke(sanitizedArgs as { promptText: string; style: string; globalSubject: string; previousPrompts: string[] });
        case "critique_storyboard":
            return critiqueStoryboardTool.invoke(sanitizedArgs as { storyboardJson: string; globalSubject: string });
        default:
            return `Unknown tool: ${name}`;
    }
}
