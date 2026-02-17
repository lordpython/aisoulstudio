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
import { withAILogging } from "../../../aiLogService";
import { StoryModeSchema, VerifyCharacterConsistencySchema, type StoryModeState } from "../types";
import { storyModeStore, productionStore } from "../store";
import { verifyCharacterConsistency } from "../../../visualConsistencyService";
import { type ScreenplayScene, type ShotlistEntry, type CharacterProfile } from "../../../../types";

const log = agentLogger.child('Production');

/**
 * Strip markdown formatting from LLM-generated text.
 * Removes **bold**, *italic*, # headings, `code`, and bullet markers.
 */
function stripMarkdown(text: string): string {
    return text
        .replace(/#{1,6}\s+/g, '')          // # headings
        .replace(/\*\*([^*]*?)\*\*/g, '$1') // **bold** → content
        .replace(/\*([^*]*?)\*/g, '$1')     // *italic* → content
        .replace(/`([^`]*?)`/g, '$1')       // `code` → content
        .replace(/^\s*[-*+]\s+/gm, '')      // bullet markers
        .replace(/\s{2,}/g, ' ')            // collapse whitespace
        .trim();
}

/**
 * Detect if a string looks like a scene heading (INT./EXT.) rather than a character name.
 * LLMs sometimes put scene headings in the speaker field.
 */
function isSceneHeading(text: string): boolean {
    const trimmed = text.trim();
    // Scene headings start with INT./EXT., or the field has more than 4 words (it's a description, not a name)
    return /^(INT\.|EXT\.)/i.test(trimmed)
        || trimmed.length > 30
        || trimmed.split(/\s+/).length > 4;
}

/**
 * Filter out invalid dialogue entries where the LLM confused speaker/description fields.
 * Keeps only entries with short, valid speaker names and non-empty text.
 */
function sanitizeDialogue(
    entries: Array<{ speaker: string; text: string }>
): Array<{ speaker: string; text: string }> {
    return entries
        .map(d => {
            if (!d.speaker || !d.text) return null;
            if (isSceneHeading(d.speaker)) {
                // Recover: treat the misplaced content as Narrator text
                const rescuedText = d.text && d.text.trim().length > 5 ? d.text : d.speaker;
                return { speaker: 'Narrator', text: stripMarkdown(rescuedText) };
            }
            return d;
        })
        .filter((d): d is { speaker: string; text: string } => d !== null && d.text.trim().length > 0);
}

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

        // Detect Arabic topic to use language-appropriate prompt and markers
        const isArabicTopic = /[\u0600-\u06FF]/.test(topic);

        const prompt = isArabicTopic
            ? `أنشئ تفصيلًا سرديًا لقصة فيديو عن: "${topic}".
قسّمها إلى 3-5 فصول أو مشاهد متميزة. لكل فصل، قدّم:
1. العنوان (بعد كلمة "مشهد" ورقمه، مثال: مشهد ١: العنوان)
2. السرد: جملتان تصفان ما يحدث بصريًا (لا تستخدم عناوين مثل "الخطاف العاطفي" أو "النقطة السردية" — اكتب السرد مباشرة)

نسّق كقائمة مرقّمة باستخدام الأرقام العربية (١، ٢، ٣...).`
            : `Create a narrative breakdown for a video story about: "${topic}".
Divide it into 3-5 distinct acts or chapters. For each act, provide:
1. Title
2. NARRATIVE: 2-3 sentences describing what happens visually (do NOT include labels like "Emotional Hook:" or "Key Beat:" — write the narrative directly)

Format as a structured list.`;

        let breakdown: string;
        try {
            log.info(' Invoking Gemini API for story breakdown...');
            const response = await withAILogging(
                id,
                'breakdown',
                MODELS.TEXT_EXP,
                prompt,
                () => model.invoke(prompt),
                (r) => typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
            );
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

        // Detect Arabic content to use appropriate scene markers
        const isArabicContent = /[\u0600-\u06FF]/.test(state.breakdown);

        const prompt = isArabicContent
            ? `اكتب سيناريو سينمائي قصير بناءً على هذا التفصيل:
${state.breakdown}

نسّق كل مشهد كالتالي:
- مشهد [الرقم]: [العنوان]
- الحدث: [الوصف]
- الحوار: [الشخصية]: [النص]

قواعد مهمة لسطر الحدث:
- أسطر الحدث تصف ما تراه الكاميرا، وليس المشاعر الداخلية.
- ستُستخدم كتعليق صوتي — اجعلها حية وسينمائية.
- صِف التفاصيل الحسية: الأصوات، الملمس، الحركة، الضوء، اللون.
- لا تستخدم تنسيق markdown (بدون ** أو * أو # أو backticks).

حدّد 3-5 مشاهد.`
            : `Write a short cinematic screenplay based on this breakdown:
${state.breakdown}

Format each scene with:
- SCENE [Number]: [Heading]
- ACTION: [Description]
- DIALOGUE: [Character]: [Text]

IMPORTANT — ACTION LINE RULES:
- ACTION lines describe what the CAMERA SEES, not internal emotions.
- These lines will be used as voiceover narration — make them vivid and cinematic.
- BAD: "He felt fear." / "She was overwhelmed with sadness."
- GOOD: "His hands trembled. The door creaked open, revealing darkness." / "Tears rolled down her cheeks as rain hammered the window."
- Describe sensory details: sounds, textures, movement, light, color.
- NEVER use markdown formatting (no **, *, #, or backticks).

Limit to 3-5 scenes.`;

        let scriptText: string;
        try {
            log.info(' Invoking Gemini API for screenplay...');
            const response = await withAILogging(
                sessionId,
                'screenplay',
                MODELS.TEXT_EXP,
                prompt,
                () => model.invoke(prompt),
                (r) => typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
            );
            scriptText = stripMarkdown(response.content as string);
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
        // Supports English "SCENE 1:" and Arabic "مشهد ١:" / "المشهد ١:" markers
        // with ASCII digits (0-9), Arabic-Indic (٠-٩), and Extended Arabic-Indic (۰-۹)
        const scenes: ScreenplayScene[] = [];
        const sceneBlocks = scriptText.split(/(?:SCENE|مشهد|المشهد)\s+[0-9\u0660-\u0669\u06F0-\u06F9]+\s*:/i).filter(b => b.trim());

        sceneBlocks.forEach((block, i) => {
            const lines = block.split('\n').filter(l => l.trim());
            const heading = lines[0] || 'Untitled Scene';
            // Match ACTION:/الحدث: prefix regardless of residual markdown wrapping
            const actionPattern = /^(\*{0,2})(ACTION|الحدث)(\*{0,2})\s*:/i;
            const dialogueLabelPattern = /^(\*{0,2})(DIALOGUE|الحوار)(\*{0,2})\s*:/i;
            const actionLines = lines.filter(l => actionPattern.test(l.trim()));
            const dialogueLines = lines.filter(l => {
                const trimmed = l.trim();
                // Skip action lines and bare labels
                if (actionPattern.test(trimmed)) return false;
                if (dialogueLabelPattern.test(trimmed)) return false;
                return trimmed.includes(':');
            });

            // Extract action text, stripping label prefix (English or Arabic)
            const actionText = actionLines
                .map(l => l.replace(/^(\*{0,2})(ACTION|الحدث)(\*{0,2})\s*:\s*/i, '').trim())
                .join(' ');

            // Extract character names from dialogue speakers and name mentions in action
            const speakers = dialogueLines
                .map(l => {
                    const [speaker] = l.split(':');
                    return (speaker || '').replace(/^(\*{0,2})(DIALOGUE|الحوار)(\*{0,2})\s*/i, '').trim();
                })
                .filter(s => s && s.length > 0 && s.length < 50);
            const uniqueCharacters = [...new Set(speakers)];

            const rawDialogue = dialogueLines.map(l => {
                const [speaker, ...text] = l.split(':');
                return { speaker: (speaker || "").trim(), text: text.join(':').trim() };
            });

            scenes.push({
                id: `scene_${i}`,
                sceneNumber: i + 1,
                heading: heading.replace(/(\*{0,2})(ACTION|DIALOGUE|الحدث|الحوار)(\*{0,2})\s*:/gi, '').trim(),
                action: actionText,
                dialogue: sanitizeDialogue(rawDialogue),
                charactersPresent: uniqueCharacters,
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

        const characters = await extractCharacters(scriptText, sessionId);
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
        if (!state.screenplay || state.screenplay.length === 0) {
            return JSON.stringify({ success: false, error: "Screenplay is empty. Create screenplay first." });
        }

        log.info(` Generating shotlist for: ${sessionId}`);

        try {
            const { breakAllScenesIntoShots } = await import("../../shotBreakdownAgent");

            const genre = 'Drama'; // Default genre; ideally passed from session state
            const rawShots = await breakAllScenesIntoShots(
                state.screenplay,
                genre,
                (sceneIndex, totalScenes) => {
                    log.info(` Shotlist progress: scene ${sceneIndex + 1}/${totalScenes}`);
                },
                sessionId,
            );

            // Convert Shot[] to ShotlistEntry[]
            const shots: ShotlistEntry[] = rawShots.map(shot => ({
                id: shot.id,
                sceneId: shot.sceneId,
                shotNumber: shot.shotNumber,
                description: shot.description,
                cameraAngle: shot.cameraAngle,
                movement: shot.movement,
                lighting: shot.lighting,
                dialogue: "",
            }));

            state.shotlist = shots;
            state.currentStep = 'shotlist';
            state.updatedAt = Date.now();
            storyModeStore.set(sessionId, state);

            return JSON.stringify({
                success: true,
                shotCount: shots.length,
                message: `Generated ${shots.length} shots across ${state.screenplay.length} scenes.`,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.error(` Failed to generate shotlist: ${errorMessage}`);
            return JSON.stringify({
                success: false,
                error: `Failed to generate shotlist: ${errorMessage}`,
            });
        }
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
