/**
 * ContentPlanner Service
 * 
 * LangChain-based orchestration for video content planning.
 * Analyzes topics and content to create structured video plans with:
 * - Scene breakdowns
 * - Visual descriptions
 * - Narration scripts
 * - Timing and pacing
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence, RunnableLambda } from "@langchain/core/runnables";
import { z } from "zod";
import { ContentPlan, Scene, EmotionalTone, TransitionType } from "../types";
import { API_KEY, MODELS } from "./shared/apiClient";
import { getSystemPersona, type Persona } from "./prompt/personaData";
import { getStyleEnhancement, type StyleEnhancement } from "./prompt/styleEnhancements";
import { type VideoPurpose, type LanguageCode, getLanguageName } from "../constants";
import { traceAsync } from "./tracing";
import { getEffectiveLegacyTone } from "./tripletUtils";
import { getVibeTerms, SCENARIO_TEMPLATES } from "./prompt/vibeLibrary";

// --- Zod Schemas ---

/**
 * Available ambient SFX categories for AI to choose from.
 */
const SFX_CATEGORIES = [
    //write more sfx categories
    "scary",
    "haunted-house",    // Spooky/haunted environments
    "desert-wind",      // Desert/sand environments
    "desert-night",     // Quiet desert night
    "ocean-waves",      // Ocean/beach scenes
    "forest-ambience",  // Forest/nature scenes
    "rain-gentle",      // Rainy/cozy scenes
    "thunderstorm",     // Dramatic storm scenes
    "wind-howling",     // Windy/harsh weather
    "city-traffic",     // Urban/city scenes
    "cafe-ambience",    // Indoor social scenes
    "marketplace",      // Busy market/bazaar
    "eerie-ambience",   // Horror/scary scenes
    "mystical-drone",   // Magical/fantasy scenes
    "whispers",         // Ghostly/supernatural
    "heartbeat",        // Tension/suspense
    "tension-drone",    // Building tension
    "hopeful-pad",      // Positive/uplifting
    "epic-strings",     // Dramatic/cinematic
    "middle-eastern",   // Arabic/oriental scenes

] as const;

/**
 * Schema for ContentPlanner output validation.
 * Ensures AI output matches expected structure.
 */
export const ContentPlanSchema = z.object({
    title: z.string().describe("Title of the video content"),
    totalDuration: z.number().describe("Total duration in seconds"),
    targetAudience: z.string().describe("Description of target audience"),
    overallTone: z.string().describe("Overall emotional/stylistic tone"),
    // Character Bible - for consistency across scenes
    characters: z.array(z.object({
        name: z.string().describe("Character name or identifier"),
        appearance: z.string().describe("Detailed physical description: age, skin, hair, eyes, build"),
        clothing: z.string().describe("Specific clothing and accessories"),
        distinguishingFeatures: z.string().optional().describe("Scars, tattoos, jewelry, glasses, etc."),
    })).optional().describe("Character definitions for visual consistency"),
    scenes: z.array(z.object({
        id: z.string().describe("Unique scene identifier"),
        name: z.string().describe("Scene name/title"),
        duration: z.number().describe("Scene duration in seconds"),
        visualDescription: z.string().max(200).describe("Detailed visual description for image/video generation (max 200 chars)"),
        narrationScript: z.string().describe("Narration script to be spoken"),
        emotionalTone: z.enum(["professional", "dramatic", "friendly", "urgent", "calm"]).optional().describe("Legacy emotional tone (fallback)"),
        // Instruction Triplet — preferred over emotionalTone
        instructionTriplet: z.object({
            primaryEmotion: z.string().describe("Core emotional vibe (e.g., 'visceral-dread', 'nostalgic-warmth')"),
            cinematicDirection: z.string().describe("Camera/visual style (e.g., 'slow-push-in', 'dutch-angle')"),
            environmentalAtmosphere: z.string().describe("Ambient texture (e.g., 'foggy-ruins', 'neon-rain')"),
        }).optional().describe("3-axis creative direction (preferred over emotionalTone)"),
        transitionTo: z.enum(["none", "fade", "dissolve", "zoom", "slide"]).optional().describe("Transition to next scene"),
        ambientSfx: z.string().optional().describe("Suggested ambient sound effect ID"),
        // Cinematography fields
        shotType: z.enum(["extreme-close-up", "close-up", "medium", "full", "wide", "extreme-wide"]).optional().describe("Camera shot type"),
        cameraMovement: z.enum(["static", "zoom-in", "zoom-out", "pan", "tracking", "pull-back"]).optional().describe("Camera movement type"),
        lighting: z.string().optional().describe("Lighting description (e.g., 'golden hour', 'harsh overhead', 'neon-lit')"),
    })).min(1).describe("Array of scenes"),
});

