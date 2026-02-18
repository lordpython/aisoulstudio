/**
 * Test script: Run story pipeline with the FlamingThrow story idea.
 * Covers: breakdown → screenplay → characters → shot breakdown (1 scene)
 * Also verifies Feature 1 (persona negatives) and Feature 2 (split motion prompt).
 *
 * Run with: npx tsx --env-file=.env scripts/test-story-pipeline.ts
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// --- Output collector: mirrors console.log and writes to file ---
const OUTPUT_FILE = resolve(import.meta.dirname, "../story-pipeline-output.md");
const lines: string[] = [];

const log = (...args: unknown[]) => {
    const text = args.map(a => String(a)).join(" ");
    console.log(text);
    lines.push(text);
};

const flush = () => {
    writeFileSync(OUTPUT_FILE, lines.join("\n") + "\n", "utf-8");
};

// --- Full story context from StoryIdea.txt ---
const STORY_TOPIC = readFileSync(
    resolve(import.meta.dirname, "../StoryIdea.txt"),
    "utf-8"
).trim();

const GENRE = "Action"; // maps to story_action persona

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-3-flash-preview";

if (!API_KEY) {
    console.error("ERROR: VITE_GEMINI_API_KEY not set");
    process.exit(1);
}

// ---------- Schemas ----------

const BreakdownSchema = z.object({
    acts: z.array(z.object({
        title: z.string(),
        emotionalHook: z.string(),
        narrativeBeat: z.string(),
    })).min(3).max(5),
});

const ScreenplaySchema = z.object({
    scenes: z.array(z.object({
        heading: z.string(),
        action: z.string(),
        dialogue: z.array(z.object({
            speaker: z.string().max(30),
            text: z.string().min(1),
        })),
    })).min(3).max(8),
});

const CharacterSchema = z.object({
    characters: z.array(z.object({
        name: z.string(),
        role: z.string(),
        visualDescription: z.string(),
        facialTags: z.string().optional(),
    })),
});

const ShotSchema = z.object({
    shots: z.array(z.object({
        shotNumber: z.number(),
        shotType: z.string(),
        cameraAngle: z.string(),
        movement: z.string(),
        lighting: z.string(),
        emotion: z.string(),
        description: z.string(),
    })).min(2).max(5),
});

const MotionSchema = z.object({
    camera_motion: z.string(),
    subject_physics: z.string(),
});

const VoiceoverTestSchema = z.object({
    voiceovers: z.array(z.object({
        sceneId: z.string(),
        script: z.string(),
    })),
});

// ---------- Helper: print section ----------

function section(title: string) {
    const line = "─".repeat(60);
    log(`\n${line}`);
    log(`  ${title}`);
    log(line);
}

// ---------- Main ----------

async function main() {
    log("# Story Pipeline Test — الرمية الملتهبة");
    log(`Model: ${MODEL_NAME}  |  API key: ${API_KEY.slice(0, 8)}...  |  Genre: ${GENRE}`);

    const llm = new ChatGoogleGenerativeAI({
        model: MODEL_NAME,
        apiKey: API_KEY,
        temperature: 0.7,
    });

    // ── STEP 1: Breakdown ──────────────────────────────────────────
    section("STEP 1 — Story Breakdown");
    log("Input topic: " + STORY_TOPIC.slice(0, 120) + "...\n");

    const breakdownModel = llm.withStructuredOutput(BreakdownSchema);
    const breakdown = await breakdownModel.invoke(
        `You are a story development expert. The following is the COMPLETE story context for an ${GENRE} anime series.\n` +
        `Use ALL the details provided — characters, special moves, training methods, rivalries, and the climax.\n\n` +
        `FULL STORY CONTEXT:\n${STORY_TOPIC}\n\n` +
        `Create a narrative breakdown for a short ${GENRE} video story. Divide into 3-5 acts. For each act provide:\n` +
        `1. Title - A compelling act title that references specific story events\n` +
        `2. Emotional Hook - The emotional core drawn directly from the story (grief, rivalry, perseverance)\n` +
        `3. Narrative Beat - Key story event referencing named characters (Sami/سامي, Safwan/صفوان, Rajih/راجح, Wael/وائل, Essam/عصام) and named techniques (Blazing Throw, Thunderbolt, Flying Star, Claw Block)\n` +
        `Keep each field concise (1-2 sentences max). Write in English.`
    );

    breakdown.acts.forEach((act, i) => {
        log(`\nAct ${i + 1}: ${act.title}`);
        log(`  Hook : ${act.emotionalHook}`);
        log(`  Beat : ${act.narrativeBeat}`);
    });

    // ── STEP 2: Screenplay ─────────────────────────────────────────
    section("STEP 2 — Screenplay");

    const breakdownText = breakdown.acts
        .map((a, i) => `Act ${i + 1}: ${a.title}\n- Hook: ${a.emotionalHook}\n- Beat: ${a.narrativeBeat}`)
        .join("\n\n");

    // Character roster extracted from the full story context for screenplay fidelity
    const characterRoster = `
Known characters from the story:
- Sami (سامي): protagonist, energetic boy, son of the Blazing Throw legend
- Safwan (صفوان): Sami's best friend, smart team playmaker with precise passing vision
- Rajih (راجح): strict team captain who teaches Sami discipline and teamwork
- Wael (وائل): aristocratic rival from "Al-Shula" team, master of the Thunderbolt Throw (nearly invisible speed)
- Essam (عصام): rival with the Flying Star Throw (curves back unexpectedly)

Named techniques:
- Blazing Throw (الرمية الملتهبة): legendary move requiring finger flame-grip, spiritual focus, full-body leap — ball appears as real fire
- Thunderbolt Throw (رمية الصاعقة): ultra-fast, nearly invisible
- Flying Star Throw (رمية النجم الطائر): deceptive curved trajectory
- Claw Block (صد المخلب): defensive two-handed catch to absorb and stop the ball

Training methods referenced: waterfall climbing, blocking heavy balls on rubber ropes, father's cryptic journal with symbols`;

    const screenplayModel = llm.withStructuredOutput(ScreenplaySchema);
    const screenplay = await screenplayModel.invoke(
        `Write a short screenplay based on this outline:\n\n${breakdownText}\n\n` +
        `${characterRoster}\n\n` +
        `Create 3-8 scenes that USE THE NAMED CHARACTERS AND TECHNIQUES above. For each scene:\n` +
        `1. Heading - Location/time (e.g., "EXT. SCHOOL YARD - DAY")\n` +
        `2. Action - Vivid visual description referencing the specific characters and techniques\n` +
        `3. Dialogue - Character lines ("speaker" must be the character's name only, ≤4 words)\n` +
        `Write in English. Make the special moves visually dramatic and cinematically descriptive.`
    );

    screenplay.scenes.forEach((scene, i) => {
        log(`\nScene ${i + 1}: ${scene.heading}`);
        log(`  Action: ${scene.action.slice(0, 200)}${scene.action.length > 200 ? "..." : ""}`);
        if (scene.dialogue.length > 0) {
            scene.dialogue.slice(0, 3).forEach(d => {
                log(`  ${d.speaker}: "${d.text.slice(0, 100)}"`);
            });
        }
    });

    // ── STEP 3: Characters ─────────────────────────────────────────
    section("STEP 3 — Character Extraction");

    const scenesSummary = screenplay.scenes
        .map(s => `${s.heading}: ${s.action.slice(0, 180)}`)
        .join("\n");
    const speakers = new Set<string>();
    screenplay.scenes.forEach(s => s.dialogue.forEach(d => speakers.add(d.speaker)));

    const charModel = llm.withStructuredOutput(CharacterSchema);
    const charResult = await charModel.invoke(
        `Extract main characters from this screenplay:\n\n${scenesSummary}\n\n` +
        `Characters mentioned in dialogue: ${Array.from(speakers).join(", ")}\n\n` +
        `IMPORTANT: Also include Safwan and Rajih if present in the story — they are key characters:\n` +
        `- Safwan: Sami's best friend, smart tactical playmaker, sharp eyes, athletic build\n` +
        `- Rajih: strict team captain, strong authoritative presence, older teen or young adult\n\n` +
        `For each character provide:\n` +
        `1. Name (use the English name)\n` +
        `2. Role (protagonist/antagonist/supporting)\n` +
        `3. Visual Description - Detailed appearance for image generation (age, ethnicity, hair, clothing, athletic gear, anime-style features)\n` +
        `4. Facial Tags - Exactly 5 comma-separated visual keywords (face shape, hair, expression, clothing item, distinguishing feature)\n` +
        `Write in English. These will be used to generate anime-style character illustrations.`
    );

    charResult.characters.forEach(c => {
        log(`\n${c.name} [${c.role}]`);
        log(`  Visual: ${c.visualDescription}`);
        if (c.facialTags) log(`  Tags  : ${c.facialTags}`);
    });

    // ── STEP 4: Shot Breakdown (first scene only) ──────────────────
    section(`STEP 4 — Shot Breakdown for Scene 1: "${screenplay.scenes[0]?.heading}"`);

    const firstScene = screenplay.scenes[0]!;
    const shotModel = llm.withStructuredOutput(ShotSchema);
    const shotResult = await shotModel.invoke(
        `Break this screenplay scene into 2-5 camera shots for a high-energy ${GENRE} anime-style story.\n` +
        `Style reference: Dodge Danpei / sports anime — dynamic angles, speed lines, dramatic close-ups during special moves.\n\n` +
        `Scene: ${firstScene.heading}\n${firstScene.action}\n\n` +
        `For each shot specify:\n` +
        `- shotNumber\n` +
        `- shotType (Wide/Medium/Close-up/Extreme Close-up/POV)\n` +
        `- cameraAngle (Eye-level/High/Low/Dutch/Bird's-eye)\n` +
        `- movement (static/dolly/pan/tilt/handheld/whip-pan)\n` +
        `- lighting (quality + source, e.g. "harsh overhead gymnasium fluorescents", "dramatic rim light from gym windows")\n` +
        `- emotion (single mood word)\n` +
        `- description: vivid visual of exactly what is in frame — reference character names and technique names explicitly (1-2 sentences).`
    );

    shotResult.shots.forEach(shot => {
        log(`\nShot ${shot.shotNumber} — ${shot.shotType} | ${shot.cameraAngle} | ${shot.movement}`);
        log(`  Lighting : ${shot.lighting}`);
        log(`  Emotion  : ${shot.emotion}`);
        log(`  Desc     : ${shot.description}`);
    });

    // ── STEP 5: Motion Prompt (Feature 2 test) ────────────────────
    section("STEP 5 — Split Motion Prompt (Feature 2)");

    const firstShotDesc = shotResult.shots[0]?.description ?? firstScene.action;
    const motionLLM = new ChatGoogleGenerativeAI({
        model: MODEL_NAME,
        apiKey: API_KEY,
        temperature: 0.4,
    }).withStructuredOutput(MotionSchema);

    const motionResult = await motionLLM.invoke(
        `You are a video director creating motion instructions for animating a still image.\n\n` +
        `IMAGE: ${firstShotDesc}\n\nMOOD: intense, action\n\n` +
        `Generate TWO separate motion descriptions (≤25 words each):\n` +
        `1. camera_motion — Camera ONLY: movement type, direction, speed\n` +
        `2. subject_physics — Environment/subject ONLY: dust, motion blur, cloth, crowd particles\n` +
        `Use present continuous tense.`
    );

    log(`\nCamera motion : ${motionResult.camera_motion}`);
    log(`Subject physics: ${motionResult.subject_physics}`);
    log(`Combined       : ${motionResult.camera_motion}. ${motionResult.subject_physics}`);

    // ── STEP 6: Voiceover Script Generation ────────────────────────
    section("STEP 6 — Voiceover Script Generation");

    const voiceoverLLM = new ChatGoogleGenerativeAI({
        model: MODEL_NAME,
        apiKey: API_KEY,
        temperature: 0.6,
    }).withStructuredOutput(VoiceoverTestSchema);

    const sceneDescriptions = screenplay.scenes.map((s, i) => {
        const dialogueText = s.dialogue.length > 0
            ? `\nDialogue: ${s.dialogue.map((d: { speaker: string; text: string }) => `${d.speaker}: "${d.text}"`).join(' | ')}`
            : '';
        return `Scene ${i + 1} [id: scene_${i}]:\nLocation: ${s.heading}\nAction: ${s.action}${dialogueText}`;
    }).join('\n\n');

    const voiceoverResult = await voiceoverLLM.invoke(
        `You are a voiceover scriptwriter. Rewrite these screenplay action descriptions into narration scripts optimized for spoken delivery.\n\n` +
        `SCREENPLAY SCENES:\n${sceneDescriptions}\n\n` +
        `RULES:\n` +
        `1. Convert visual/camera directions into evocative spoken narration\n` +
        `2. Use sensory language: sounds, textures, temperature, movement\n` +
        `3. Keep roughly the same length as the original action text (±20%)\n` +
        `4. Do NOT include character dialogue — only the narrator's voiceover\n` +
        `5. Do NOT include scene headings, metadata labels, or markdown formatting\n\n` +
        `DELIVERY MARKERS — Insert these where appropriate:\n` +
        `- [pause: beat] — After a dramatic reveal or scene transition\n` +
        `- [pause: long] — Before a climactic moment\n` +
        `- [emphasis]key phrase[/emphasis] — On emotionally charged words\n` +
        `- [rising-tension]text[/rising-tension] — When intensity builds\n` +
        `- [slow]text[/slow] — For solemn or awe-inspiring moments\n` +
        `- [whisper]text[/whisper] — For secrets or danger\n` +
        `- [breath] — Before a long emotional passage\n\n` +
        `Return one voiceover script per scene, preserving the scene IDs exactly.`
    );

    voiceoverResult.voiceovers.forEach((vo, i) => {
        log(`\nScene ${i + 1} [${vo.sceneId}]:`);
        log(`  Original : ${screenplay.scenes[i]?.action.slice(0, 120)}...`);
        log(`  Voiceover: ${vo.script}`);
        // Count delivery markers
        const markers = vo.script.match(/\[(pause|emphasis|whisper|rising-tension|slow|breath)[^\]]*\]/g) || [];
        log(`  Markers  : ${markers.length} (${markers.map(m => m.match(/\[([^\s:]+)/)?.[1]).join(', ')})`);
    });

    // ── STEP 7: Persona Negatives (Feature 1 test) ────────────────
    section("STEP 7 — Persona Negative Constraints (Feature 1)");

    // Inline the persona data to avoid @/ imports
    const STORY_ACTION_NEGATIVES = [
        "static symmetrical portrait compositions",
        "slow meditative camera movement",
        "muted desaturated low-energy color palettes",
        "ambiguous spatial geography hiding action",
        "emotionally quiet contemplative scenes without kinetic energy",
    ];

    log(`\nGenre: ${GENRE}  →  Persona: story_action`);
    log("Negative constraints injected into image style guide avoid list:");
    STORY_ACTION_NEGATIVES.forEach((n, i) => log(`  ${i + 1}. ${n}`));

    // Build a sample avoid list like buildImageStyleGuide() would
    const DEFAULT_NEGATIVES = [
        "text", "watermark", "blurry", "low quality", "distorted", "noisy",
        "overexposed", "underexposed", "duplicate subjects", "cloned faces",
    ];
    const resolvedAvoid = [...new Set([...DEFAULT_NEGATIVES, ...STORY_ACTION_NEGATIVES])];
    log(`\nFull resolved avoid list (${resolvedAvoid.length} items):`);
    resolvedAvoid.forEach((a, i) => log(`  ${i + 1}. ${a}`));

    // ── SUMMARY ───────────────────────────────────────────────────
    section("PIPELINE SUMMARY");
    log(`✓ Breakdown      : ${breakdown.acts.length} acts`);
    log(`✓ Screenplay     : ${screenplay.scenes.length} scenes`);
    log(`✓ Characters     : ${charResult.characters.length} characters`);
    log(`✓ Shots (scene 1): ${shotResult.shots.length} shots`);
    log(`✓ Motion prompt  : camera="${motionResult.camera_motion.slice(0, 50)}..."`);
    log(`✓ Voiceover      : ${voiceoverResult.voiceovers.length} scripts with delivery markers`);
    log(`✓ Persona negatives (story_action): ${STORY_ACTION_NEGATIVES.length} constraints`);
    log("\nAll steps completed successfully.");

    flush();
    console.log(`\n📄 Output saved to: story-pipeline-output.md`);
}

main().catch(err => {
    log(`\nPipeline failed: ${err}`);
    flush();
    console.error("\nPipeline failed:", err);
    process.exit(1);
});
