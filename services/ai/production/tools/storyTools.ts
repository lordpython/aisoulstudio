/**
 * Story Tools for Production Agent
 * 
 * Tools for story mode workflow: breakdown, screenplay, characters, shotlist, and consistency verification.
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { agentLogger } from "../../../logger";
import { GEMINI_API_KEY, MODELS } from "../../../shared/apiClient";
import { StoryModeSchema, VerifyCharacterConsistencySchema, type StoryModeState } from "../types";
import { storyModeStore, productionStore } from "../store";
import { verifyCharacterConsistency } from "../../../visualConsistencyService";
import { type ScreenplayScene, type ShotlistEntry, type CharacterProfile } from "../../../../types";

const log = agentLogger.child('Production');

// --- Generate Breakdown Tool ---

export const generateBreakdownTool = tool(
    async ({ topic, sessionId }) => {
        const id = sessionId || `story_${Date.now()}`;
        log.info(` Generating story breakdown for: ${topic}`);

        // Validate API key
        if (!GEMINI_API_KEY) {
            log.error(' GEMINI_API_KEY is not configured');
            return JSON.stringify({
                success: false,
                error: 'GEMINI_API_KEY is not configured. Please set VITE_GEMINI_API_KEY in your .env.local file.',
            });
        }

        const model = new ChatGoogleGenerativeAI({
            model: MODELS.TEXT_EXP,
            apiKey: GEMINI_API_KEY,
            temperature: 0.7,
            maxRetries: 2,
        });

        const prompt = `Create a narrative breakdown for a video story about: "${topic}".
Divide it into 3-5 distinct acts or chapters. For each act, provide:
1. Title
2. Emotional Hook
3. Key narrative beat

Format as a structured list.`;

        let breakdown: string;
        try {
            log.info(' Invoking Gemini API for story breakdown...');
            const response = await model.invoke(prompt);
            breakdown = response.content as string;
            log.info(' Story breakdown generated successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.error(` Failed to generate story breakdown: ${errorMessage}`);
            return JSON.stringify({
                success: false,
                error: `Failed to generate story breakdown: ${errorMessage}`,
            });
        }

        const state: StoryModeState = storyModeStore.get(id) || {
            id,
            topic,
            breakdown,
            screenplay: [],
            characters: [],
            shotlist: [],
            currentStep: 'breakdown',
            updatedAt: Date.now(),
        };

        state.breakdown = breakdown;
        state.currentStep = 'breakdown';
        state.updatedAt = Date.now();
        storyModeStore.set(id, state);

        // Return minimal info - full breakdown is stored in state
        return JSON.stringify({
            success: true,
            sessionId: id,
            actCount: breakdown.split(/Act \d+|Chapter \d+/i).length - 1 || 3,
            message: `Story breakdown created with narrative structure. Use sessionId="${id}" for next steps.`,
        });
    },
    {
        name: "generate_breakdown",
        description: "Step 1: Generate a narrative breakdown/outline for the story topic.",
        schema: StoryModeSchema,
    }
);

// --- Create Screenplay Tool ---

export const createScreenplayTool = tool(
    async ({ sessionId }) => {
        if (!sessionId) return JSON.stringify({ success: false, error: "sessionId required" });
        const state = storyModeStore.get(sessionId);
        if (!state) return JSON.stringify({ success: false, error: "Session not found" });

        log.info(` Creating screenplay for: ${sessionId}`);

        const model = new ChatGoogleGenerativeAI({
            model: MODELS.TEXT_EXP,
            apiKey: GEMINI_API_KEY,
            temperature: 0.7,
            maxRetries: 2,
        });

        const prompt = `Write a short cinematic screenplay based on this breakdown:
${state.breakdown}

Format each scene with:
- SCENE [Number]: [Heading]
- ACTION: [Description]
- DIALOGUE: [Character]: [Text]

Limit to 3-5 scenes.`;

        let scriptText: string;
        try {
            log.info(' Invoking Gemini API for screenplay...');
            const response = await model.invoke(prompt);
            scriptText = response.content as string;
            log.info(' Screenplay generated successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.error(` Failed to create screenplay: ${errorMessage}`);
            return JSON.stringify({
                success: false,
                error: `Failed to create screenplay: ${errorMessage}`,
            });
        }

        // Simple parser for the draft screenplay
        const scenes: ScreenplayScene[] = [];
        const sceneBlocks = scriptText.split(/SCENE\s+\d+:/i).filter(b => b.trim());

        sceneBlocks.forEach((block, i) => {
            const lines = block.split('\n').filter(l => l.trim());
            const heading = lines[0] || 'Untitled Scene';
            const actionLines = lines.filter(l => l.toUpperCase().startsWith('ACTION:'));
            const dialogueLines = lines.filter(l => l.includes(':') && !l.toUpperCase().startsWith('ACTION:'));

            scenes.push({
                id: `scene_${i}`,
                sceneNumber: i + 1,
                heading: heading.replace(/ACTION:|DIALOGUE:/gi, '').trim(),
                action: actionLines.map(l => l.replace('ACTION:', '').trim()).join(' '),
                dialogue: dialogueLines.map(l => {
                    const [speaker, ...text] = l.split(':');
                    return { speaker: (speaker || "").trim(), text: text.join(':').trim() };
                }),
                charactersPresent: [],
            });
        });

        state.screenplay = scenes;
        state.currentStep = 'screenplay';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        // Return minimal info - full screenplay is stored in state
        return JSON.stringify({
            success: true,
            sceneCount: scenes.length,
            sceneHeadings: scenes.map(s => s.heading),
            message: `Screenplay created with ${scenes.length} scenes.`,
        });
    },
    {
        name: "create_screenplay",
        description: "Step 2: Transform the breakdown into a formatted screenplay with dialogue.",
        schema: z.object({ sessionId: z.string() }),
    }
);

// --- Generate Characters Tool ---

export const generateCharactersTool = tool(
    async ({ sessionId }) => {
        if (!sessionId) return JSON.stringify({ success: false, error: "sessionId required" });
        const state = storyModeStore.get(sessionId);
        if (!state) return JSON.stringify({ success: false, error: "Session not found" });

        log.info(` Extracting characters for: ${sessionId}`);
        const { extractCharacters, generateAllCharacterReferences } = await import("../../../characterService");

        const scriptText = state.screenplay.map(s => 
            `${s.heading}\n${s.action}\n${s.dialogue.map(d => `${d.speaker}: ${d.text}`).join('\n')}`
        ).join('\n\n');

        const characters = await extractCharacters(scriptText);
        const charactersWithRefs = await generateAllCharacterReferences(characters, sessionId);

        state.characters = charactersWithRefs;
        state.currentStep = 'characters';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        // Return minimal info - full characters are stored in state
        return JSON.stringify({
            success: true,
            characterCount: charactersWithRefs.length,
            characterNames: charactersWithRefs.map(c => c.name),
            hasReferences: charactersWithRefs.filter(c => c.referenceImageUrl).length,
            message: `Extracted ${charactersWithRefs.length} characters with visual references.`,
        });
    },
    {
        name: "generate_characters",
        description: "Step 3: Extract characters from the screenplay and generate consistent visual reference sheets.",
        schema: z.object({ sessionId: z.string() }),
    }
);

// --- Generate Shotlist Tool ---

export const generateShotlistTool = tool(
    async ({ sessionId }) => {
        if (!sessionId) return JSON.stringify({ success: false, error: "sessionId required" });
        const state = storyModeStore.get(sessionId);
        if (!state) return JSON.stringify({ success: false, error: "Session not found" });

        log.info(` Generating shotlist for: ${sessionId}`);

        const model = new ChatGoogleGenerativeAI({
            model: MODELS.TEXT_EXP,
            apiKey: GEMINI_API_KEY,
            temperature: 0.5,
            maxRetries: 2,
        });

        const prompt = `Based on this screenplay and character list, create a professional shotlist for a storyboard.
For each scene, provide 1-2 key camera shots.

Screenplay:
${JSON.stringify(state.screenplay)}

Characters:
${JSON.stringify(state.characters)}

For each shot, provide:
1. Shot Type (Wide, Close-up, etc.)
2. Visual description including character movements and lighting.
3. Audio/Dialogue for that shot.`;

        let shotlistText: string;
        try {
            log.info(' Invoking Gemini API for shotlist...');
            const response = await model.invoke(prompt);
            shotlistText = response.content as string;
            log.info(' Shotlist generated successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.error(` Failed to generate shotlist: ${errorMessage}`);
            return JSON.stringify({
                success: false,
                error: `Failed to generate shotlist: ${errorMessage}`,
            });
        }

        // Basic mock shotlist for now, ideally parsed from AI response
        const shots: ShotlistEntry[] = state.screenplay.map((s, i) => ({
            id: `shot_${i}`,
            sceneId: s.id,
            shotNumber: i + 1,
            description: `Visualizing: ${s.action}`,
            cameraAngle: "Medium",
            movement: "Static",
            lighting: "Cinematic",
            dialogue: s.dialogue[0]?.text || "",
        }));

        state.shotlist = shots;
        state.currentStep = 'shotlist';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        // Return minimal info - full shotlist is stored in state
        return JSON.stringify({
            success: true,
            shotCount: shots.length,
            message: `Generated ${shots.length} shots across ${state.screenplay.length} scenes.`,
        });
    },
    {
        name: "generate_shotlist",
        description: "Step 4: Create a detailed shotlist/storyboard from the screenplay and characters.",
        schema: z.object({ sessionId: z.string() }),
    }
);

// --- Verify Character Consistency Tool ---

export const verifyCharacterConsistencyTool = tool(
    async ({ sessionId, characterName }) => {
        log.info(` Verifying consistency for ${characterName} in session ${sessionId}`);

        // Try storyModeStore first
        const storyState = storyModeStore.get(sessionId);
        let profileFound: any = storyState?.characters?.find((c: any) => c.name === characterName);
        let imageUrls: string[] = [];

        if (storyState) {
            // In Story Mode, shotlist entries have imageUrls
            imageUrls = storyState.shotlist
                .filter((s: any) => s.imageUrl)
                .map((s: any) => s.imageUrl);
        } else {
            // Fallback to productionStore
            const pState = productionStore.get(sessionId);
            if (pState) {
                profileFound = pState.contentPlan?.characters?.find(c => c.name === characterName);
                if (!profileFound) {
                    profileFound = (pState as any).characters?.find((c: any) => c.name === characterName);
                }
                imageUrls = pState.visuals
                    .filter(v => !v.isPlaceholder)
                    .map(v => v.imageUrl);
            }
        }

        if (!profileFound) {
            const availableChars = storyState?.characters?.map((c: any) => c.name).join(", ") ||
                productionStore.get(sessionId)?.contentPlan?.characters?.map(c => c.name).join(", ") || "None";
            return JSON.stringify({
                success: false,
                error: `Character "${characterName}" not found in session ${sessionId}. Available: ${availableChars}`
            });
        }

        if (imageUrls.length === 0) {
            return JSON.stringify({ 
                success: false, 
                error: "No generated images found for verification. Generate visuals first." 
            });
        }

        // Map internal structure to CharacterProfile expected by service
        const characterToVerify: CharacterProfile = {
            id: profileFound.id || "unknown",
            name: profileFound.name,
            role: profileFound.role || "Character",
            visualDescription: profileFound.visualDescription ||
                `${profileFound.appearance || ""} ${profileFound.clothing || ""}`
        };

        // Detect language for report
        const isArabic = /[\u0600-\u06FF]/.test(characterToVerify.visualDescription + characterToVerify.name);
        const language = isArabic ? 'ar' : 'en';

        const report = await verifyCharacterConsistency(imageUrls, characterToVerify, language);

        return JSON.stringify({
            success: true,
            report
        });
    },
    {
        name: "verify_character_consistency",
        description: "Verifies visual consistency of a character across all generated shots. Returns a report with a score and suggestions.",
        schema: VerifyCharacterConsistencySchema,
    }
);

// --- Story Pipeline Tool (DEPRECATED) ---
//
// IMPORTANT: This tool has been deprecated in favor of the step-by-step workflow.
// The new workflow requires user confirmation between each stage:
// 1. generate_breakdown → User reviews → Proceed
// 2. create_screenplay → User reviews → Lock
// 3. generate_characters → User reviews → Proceed
// 4. generate_shotlist → User reviews → Proceed
// 5. Visual generation (per-scene control)
//
// Do NOT re-enable this tool - it bypasses all user interaction checkpoints.
//
// const StoryPipelineSchema = z.object({...});
// export const runStoryPipelineTool = tool(...);
//
// If you need the old autopilot behavior for testing, use storyPipeline.ts directly.