export type ContentPlanOutput = z.infer<typeof ContentPlanSchema>;

// --- Configuration ---

export interface ContentPlannerConfig {
    model?: string;
    temperature?: number;
    maxRetries?: number;
    targetDuration?: number; // Target video duration in seconds
    sceneCount?: number; // Desired number of scenes
    videoPurpose?: VideoPurpose; // Video purpose for persona selection
    visualStyle?: string; // Visual style for image generation
    language?: LanguageCode; // Output language for content
}

const DEFAULT_CONFIG: Required<Omit<ContentPlannerConfig, 'videoPurpose' | 'visualStyle' | 'language'>> & { videoPurpose: VideoPurpose; visualStyle: string; language: LanguageCode } = {
    model: MODELS.TEXT,
    temperature: 1.0,  // Higher temperature for more creative output
    maxRetries: 2,
    targetDuration: 60,
    sceneCount: 5,
    videoPurpose: "documentary",
    visualStyle: "cinematic",
    language: "auto",
};

// --- Error Types ---

export class ContentPlannerError extends Error {
    constructor(
        message: string,
        public readonly code: "INVALID_INPUT" | "AI_FAILURE" | "VALIDATION_ERROR" | "TIMEOUT",
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = "ContentPlannerError";
    }
}

// --- Model Initialization ---

function createModel(config: ContentPlannerConfig = {}): ChatGoogleGenerativeAI {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    if (!API_KEY) {
        throw new ContentPlannerError(
            "Gemini API key is not configured",
            "INVALID_INPUT"
        );
    }

    return new ChatGoogleGenerativeAI({
        apiKey: API_KEY,
        model: mergedConfig.model,
        temperature: mergedConfig.temperature,
        maxRetries: mergedConfig.maxRetries,
    });
}

// --- Prompt Template ---

