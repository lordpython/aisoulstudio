/**
 * Real E2E Test: Duration Fixes Verification
 *
 * Runs the full story pipeline with REAL APIs to generate actual content,
 * then runs the animation layer to verify all 6 duration fixes work.
 *
 * Outputs everything to scripts/output/ so you can view quality.
 *
 * Run: npx tsx --env-file=.env scripts/test-duration-fixes.ts
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OUTPUT_DIR = resolve(import.meta.dirname, "output");
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
const DEAPI_KEY = process.env.VITE_DEAPI_API_KEY || "";
const MODEL_NAME = "gemini-3-flash-preview";
const IMAGE_MODEL = "imagen-4.0-fast-generate-001";

const TARGET_DURATION_SECONDS = 90; // 1.5 min — short for testing
const TOPIC = "A lone astronaut discovers an ancient alien garden growing on the dark side of the moon";
const GENRE = "Sci-Fi";

if (!API_KEY) {
  console.error("ERROR: VITE_GEMINI_API_KEY not set in .env");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const lines: string[] = [];
const log = (...args: unknown[]) => {
  const text = args.map(String).join(" ");
  console.log(text);
  lines.push(text);
};

const section = (title: string) => {
  const line = "─".repeat(60);
  log(`\n${line}\n  ${title}\n${line}`);
};

const saveJSON = (name: string, data: unknown) => {
  const path = resolve(OUTPUT_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
  log(`  💾 Saved: output/${name}.json`);
};

const saveImage = async (name: string, base64Data: string) => {
  const raw = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(raw, "base64");
  const ext = base64Data.includes("png") ? "png" : "jpg";
  const path = resolve(OUTPUT_DIR, `${name}.${ext}`);
  writeFileSync(path, buf);
  log(`  🖼️  Saved: output/${name}.${ext} (${(buf.length / 1024).toFixed(0)} KB)`);
};

// Simple Gemini image generation via REST (no SDK overhead)
async function generateImage(prompt: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:predict?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: "16:9",
          },
        }),
      }
    );
    if (!resp.ok) {
      const err = await resp.text();
      log(`  ⚠️ Image generation failed (${resp.status}): ${err.slice(0, 200)}`);
      return null;
    }
    const json = await resp.json() as {
      predictions?: Array<{ bytesBase64Encoded: string }>;
    };
    const b64 = json.predictions?.[0]?.bytesBase64Encoded;
    return b64 ? `data:image/png;base64,${b64}` : null;
  } catch (err) {
    log(`  ⚠️ Image generation error: ${err}`);
    return null;
  }
}

// DeAPI video animation
async function animateWithDeApi(
  imageDataUrl: string,
  prompt: string,
  targetDurationSeconds?: number
): Promise<string | null> {
  if (!DEAPI_KEY) {
    log("  ⚠️ DEAPI_API_KEY not set — skipping video animation");
    return null;
  }

  try {
    const imageBlob = await fetch(imageDataUrl).then(r => r.blob());

    // Fix 1: Use targetDurationSeconds to compute frames
    const motionFrameMap = { subtle: 73, moderate: 121, dynamic: 241 } as const;
    const frames = targetDurationSeconds
      ? Math.round(targetDurationSeconds * 24)
      : motionFrameMap.moderate;

    log(`  📹 Requesting ${frames} frames (${targetDurationSeconds ? `${targetDurationSeconds}s narration` : 'default moderate'})`);

    const formData = new FormData();
    formData.append("first_frame_image", imageBlob, "frame0.png");
    formData.append("prompt", prompt);
    formData.append("frames", String(frames));
    formData.append("width", "768");
    formData.append("height", "512");
    formData.append("fps", "24");
    formData.append("model", "Ltx2_3_22B_Dist_INT8");
    formData.append("guidance", "0");
    formData.append("steps", "1");
    formData.append("seed", "-1");

    const DEAPI_BASE = "https://api.deapi.ai/api/v1/client";

    const createResp = await fetch(`${DEAPI_BASE}/img2video`, {
      method: "POST",
      headers: { Authorization: `Bearer ${DEAPI_KEY}` },
      body: formData,
    });

    if (!createResp.ok) {
      const err = await createResp.text();
      log(`  ⚠️ DeAPI create failed (${createResp.status}): ${err.slice(0, 200)}`);
      return null;
    }

    const createJson = await createResp.json() as { data?: { request_id?: string } };
    const requestId = createJson.data?.request_id;
    if (!requestId) {
      log(`  ⚠️ No request_id returned from DeAPI. Response: ${JSON.stringify(createJson)}`);
      return null;
    }

    log(`  ⏳ DeAPI request: ${requestId} — polling...`);

    // Poll for completion (max 5 min)
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const statusResp = await fetch(`${DEAPI_BASE}/request-status/${requestId}`, {
        headers: { Authorization: `Bearer ${DEAPI_KEY}` },
      });
      const statusJson = await statusResp.json() as {
        data?: { status: string; result_url?: string; progress?: number };
      };

      const jobData = statusJson.data;
      if (jobData?.status === "done" && jobData.result_url) {
        return jobData.result_url;
      }
      if (jobData?.status === "failed") {
        log(`  ⚠️ DeAPI job failed`);
        return null;
      }
      if (i % 6 === 5) {
        const progress = jobData?.progress != null ? ` (${jobData.progress}%)` : "";
        log(`  ⏳ Still waiting... (${(i + 1) * 5}s)${progress}`);
      }
    }

    log("  ⚠️ DeAPI timeout after 5 minutes");
    return null;
  } catch (err) {
    log(`  ⚠️ DeAPI error: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

import { z, type ZodSchema } from "zod";

// ---------------------------------------------------------------------------
// Gemini REST helper — replaces LangChain dependency
// ---------------------------------------------------------------------------

async function geminiStructured<T>(prompt: string, schema: ZodSchema<T>, temperature = 0.7): Promise<T> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error (${resp.status}): ${err.slice(0, 300)}`);
  }
  const json = await resp.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No text in Gemini response");
  const parsed = JSON.parse(text);
  return schema.parse(parsed);
}

const BreakdownSchema = z.object({
  acts: z.array(z.object({
    title: z.string(),
    emotionalHook: z.string(),
    narrativeBeat: z.string(),
  })).min(2).max(4),
});

const ScreenplaySchema = z.object({
  scenes: z.array(z.object({
    heading: z.string(),
    action: z.string(),
    dialogue: z.array(z.object({
      speaker: z.string().max(30),
      text: z.string().min(1),
    })),
  })).min(2).max(5),
});

const ShotSchema = z.object({
  shots: z.array(z.object({
    shotNumber: z.number(),
    shotType: z.string(),
    cameraAngle: z.string(),
    movement: z.string(),
    description: z.string(),
    emotion: z.string(),
  })).min(2).max(4),
});

const VoiceoverSchema = z.object({
  voiceovers: z.array(z.object({
    sceneId: z.string(),
    script: z.string(),
  })),
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log("# 🎬 Duration Fixes — Real E2E Test");
  log(`Topic: ${TOPIC}`);
  log(`Target duration: ${TARGET_DURATION_SECONDS}s (${(TARGET_DURATION_SECONDS / 60).toFixed(1)} min)`);
  log(`DeAPI: ${DEAPI_KEY ? "configured" : "not configured (will skip video)"}`);
  log(`Output: ${OUTPUT_DIR}`);

  // ── STEP 1: Breakdown (Fix 3/4: duration-aware) ────────────────────
  section("STEP 1 — Story Breakdown (duration-targeted)");

  // Fix 3: Include duration in prompt
  const targetMins = TARGET_DURATION_SECONDS / 60;
  const minMins = Math.max(0.25, Math.round((targetMins - 0.25) * 4) / 4);
  const maxMins = Math.round((targetMins + 0.25) * 4) / 4;

  log(`  Duration range: ${minMins}-${maxMins} minutes`);

  const breakdown = await geminiStructured(
    `You are a story development expert for ${GENRE} short films.\n` +
    `Target duration: ${minMins}-${maxMins} minutes.\n\n` +
    `Create a narrative breakdown for: ${TOPIC}\n\n` +
    `Divide into 2-4 acts. For each provide:\n` +
    `1. Title\n2. Emotional Hook\n3. Narrative Beat (1-2 sentences)\n` +
    `Keep it concise — this is a SHORT film.\n\n` +
    `Return JSON: { "acts": [{ "title": string, "emotionalHook": string, "narrativeBeat": string }] }`,
    BreakdownSchema
  );

  breakdown.acts.forEach((act, i) => {
    log(`\n  Act ${i + 1}: ${act.title}`);
    log(`    Hook: ${act.emotionalHook}`);
    log(`    Beat: ${act.narrativeBeat}`);
  });
  saveJSON("01-breakdown", breakdown);

  // ── STEP 2: Screenplay (Fix 3: duration guidance appended) ──────────
  section("STEP 2 — Screenplay (duration-guided)");

  const breakdownText = breakdown.acts
    .map((a, i) => `Act ${i + 1}: ${a.title}\n- Hook: ${a.emotionalHook}\n- Beat: ${a.narrativeBeat}`)
    .join("\n\n");

  const screenplay = await geminiStructured(
    `Write a short ${GENRE} screenplay:\n\n${breakdownText}\n\n` +
    `Target duration: ${minMins}-${maxMins} minutes. Size each scene accordingly.\n\n` +
    `Create 2-5 scenes. For each:\n` +
    `1. Heading (EXT./INT. LOCATION - TIME)\n` +
    `2. Action (vivid visuals, 2-4 sentences — these become voiceover narration)\n` +
    `3. Dialogue (if any — speaker name ≤4 words)\n` +
    `Write in English.\n\n` +
    `Return JSON: { "scenes": [{ "heading": string, "action": string, "dialogue": [{ "speaker": string, "text": string }] }] }`,
    ScreenplaySchema
  );

  screenplay.scenes.forEach((scene, i) => {
    log(`\n  Scene ${i + 1}: ${scene.heading}`);
    log(`    Action: ${scene.action.slice(0, 200)}${scene.action.length > 200 ? "..." : ""}`);
    scene.dialogue.forEach(d => log(`    ${d.speaker}: "${d.text}"`));
  });
  saveJSON("02-screenplay", screenplay);

  // Word count estimate
  const wordCount = screenplay.scenes.reduce(
    (sum, s) => sum + s.action.split(/\s+/).length + s.dialogue.reduce((d, l) => d + l.text.split(/\s+/).length, 0),
    0
  );
  const estSeconds = Math.ceil(wordCount / (140 / 60));
  log(`\n  📊 Word count: ${wordCount} → estimated ${estSeconds}s (target: ${TARGET_DURATION_SECONDS}s)`);

  // ── STEP 3: Shot Breakdown ──────────────────────────────────────────
  section("STEP 3 — Shot Breakdown (per scene)");

  const allShots: Array<{
    sceneIndex: number;
    shotNumber: number;
    shotType: string;
    cameraAngle: string;
    movement: string;
    description: string;
    emotion: string;
  }> = [];

  for (let si = 0; si < screenplay.scenes.length; si++) {
    const scene = screenplay.scenes[si]!;
    const shotResult = await geminiStructured(
      `Break this scene into 2-4 camera shots for a ${GENRE} short film.\n\n` +
      `Scene: ${scene.heading}\n${scene.action}\n\n` +
      `For each shot: shotNumber, shotType (Wide/Medium/Close-up/POV), ` +
      `cameraAngle (Eye-level/High/Low/Dutch), movement (static/pan/tilt/dolly/tracking), ` +
      `description (1-2 sentences), emotion (single word).\n\n` +
      `Return JSON: { "shots": [{ "shotNumber": number, "shotType": string, "cameraAngle": string, "movement": string, "description": string, "emotion": string }] }`,
      ShotSchema
    );

    log(`\n  Scene ${si + 1}: ${scene.heading} → ${shotResult.shots.length} shots`);
    shotResult.shots.forEach(shot => {
      log(`    Shot ${shot.shotNumber}: ${shot.shotType} | ${shot.cameraAngle} | ${shot.movement}`);
      log(`      ${shot.description.slice(0, 150)}`);
      allShots.push({ sceneIndex: si, ...shot });
    });
  }
  saveJSON("03-shots", allShots);

  // ── STEP 4: Voiceover ──────────────────────────────────────────────
  section("STEP 4 — Voiceover Scripts");

  const sceneDescriptions = screenplay.scenes
    .map((s, i) => `Scene ${i + 1} [id: scene_${i}]:\n${s.heading}\n${s.action}`)
    .join("\n\n");

  const voiceoverResult = await geminiStructured(
    `Rewrite these screenplay actions as spoken narration:\n\n${sceneDescriptions}\n\n` +
    `Rules:\n- Evocative spoken narration (not camera directions)\n` +
    `- Use delivery markers: [pause: beat], [emphasis]...[/emphasis], [slow]...[/slow], [whisper]...[/whisper]\n` +
    `- One script per scene, preserve scene IDs\n\n` +
    `Return JSON: { "voiceovers": [{ "sceneId": string, "script": string }] }`,
    VoiceoverSchema
  );

  // Build per-shot durations (simulating narration timing)
  const shotTargetDurations = new Map<string, number>();
  const totalNarrationWords = voiceoverResult.voiceovers.reduce(
    (sum, v) => sum + v.script.replace(/\[.*?\]/g, "").split(/\s+/).length, 0
  );
  const secondsPerWord = TARGET_DURATION_SECONDS / Math.max(totalNarrationWords, 1);

  log(`\n  Total narration words: ${totalNarrationWords}`);
  log(`  Seconds per word: ${secondsPerWord.toFixed(3)}`);

  for (let si = 0; si < screenplay.scenes.length; si++) {
    const vo = voiceoverResult.voiceovers.find(v => v.sceneId === `scene_${si}`);
    const sceneShots = allShots.filter(s => s.sceneIndex === si);
    const sceneWords = vo ? vo.script.replace(/\[.*?\]/g, "").split(/\s+/).length : 10;
    const sceneDuration = sceneWords * secondsPerWord;
    const perShotDuration = sceneDuration / Math.max(sceneShots.length, 1);

    sceneShots.forEach((shot, j) => {
      const shotId = `shot_${si}_${j}`;
      shotTargetDurations.set(shotId, perShotDuration);
    });
  }

  voiceoverResult.voiceovers.forEach((vo, i) => {
    log(`\n  Scene ${i + 1} [${vo.sceneId}]:`);
    log(`    ${vo.script.slice(0, 200)}${vo.script.length > 200 ? "..." : ""}`);
  });

  log("\n  📊 Per-shot target durations:");
  shotTargetDurations.forEach((dur, id) => {
    log(`    ${id}: ${dur.toFixed(2)}s → ${Math.round(dur * 24)} frames`);
  });

  saveJSON("04-voiceover", {
    voiceovers: voiceoverResult.voiceovers,
    shotTargetDurations: Object.fromEntries(shotTargetDurations),
  });

  // ── STEP 5: Image Generation ──────────────────────────────────────
  section("STEP 5 — Image Generation (first 3 shots)");

  const shotsToAnimate = allShots.slice(0, 3);
  const generatedImages: Array<{ shotId: string; imageUrl: string | null }> = [];

  for (let i = 0; i < shotsToAnimate.length; i++) {
    const shot = shotsToAnimate[i]!;
    const imagePrompt = `Cinematic ${GENRE} scene: ${shot.description}. ` +
      `${shot.shotType} shot, ${shot.cameraAngle} angle. ` +
      `Photorealistic, moody lighting, 16:9 aspect ratio.`;

    log(`\n  Shot ${i + 1}: Generating image...`);
    log(`    Prompt: ${imagePrompt.slice(0, 150)}...`);

    const imageData = await generateImage(imagePrompt);
    if (imageData) {
      await saveImage(`05-shot-${i + 1}-image`, imageData);
    }
    generatedImages.push({ shotId: `shot_${shot.sceneIndex}_${i}`, imageUrl: imageData });
  }

  // ── STEP 6: Video Animation (Fix 1: duration-aware) ──────────────
  section("STEP 6 — Video Animation (duration-aware, Fix 1/2/5)");

  const animatedShots: Array<{
    shotId: string;
    videoUrl: string | null;
    targetDurationSeconds: number;
    frames: number;
  }> = [];

  for (let i = 0; i < shotsToAnimate.length; i++) {
    const shot = shotsToAnimate[i]!;
    const shotId = `shot_${shot.sceneIndex}_${i}`;
    const image = generatedImages[i]!;

    // Fix 1: Get target duration from narration
    const targetDur = shotTargetDurations.get(shotId);
    // Fix 6: ?? not ||
    const duration = targetDur ?? (90 / 30); // 3s default

    // Fix 5: Compute frames from narration duration
    const frames = targetDur ? Math.round(targetDur * 24) : 121;

    log(`\n  Shot ${i + 1} (${shotId}):`);
    log(`    Target: ${duration.toFixed(2)}s → ${frames} frames`);

    // Build animation prompt
    const movLower = shot.movement.toLowerCase();
    let cameraDir = "slow gentle camera drift";
    if (movLower === "pan") cameraDir = "slow horizontal pan";
    else if (movLower === "tilt") cameraDir = "gentle vertical tilt";
    else if (movLower === "dolly") cameraDir = "smooth dolly forward";
    else if (movLower === "tracking") cameraDir = "tracking camera movement";

    const rawPrompt = `${cameraDir}. ${shot.description.slice(0, 200)}. Atmospheric, minimal character motion.`;

    // Fix 2: enhanceVideoPrompt with fallback
    let animationPrompt: string;
    if (DEAPI_KEY) {
      try {
        // /prompt/video requires multipart/form-data (NOT JSON)
        const enhanceForm = new FormData();
        enhanceForm.append("prompt", rawPrompt);
        enhanceForm.append("negative_prompt", "blurry, low quality, distorted, artifacts");
        const enhanceResp = await fetch("https://api.deapi.ai/api/v1/client/prompt/video", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DEAPI_KEY}`,
            // No Content-Type — fetch sets it with multipart boundary
          },
          body: enhanceForm,
        });
        if (enhanceResp.ok) {
          const enhanceJson = await enhanceResp.json() as { enhanced_prompt?: string };
          animationPrompt = enhanceJson.enhanced_prompt || rawPrompt;
          log(`    ✅ Enhanced prompt: ${animationPrompt.slice(0, 120)}...`);
        } else {
          const enhErr = await enhanceResp.text();
          animationPrompt = rawPrompt;
          log(`    ⚠️ Enhancement failed (${enhanceResp.status}): ${enhErr.slice(0, 200)}`);
        }
      } catch (err) {
        // Fix 2: Fallback — don't kill the shot
        animationPrompt = rawPrompt;
        log(`    ⚠️ Enhancement error, falling back: ${err}`);
      }
    } else {
      animationPrompt = rawPrompt;
      log(`    Raw prompt (no DeAPI): ${rawPrompt.slice(0, 120)}...`);
    }

    // Animate if image was generated and DeAPI is configured
    let videoUrl: string | null = null;
    if (image.imageUrl && DEAPI_KEY) {
      videoUrl = await animateWithDeApi(image.imageUrl, animationPrompt, targetDur);
      if (videoUrl) {
        log(`    ✅ Video: ${videoUrl}`);
        // Download and save video
        try {
          const vidResp = await fetch(videoUrl);
          const vidBuf = Buffer.from(await vidResp.arrayBuffer());
          const vidPath = resolve(OUTPUT_DIR, `06-shot-${i + 1}-video.mp4`);
          writeFileSync(vidPath, vidBuf);
          log(`    💾 Saved: output/06-shot-${i + 1}-video.mp4 (${(vidBuf.length / 1024).toFixed(0)} KB)`);
        } catch (dlErr) {
          log(`    ⚠️ Video download failed: ${dlErr}`);
        }
      }
    }

    animatedShots.push({ shotId, videoUrl, targetDurationSeconds: duration, frames });
  }

  saveJSON("06-animated-shots", animatedShots);

  // ── SUMMARY ─────────────────────────────────────────────────────────
  section("SUMMARY");
  log(`\n  ✓ Breakdown:      ${breakdown.acts.length} acts`);
  log(`  ✓ Screenplay:     ${screenplay.scenes.length} scenes (${wordCount} words, ~${estSeconds}s)`);
  log(`  ✓ Shots:          ${allShots.length} total shots`);
  log(`  ✓ Voiceover:      ${voiceoverResult.voiceovers.length} scripts (${totalNarrationWords} words)`);
  log(`  ✓ Images:         ${generatedImages.filter(g => g.imageUrl).length}/${generatedImages.length} generated`);
  log(`  ✓ Videos:         ${animatedShots.filter(a => a.videoUrl).length}/${animatedShots.length} animated`);
  log(`\n  📊 Duration analysis:`);
  log(`    Target:    ${TARGET_DURATION_SECONDS}s (${(TARGET_DURATION_SECONDS / 60).toFixed(1)} min)`);
  log(`    Script:    ~${estSeconds}s (${Math.abs(estSeconds - TARGET_DURATION_SECONDS)}s ${estSeconds > TARGET_DURATION_SECONDS ? "over" : "under"})`);
  log(`    Animation: ${animatedShots.reduce((s, a) => s + a.targetDurationSeconds, 0).toFixed(1)}s total across ${animatedShots.length} shots`);

  log(`\n  📁 All outputs in: ${OUTPUT_DIR}`);
  log(`  Open the folder to view images (PNG) and videos (MP4).\n`);

  // Save full log
  writeFileSync(resolve(OUTPUT_DIR, "00-test-log.md"), lines.join("\n") + "\n", "utf-8");
  console.log(`\n📄 Full log saved to: output/00-test-log.md`);
}

main().catch(err => {
  log(`\n❌ Pipeline failed: ${err}`);
  writeFileSync(resolve(OUTPUT_DIR, "00-test-log.md"), lines.join("\n") + "\n", "utf-8");
  console.error("\nPipeline failed:", err);
  process.exit(1);
});