function createContentPlannerTemplate(persona: Persona, style: StyleEnhancement, language: LanguageCode, videoPurpose?: VideoPurpose): ChatPromptTemplate {
    // Build explicit language directive (placed at TOP for maximum visibility)
    const languageDirective = language && language !== 'auto'
        ? `🚨 MANDATORY LANGUAGE REQUIREMENT 🚨
YOU MUST generate ALL text content in ${getLanguageName(language)} (${language}).
This includes: title, scene names, narrationScript, targetAudience, overallTone.
This is NON-NEGOTIABLE. Do NOT translate to English. Output in ${getLanguageName(language)} ONLY.
Exception: visualDescription should remain in English for image generation compatibility.
`
        : `LANGUAGE DETECTION:
- Detect the language of the input topic/content
- Generate ALL text (title, scene names, narrationScript, etc.) in the SAME language as the input
- If input is in Arabic, output ALL text in Arabic
- ONLY visualDescription should remain in English (for image generation)
`;

    // Build persona-specific guidance
    const personaGuidance = `
VISUAL DIRECTOR PERSONA: ${persona.name} (${persona.role})
CORE RULE: ${persona.coreRule}

VISUAL PRINCIPLES:
${persona.visualPrinciples.map(p => `- ${p}`).join('\n')}

AVOID:
${persona.avoidList.map(a => `- ${a}`).join('\n')}`;

    // Build style-specific guidance
    const styleGuidance = `
VISUAL STYLE: ${style.mediumDescription}

STYLE KEYWORDS TO INCORPORATE:
${style.keywords.slice(0, 5).map(k => `- ${k}`).join('\n')}`;

    // Build Instruction Triplet guidance
    const emotionVibes = getVibeTerms("emotion", videoPurpose).map(v => v.id);
    const cinematicVibes = getVibeTerms("cinematic", videoPurpose).map(v => v.id);
    const atmosphereVibes = getVibeTerms("atmosphere", videoPurpose).map(v => v.id);

    const tripletGuidance = `
=== INSTRUCTION TRIPLET SYSTEM (PREFERRED) ===
For each scene, provide an "instructionTriplet" with 3 axes of creative direction:

1. **primaryEmotion** — The core emotional vibe driving the narration voice.
   Available: ${emotionVibes.slice(0, 15).join(', ')}...

2. **cinematicDirection** — The camera/visual style for the scene.
   Available: ${cinematicVibes.slice(0, 15).join(', ')}...

3. **environmentalAtmosphere** — The ambient texture/soundscape of the scene.
   Available: ${atmosphereVibes.slice(0, 15).join(', ')}...

Example:
"instructionTriplet": {
  "primaryEmotion": "visceral-dread",
  "cinematicDirection": "slow-push-in",
  "environmentalAtmosphere": "foggy-ruins"
}

You may ALSO provide "emotionalTone" as a fallback (one of: professional, dramatic, friendly, urgent, calm).
If you provide instructionTriplet, it takes precedence.`;

    // Build scenario engine hint
    const matchedScenario = SCENARIO_TEMPLATES.find(s =>
      videoPurpose === 'horror_mystery' && s.id === 'ghost-protocol' ||
      videoPurpose === 'storytelling' && s.id === 'desert-crossing' ||
      videoPurpose === 'commercial' && s.id === 'neon-descent' ||
      videoPurpose === 'documentary' && s.id === 'silent-signal'
    );
    const scenarioHint = matchedScenario
      ? `\n=== SCENARIO ENGINE ===\nConsider the "${matchedScenario.name}" narrative template: ${matchedScenario.description}\nSuggested arc: ${matchedScenario.arcBeats.map(b => b.beat).join(' → ')}\n`
      : '';

    // TTS-optimized narration style
    const ttsStyleGuidance = `
=== TTS-OPTIMIZED NARRATION STYLE ===
Write narration scripts optimized for text-to-speech delivery:
- Use SHORT, PUNCHY sentences (5-15 words each)
- Embed delivery markers when appropriate:
  [pause: long] — dramatic beat before a reveal
  [emphasis]key phrase[/emphasis] — vocal stress on important words
  [low-tone]dark content[/low-tone] — drop to lower register
  [whisper]secret or intimate[/whisper] — hushed delivery
  [breath] — natural breath for realism
- Open scenes with a HOOK that creates curiosity
- End scenes with a CLIFFHANGER or question that pulls into the next scene
- NEVER end a narration with a generic summary sentence
- Think documentary-mystery style: revelations, not explanations`;

    // Language hybridization rules
    const hybridLanguageNote = `
=== LANGUAGE HYBRIDIZATION ===
- narrationScript: MUST be in the target/detected language
- instructionTriplet values: ALWAYS in English (they are system identifiers)
- visualDescription: ALWAYS in English (for image generation)`;

    return ChatPromptTemplate.fromMessages([
        ["system", `${languageDirective}

You are an expert video content planner, creative director, and master storyteller.
Your job is to take a topic or content and create a detailed, CREATIVE, and ENGAGING video production plan.

${personaGuidance}

${styleGuidance}

${tripletGuidance}
${scenarioHint}
${ttsStyleGuidance}
${hybridLanguageNote}

CREATIVITY GUIDELINES:
- Be IMAGINATIVE and ORIGINAL - don't just state facts, tell a compelling story
- Use vivid, evocative language that paints pictures in the viewer's mind
- Create emotional arcs - build tension, surprise, wonder, or curiosity
- Add unexpected angles, metaphors, or perspectives to make content memorable
- For folklore/stories: bring characters to life, create atmosphere, use sensory details
- For educational content: find the fascinating angle, the "wow" factor
- Think like a filmmaker - what would make this visually stunning and emotionally resonant?

PACING GUIDELINES:
- STANDARD SCENE: aim for 8-12 seconds duration (20-30 words of narration)
- FAST SCENE: aim for 3-5 seconds (5-10 words) for montage/action
- SLOW SCENE: aim for 12-15 seconds max.
- CRITICAL: If a narration segment requires more than 30 words (>12s), you MUST SPLIT IT into two consecutive scenes (e.g., "The Arrival (Part 1)" and "The Arrival (Part 2)").
- NEVER create a single scene longer than 15 seconds (static images become boring).
- VARY THE PACING - don't make every scene the same length
- For Documentary/Educational: Give the viewer time to absorb the visuals (lean towards 10s+)
- For Social Promo: Keep it tighter (5-8s)

AMBIENT SOUND EFFECTS (SFX):
For each scene, suggest an appropriate ambient sound effect from this list:
- "desert-wind" - Wind blowing across sand dunes (for desert/sand scenes)
- "desert-night" - Quiet desert night atmosphere
- "ocean-waves" - Ocean waves on shore (for beach/sea scenes)
- "forest-ambience" - Birds and nature sounds (for forest scenes)
- "rain-gentle" - Soft rain falling (for rainy/cozy scenes)
- "thunderstorm" - Heavy rain with thunder (for dramatic storm scenes)
- "wind-howling" - Strong wind (for harsh weather/mountain scenes)
- "city-traffic" - Urban traffic sounds (for city scenes)
- "cafe-ambience" - Coffee shop atmosphere (for indoor social scenes)
- "marketplace" - Busy market/bazaar sounds (for market scenes)
- "eerie-ambience" - Creepy atmosphere (for horror/scary scenes)
- "mystical-drone" - Ethereal sounds (for magical/fantasy scenes)
- "whispers" - Ghostly whispers (for supernatural scenes)
- "heartbeat" - Tense heartbeat (for suspense scenes)
- "tension-drone" - Building tension music (for thriller scenes)
- "hopeful-pad" - Uplifting ambient (for positive/inspiring scenes)
- "epic-strings" - Cinematic strings (for dramatic moments)
- "middle-eastern" - Arabic/oriental music (for Middle Eastern settings)

Choose the SFX that best matches each scene's mood and setting.

RULES:
1. Break the content into logical scenes that flow naturally with dramatic pacing
2. Each scene should have a clear visual description (max 200 chars) that can be used for image/video generation
3. Write narration scripts that are ENGAGING, POETIC, and match the target audience
4. Assign appropriate emotional tones to guide voice synthesis
5. Ensure pacing creates tension and release - not monotonous
6. Visual descriptions should be CONCRETE, SPECIFIC, and CINEMATIC - describe actual objects, settings, actions, lighting, mood
7. Avoid abstract concepts in visual descriptions - show don't tell
8. Apply the STYLE KEYWORDS to each visual description
9. Choose an appropriate ambientSfx for each scene based on its mood and setting
10. DEFINE A COLOR PALETTE (e.g., "Teal and Orange", "Desaturated Blue") and include color keywords in EVERY visual description to ensure visual cohesion.
11. MAINTAIN ENVIRONMENTAL ANCHORS: If scenes share a location, repeat descriptions of key background elements (e.g., "the cracked wall", "the red neon sign") to ground the viewer.

=== CHARACTER BIBLE (CRITICAL FOR CONSISTENCY) ===
If your story features recurring characters:
1. BEFORE writing scenes, define each character's EXACT appearance:
   - Face: age, skin tone, facial features, expressions
   - Hair: color, length, style, texture
   - Body: build, height, posture
   - Clothing: specific garments, colors, materials, accessories
   - Distinguishing marks: scars, tattoos, jewelry, glasses
2. In EVERY scene featuring that character, include their KEY identifiers
3. Use the EXACT SAME descriptors - "young woman with curly auburn hair and emerald eyes wearing a vintage blue dress" - not just "the woman"
4. Character descriptions should be 15-20 words minimum in each visualDescription

=== CINEMATOGRAPHY VOCABULARY (USE IN visualDescription) ===
SHOT TYPES (Vary these):
- "Extreme close-up" - eyes, hands, small details (emotion, mystery)
- "Close-up" - face (intimacy, dialogue)
- "Medium shot" - waist up (action, interaction)
- "Wide shot" - character in environment (context)
- "Extreme wide shot" - vast landscape (scale, isolation)
- "Low angle" - looking up (power, dominance, awe)
- "High angle" - looking down (vulnerability)
- "Dutch angle" - tilted (unease, disorientation)

CAMERA MOVEMENT (CRITICAL FOR VIDEO):
- "Slow push-in" - increasing focus/tension
- "Slow pull-back" - revealing context/surprise
- "Truck left/right" - moving alongside character
- "Pan left/right" - surveying a landscape
- "Tilt up/down" - revealing vertical scale (buildings, trees)
- "Tracking shot" - following a moving subject
- "Static tripod" - stillness, contemplation
- "Handheld float" - subtle organic movement (reality/documentary)

COMPOSITION:
- "Rule of thirds" - balanced framing
- "Center framing" - symmetry/power
- "Leading lines" - depth/perspective
- "Depth of field" - blurry background (bokeh) to isolate subject

LIGHTING:
- "Golden hour" - warm, sun-flare, magical
- "Blue hour" - cold, pre-dawn, mysterious
- "Volumetric lighting" - god rays, atmosphere
- "Cinematic rim light" - separation from background
- "Soft window light" - natural, intimate
- "Neon noir" - contrasty, colorful, urban

=== "SHOW DON'T TELL" ENFORCEMENT ===
NEVER describe emotions directly. Instead, show through visual cues:

BAD (Narrating emotion):
- "He was nervous" → 
GOOD (Showing emotion):
- Visual: "Close-up of hands fidgeting with coffee cup, eyes darting to door"

BAD: "She was exhausted" →
GOOD: Visual: "Medium shot of woman slumped in chair, heavy eyelids, hair disheveled"

BAD: "The town was abandoned" →
GOOD: Visual: "Wide shot of empty street, broken windows, weeds through cracked pavement"

BAD: "He felt hopeful" →
GOOD: Visual: "Low angle of man looking up at sunrise, slight smile forming"

BAD: "The atmosphere was tense" →
GOOD: Visual: "Close-up of white-knuckled grip on steering wheel, sweat on brow"

=== NARRATION "SHOW DON'T TELL" (for narrationScript) ===
narrationScript will be spoken as voiceover. The viewer HEARS the narration while SEEING the visuals.
Write narration that describes what the VIEWER SEES — sensory, cinematic, grounded.

BAD narration: "He felt overwhelming fear as the situation became dangerous."
GOOD narration: "His breath caught. The corridor stretched into shadow, and something moved."

BAD narration: "She was very happy to see her old friend again."
GOOD narration: "Her eyes widened. A laugh escaped — the kind that shakes your whole body."

BAD narration: "The village had been abandoned for many years."
GOOD narration: "Dust coated every surface. A child's shoe lay in the doorway, sun-bleached and cracked."

RULES for narrationScript:
- Describe what the camera CAPTURES: movement, light, texture, sound
- Use concrete sensory details, not abstract emotional labels
- Short declarative sentences hit harder than long explanations
- Let the visuals carry the emotion — narration adds texture, not exposition

=== VISUAL VARIETY CHECKLIST ===
Across your scenes, ensure you have:
- [ ] At least ONE extreme close-up (detail shot)
- [ ] At least ONE wide/establishing shot
- [ ] Mix of camera angles (not all eye-level)
- [ ] Variety in lighting conditions
- [ ] Different character poses/actions
- [ ] Environmental variety (indoor/outdoor, close/distant)

CRITICAL - LANGUAGE RULES:
- DETECT the language of the input topic/content
- ALL text output (title, scene names, narrationScript, targetAudience, overallTone) MUST be in the SAME LANGUAGE as the input
- If input is in Arabic, output ALL text in Arabic
- If input is in Spanish, output ALL text in Spanish
- If input is in French, output ALL text in French
- And so on for any language
- ONLY the visualDescription should remain in English (for image generation compatibility)
- This is MANDATORY - never translate the user's language to English

CRITICAL - NARRATION LENGTH RULES:
- Speaking rate is approximately 2.5 words per second
- For a 10 second scene, narration should be ~25 words MAX
- For a 15 second scene, narration should be ~37 words MAX
- KEEP NARRATION SCRIPTS SHORT AND PUNCHY
- Each scene's narrationScript MUST fit within its duration
- For longer videos (e.g. 180s), increase the number of scenes and ensure narration fills at least 70% of the scene duration to avoid large silence gaps.

OUTPUT FORMAT:
Return a valid JSON object matching this structure:
{{
  "title": "Video Title (in input language)",
  "totalDuration": 60,
  "targetAudience": "General audience description (in input language)",
  "overallTone": "Professional and educational (in input language)",
  "scenes": [
    {{
      "id": "scene-1",
      "name": "Introduction (in input language)",
      "duration": 10,
      "visualDescription": "Close-up of coffee beans being poured into a grinder, warm morning light, ${style.keywords[0]} (ALWAYS IN ENGLISH)",
      "narrationScript": "Narration text in the SAME language as the input topic",
      "emotionalTone": "friendly",
      "instructionTriplet": {{
        "primaryEmotion": "nostalgic-warmth",
        "cinematicDirection": "slow-push-in",
        "environmentalAtmosphere": "golden-hour-decay"
      }},
      "transitionTo": "dissolve",
      "ambientSfx": "cafe-ambience"
    }}
  ]
}}`],
        ["human", `Create a CREATIVE and ENGAGING video content plan for the following:

TOPIC/CONTENT:
{content}

TARGET DURATION: {targetDuration} seconds
TARGET SCENE COUNT: {sceneCount} scenes
TARGET AUDIENCE: {targetAudience}

IMPORTANT: 
1. Keep each scene's narration script SHORT. Calculate word count as: (scene_duration * 2.5). 
   For example, a 10-second scene should have at most 25 words of narration.
2. CRITICAL: Detect the language of the TOPIC/CONTENT above and generate ALL text (title, scene names, narrationScript, targetAudience, overallTone) in that SAME language. Only visualDescription should be in English.
3. Be CREATIVE - use vivid imagery, emotional storytelling, and unexpected angles. Make it memorable!

Apply ${persona.name}'s visual principles and use ${style.mediumDescription} style in all visual descriptions.

Generate a complete content plan with detailed scenes.`],
    ]);
}

// --- Chain Creation ---

function createContentPlannerChain(config?: ContentPlannerConfig) {
    const model = createModel(config);

    // Get persona and style based on config
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const persona = getSystemPersona(mergedConfig.videoPurpose);
    const style = getStyleEnhancement(mergedConfig.visualStyle);

    const template = createContentPlannerTemplate(persona, style, mergedConfig.language, mergedConfig.videoPurpose);

    return RunnableSequence.from([
        template,
        model,
        new RunnableLambda({
            func: async (message: unknown): Promise<ContentPlanOutput> => {
                const content = typeof message === "object" && message !== null && "content" in message
                    ? String((message as { content: unknown }).content)
                    : String(message);

                // Clean the response
                const jsonStr = content
                    .replace(/^```json\s*/i, "")
                    .replace(/^```\s*/i, "")
                    .replace(/```$/i, "")
                    .trim();

                try {
                    const parsed = JSON.parse(jsonStr);

                    // Normalize values before validation
                    const validTones = ["professional", "dramatic", "friendly", "urgent", "calm"];
                    const validTransitions = ["none", "fade", "dissolve", "zoom", "slide"];

                    if (parsed.scenes && Array.isArray(parsed.scenes)) {
                        parsed.scenes = parsed.scenes.map((scene: any) => {
                            // Normalize emotionalTone if present
                            const normalizedTone = validTones.includes(scene.emotionalTone?.toLowerCase?.())
                                ? scene.emotionalTone.toLowerCase()
                                : undefined;

                            // Preserve instructionTriplet if provided
                            const instructionTriplet = scene.instructionTriplet && typeof scene.instructionTriplet === 'object'
                                ? {
                                    primaryEmotion: String(scene.instructionTriplet.primaryEmotion || "nostalgic-warmth"),
                                    cinematicDirection: String(scene.instructionTriplet.cinematicDirection || "handheld-float"),
                                    environmentalAtmosphere: String(scene.instructionTriplet.environmentalAtmosphere || "golden-hour-decay"),
                                }
                                : undefined;

                            // Effective tone for transition selection
                            const effectiveTone = normalizedTone || "friendly";

                            return {
                                ...scene,
                                // Truncate visualDescription to 200 chars max (AI sometimes gets creative)
                                visualDescription: scene.visualDescription?.length > 200
                                    ? scene.visualDescription.substring(0, 197) + "..."
                                    : scene.visualDescription,
                                emotionalTone: normalizedTone,
                                instructionTriplet,
                                // Intelligent transition selection based on emotional tone
                                transitionTo: (() => {
                                    if (scene.transitionTo && validTransitions.includes(scene.transitionTo?.toLowerCase?.())) {
                                        return scene.transitionTo.toLowerCase();
                                    }
                                    const moodTransitionMap: Record<string, string> = {
                                        'dramatic': 'dissolve',
                                        'urgent': 'none',
                                        'calm': 'fade',
                                        'friendly': 'slide',
                                        'professional': 'dissolve',
                                    };
                                    return moodTransitionMap[effectiveTone] || 'dissolve';
                                })(),
                                // Validate ambientSfx against known categories
                                ambientSfx: scene.ambientSfx && (SFX_CATEGORIES as readonly string[]).includes(scene.ambientSfx)
                                    ? scene.ambientSfx
                                    : undefined,
                            };
                        });
                    }

                    const validated = ContentPlanSchema.parse(parsed);

                    // Post-process: generate IDs and CALCULATE duration using smart algorithm
                    // Considers: narration length, content complexity, emotional weight, visual action
                    let totalDuration = 0;
                    validated.scenes = validated.scenes.map((scene, index) => {
                        const words = scene.narrationScript.split(/\s+/).length;

                        // Base duration: 2.5 words per second
                        let baseDuration = words / 2.5;

                        // --- Smart Duration Multipliers ---

                        // 1. Complexity bonus: Technical/educational content needs more time
                        const complexPatterns = /\b(therefore|consequently|furthermore|however|specifically|approximately|essentially|fundamentally|\d+%|\d{4}|century|million|billion)\b/gi;
                        const complexMatches = scene.narrationScript.match(complexPatterns) || [];
                        const complexityMultiplier = 1 + (complexMatches.length * 0.05); // +5% per complex term

                        // 2. Emotional weight: Dramatic scenes benefit from longer pauses
                        const emotionalMultipliers: Record<string, number> = {
                            'dramatic': 1.25,    // 25% longer for dramatic impact
                            'calm': 1.15,        // 15% longer for contemplative mood
                            'urgent': 0.85,      // 15% shorter for urgency
                            'professional': 1.0,
                            'friendly': 1.0,
                        };
                        // Use getEffectiveLegacyTone for scenes with triplet or legacy tone
                        const sceneTone = getEffectiveLegacyTone(scene as Scene);
                        const emotionalMultiplier = emotionalMultipliers[sceneTone] || 1.0;

                        // 3. Action intensity: Fast-paced visual content = shorter scenes
                        const actionPatterns = /\b(explode|run|chase|fight|crash|fall|jump|speed|rush|race|attack|escape|sprint|collide)\b/gi;
                        const actionMatches = scene.visualDescription.match(actionPatterns) || [];
                        const actionMultiplier = actionMatches.length > 0 ? 0.8 : 1.0; // 20% shorter for action

                        // Apply all multipliers
                        const smartDuration = baseDuration * complexityMultiplier * emotionalMultiplier * actionMultiplier;

                        // Clamp to valid range: min 5s, max 15s (avoid boring static images)
                        const calculatedDuration = Math.max(5, Math.min(15, Math.ceil(smartDuration) + 1));

                        console.log(`[ContentPlanner] Scene ${index + 1}: ${words} words, ${sceneTone} → ${calculatedDuration}s (complexity: x${complexityMultiplier.toFixed(2)}, emotion: x${emotionalMultiplier}, action: x${actionMultiplier})`);
                        totalDuration += calculatedDuration;

                        return {
                            ...scene,
                            id: scene.id || `scene-${index + 1}`,
                            duration: calculatedDuration,
                        };
                    });

                    // Update total duration
                    validated.totalDuration = totalDuration;
                    console.log(`[ContentPlanner] Total calculated duration: ${totalDuration}s`);

                    return validated;
                } catch (error) {
                    console.error("[ContentPlanner] Parse/validation error:", error);
                    console.error("[ContentPlanner] Raw content:", content.substring(0, 500));
                    throw new ContentPlannerError(
                        `Failed to parse content plan: ${error instanceof Error ? error.message : String(error)}`,
                        "VALIDATION_ERROR",
                        error instanceof Error ? error : undefined
                    );
                }
            },
        }),
    ]);
}

// --- Main API ---

/**
 * Generate a content plan from a topic or content.
 * 
 * @param content - The topic/content to plan (e.g., "How to make coffee")
 * @param options - Configuration options
 * @returns A structured ContentPlan with scenes
 */
export const generateContentPlan = traceAsync(
    async function generateContentPlanImpl(
        content: string,
        options: {
            targetDuration?: number;
            sceneCount?: number;
            targetAudience?: string;
            config?: ContentPlannerConfig;
        } = {}
    ): Promise<ContentPlan> {
        const {
            targetDuration = 60,
            sceneCount = 5,
            targetAudience = "General audience",
            config,
        } = options;

        if (!content?.trim()) {
            throw new ContentPlannerError(
                "Content is required for planning",
                "INVALID_INPUT"
            );
        }

        console.log("[ContentPlanner] Generating plan for:", content.substring(0, 100));

        const chain = createContentPlannerChain(config);

        try {
            const result = await chain.invoke({
                content,
                targetDuration,
                sceneCount,
                targetAudience,
            });

            console.log(`[ContentPlanner] Generated ${result.scenes.length} scenes, total duration: ${result.totalDuration}s`);

            // Convert to ContentPlan type
            return {
                title: result.title,
                totalDuration: result.totalDuration,
                targetAudience: result.targetAudience,
                overallTone: result.overallTone,
                scenes: result.scenes.map((scene): Scene => ({
                    id: scene.id,
                    name: scene.name,
                    duration: scene.duration,
                    visualDescription: scene.visualDescription,
                    narrationScript: scene.narrationScript,
                    emotionalTone: (scene.emotionalTone as EmotionalTone | undefined),
                    instructionTriplet: scene.instructionTriplet,
                    transitionTo: scene.transitionTo as TransitionType | undefined,
                    ambientSfx: scene.ambientSfx,
                })),
            };
        } catch (error) {
            if (error instanceof ContentPlannerError) {
                throw error;
            }

            console.error("[ContentPlanner] Chain execution failed:", error);
            throw new ContentPlannerError(
                `Content planning failed: ${error instanceof Error ? error.message : String(error)}`,
                "AI_FAILURE",
                error instanceof Error ? error : undefined
            );
        }
    },
    "generateContentPlan",
    {
        runType: "chain",
        metadata: { service: "contentPlanner" },
        tags: ["langchain", "content-planning"],
    }
);

/**
 * Calculate suggested scene count based on target duration.
 * Rule of thumb: 1 scene per 10-15 seconds
 */
export function suggestSceneCount(targetDurationSeconds: number): number {
    const minScenes = 3;
    const maxScenes = 20;
    const secondsPerScene = 12; // Average scene duration

    const suggested = Math.round(targetDurationSeconds / secondsPerScene);
    return Math.max(minScenes, Math.min(maxScenes, suggested));
}

/**
 * Validate a ContentPlan for completeness.
 */
export function validateContentPlan(plan: ContentPlan): {
    valid: boolean;
    issues: string[];
} {
    const issues: string[] = [];

    if (!plan.title) issues.push("Missing title");
    if (!plan.scenes.length) issues.push("No scenes defined");

    let totalDuration = 0;
    plan.scenes.forEach((scene, index) => {
        totalDuration += scene.duration;
        if (!scene.visualDescription) {
            issues.push(`Scene ${index + 1}: Missing visual description`);
        }
        if (!scene.narrationScript) {
            issues.push(`Scene ${index + 1}: Missing narration script`);
        }
        if (scene.duration <= 0) {
            issues.push(`Scene ${index + 1}: Invalid duration`);
        }
    });

    // Check if total duration is reasonably close to plan's totalDuration
    const durationDiff = Math.abs(totalDuration - plan.totalDuration);
    if (durationDiff > 10) {
        issues.push(`Total scene duration (${totalDuration}s) differs significantly from plan duration (${plan.totalDuration}s)`);
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}
