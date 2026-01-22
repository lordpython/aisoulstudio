/**
 * Editor Service
 * 
 * Validation and assembly agent for video production pipeline.
 * Responsibilities:
 * - Validate content plan structure and completeness
 * - Check scene-to-narration timing sync
 * - Critique quality and coherence
 * - Coordinate FFmpeg assembly for final video
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence, RunnableLambda } from "@langchain/core/runnables";
import { z } from "zod";
import {
    ContentPlan,
    Scene,
    NarrationSegment,
    ValidationResult,
    GeneratedImage
} from "../types";
import { API_KEY, MODELS } from "./shared/apiClient";

// --- Zod Schemas ---

/**
 * Schema for AI-powered critique output
 */
export const CritiqueSchema = z.object({
    score: z.number().min(0).max(100).describe("Overall quality score 0-100"),
    approved: z.boolean().describe("Whether the plan is ready for production"),
    issues: z.array(z.object({
        scene: z.string().describe("Scene ID or name"),
        type: z.enum(["timing", "visual", "narration", "transition", "pacing"]).describe("Issue type"),
        message: z.string().describe("Description of the issue"),
    })).describe("List of identified issues"),
    suggestions: z.array(z.string()).describe("Improvement suggestions"),
});

export type CritiqueOutput = z.infer<typeof CritiqueSchema>;

// --- Configuration ---

export interface EditorConfig {
    model?: string;
    temperature?: number;
    minApprovalScore?: number; // Minimum score to approve (default: 70)
}

const DEFAULT_CONFIG: Required<EditorConfig> = {
    model: MODELS.TEXT,
    temperature: 0.3, // Lower temperature for more consistent critiques
    minApprovalScore: 70,
};

// --- Error Types ---

export class EditorError extends Error {
    constructor(
        message: string,
        public readonly code: "VALIDATION_FAILED" | "SYNC_ERROR" | "ASSEMBLY_ERROR" | "AI_FAILURE",
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = "EditorError";
    }
}

// --- Validation Functions ---

/**
 * Validate content plan structure and completeness.
 * Performs rule-based checks before AI critique.
 */
export function validatePlanStructure(plan: ContentPlan): {
    valid: boolean;
    issues: Array<{ scene: string; type: string; message: string }>;
} {
    const issues: Array<{ scene: string; type: string; message: string }> = [];

    // Check plan-level requirements
    if (!plan.title?.trim()) {
        issues.push({ scene: "plan", type: "general", message: "Missing title" });
    }

    if (plan.scenes.length === 0) {
        issues.push({ scene: "plan", type: "general", message: "No scenes defined" });
        return { valid: false, issues };
    }

    // Check each scene
    let accumulatedDuration = 0;
    plan.scenes.forEach((scene, index) => {
        const sceneId = scene.id || `scene-${index + 1}`;

        // Duration checks
        if (scene.duration <= 0) {
            issues.push({ scene: sceneId, type: "timing", message: "Invalid duration (must be > 0)" });
        } else if (scene.duration < 3) {
            issues.push({ scene: sceneId, type: "timing", message: "Duration too short (< 3s may feel rushed)" });
        } else if (scene.duration > 60) {
            issues.push({ scene: sceneId, type: "timing", message: "Duration very long (> 60s may lose attention)" });
        }
        accumulatedDuration += scene.duration;

        // Visual description checks
        if (!scene.visualDescription?.trim()) {
            issues.push({ scene: sceneId, type: "visual", message: "Missing visual description" });
        } else if (scene.visualDescription.length < 20) {
            issues.push({ scene: sceneId, type: "visual", message: "Visual description too brief (< 20 chars)" });
        }

        // Narration checks
        if (!scene.narrationScript?.trim()) {
            issues.push({ scene: sceneId, type: "narration", message: "Missing narration script" });
        }

        // Estimate narration duration (avg 150 words/minute = 2.5 words/second)
        if (scene.narrationScript) {
            const wordCount = scene.narrationScript.split(/\s+/).length;
            const estimatedNarrationDuration = wordCount / 2.5;

            if (estimatedNarrationDuration > scene.duration * 1.2) {
                issues.push({
                    scene: sceneId,
                    type: "timing",
                    message: `Narration (~${Math.round(estimatedNarrationDuration)}s) may exceed scene duration (${scene.duration}s)`
                });
            }
        }
    });

    // Check total duration
    const durationDiff = Math.abs(accumulatedDuration - plan.totalDuration);
    if (durationDiff > 5) {
        issues.push({
            scene: "plan",
            type: "timing",
            message: `Scene durations (${accumulatedDuration}s) differ from plan total (${plan.totalDuration}s)`
        });
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}

/**
 * Check synchronization between scenes and narration segments.
 */
export function checkNarrationSync(
    scenes: Scene[],
    narrationSegments: NarrationSegment[]
): {
    synced: boolean;
    issues: Array<{ scene: string; type: string; message: string }>;
} {
    const issues: Array<{ scene: string; type: string; message: string }> = [];

    // Check for missing narrations
    scenes.forEach((scene) => {
        const narration = narrationSegments.find(n => n.sceneId === scene.id);

        if (!narration) {
            issues.push({
                scene: scene.id,
                type: "narration",
                message: "Missing narration audio"
            });
        } else {
            // Check duration mismatch
            const durationDiff = Math.abs(narration.audioDuration - scene.duration);
            if (durationDiff > 2) {
                issues.push({
                    scene: scene.id,
                    type: "timing",
                    message: `Narration duration (${narration.audioDuration.toFixed(1)}s) differs from scene (${scene.duration}s)`
                });
            }
        }
    });

    // Check for orphaned narrations
    narrationSegments.forEach((narration) => {
        const scene = scenes.find(s => s.id === narration.sceneId);
        if (!scene) {
            issues.push({
                scene: narration.sceneId,
                type: "narration",
                message: "Narration has no matching scene"
            });
        }
    });

    return {
        synced: issues.length === 0,
        issues,
    };
}

/**
 * Check visual assets against scenes.
 */
export function checkVisualAssets(
    scenes: Scene[],
    visuals: GeneratedImage[]
): {
    complete: boolean;
    issues: Array<{ scene: string; type: string; message: string }>;
} {
    const issues: Array<{ scene: string; type: string; message: string }> = [];

    scenes.forEach((scene) => {
        const visual = visuals.find(v => v.promptId === scene.id);

        if (!visual) {
            issues.push({
                scene: scene.id,
                type: "visual",
                message: "Missing visual asset"
            });
        }
    });

    return {
        complete: issues.length === 0,
        issues,
    };
}

// --- AI-Powered Critique ---

function createModel(config: EditorConfig = {}): ChatGoogleGenerativeAI {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    if (!API_KEY) {
        throw new EditorError("Gemini API key is not configured", "AI_FAILURE");
    }

    return new ChatGoogleGenerativeAI({
        apiKey: API_KEY,
        model: mergedConfig.model,
        temperature: mergedConfig.temperature,
    });
}

function createCritiqueTemplate(): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([
        ["system", `You are an expert video editor and quality assurance specialist.
Your job is to critique video content plans and identify issues that would affect the final video quality.

Evaluate based on:
1. PACING: Is the flow natural? Are scenes appropriately timed?
2. COHERENCE: Does the story/content flow logically?
3. VISUAL QUALITY: Are visual descriptions specific and filmable?
4. NARRATION QUALITY: Is the narration clear and engaging?
5. TRANSITIONS: Are transitions appropriate between scenes?

OUTPUT FORMAT:
Return a valid JSON object:
{{
  "score": 85,
  "approved": true,
  "issues": [
    {{"scene": "scene-2", "type": "timing", "message": "Scene duration too short for content"}}
  ],
  "suggestions": ["Consider adding establishing shot", "Slow down pacing in middle section"]
}}`],
        ["human", `Critique this video content plan:

TITLE: {title}
TARGET AUDIENCE: {targetAudience}
OVERALL TONE: {overallTone}
TOTAL DURATION: {totalDuration} seconds

SCENES:
{scenesDescription}

Rule-based issues already found:
{existingIssues}

Provide your critique with a score (0-100), approval status, any additional issues, and suggestions.`],
    ]);
}

/**
 * Get AI-powered critique of a content plan.
 */
export async function critiqueContentPlan(
    plan: ContentPlan,
    existingIssues: Array<{ scene: string; type: string; message: string }> = [],
    config?: EditorConfig
): Promise<CritiqueOutput> {
    const model = createModel(config);
    const template = createCritiqueTemplate();

    // Format scenes for the prompt
    const scenesDescription = plan.scenes.map((scene, i) =>
        `${i + 1}. ${scene.name} (${scene.duration}s, ${scene.emotionalTone})
   Visual: ${scene.visualDescription}
   Narration: ${scene.narrationScript.substring(0, 100)}...`
    ).join("\n\n");

    const existingIssuesStr = existingIssues.length > 0
        ? existingIssues.map(i => `- ${i.scene}: ${i.message}`).join("\n")
        : "No rule-based issues found.";

    const chain = RunnableSequence.from([
        template,
        model,
        new RunnableLambda({
            func: async (message: unknown): Promise<CritiqueOutput> => {
                const content = typeof message === "object" && message !== null && "content" in message
                    ? String((message as { content: unknown }).content)
                    : String(message);

                const jsonStr = content
                    .replace(/^```json\s*/i, "")
                    .replace(/^```\s*/i, "")
                    .replace(/```$/i, "")
                    .trim();

                try {
                    const parsed = JSON.parse(jsonStr);

                    // Normalize issue types before validation
                    const validTypes = ["timing", "visual", "narration", "transition", "pacing"];
                    if (parsed.issues && Array.isArray(parsed.issues)) {
                        parsed.issues = parsed.issues.map((issue: any) => ({
                            ...issue,
                            // Normalize type to valid value
                            type: validTypes.includes(issue.type?.toLowerCase?.())
                                ? issue.type.toLowerCase()
                                : "pacing", // Default fallback
                        }));
                    }

                    return CritiqueSchema.parse(parsed);
                } catch (error) {
                    console.error("[Editor] Critique parse error:", error);
                    // Return a safe default on parse failure
                    return {
                        score: 50,
                        approved: false,
                        issues: [{ scene: "unknown", type: "pacing", message: "Unable to parse AI critique" }],
                        suggestions: ["Please review the content plan manually"],
                    };
                }
            },
        }),
    ]);

    try {
        return await chain.invoke({
            title: plan.title,
            targetAudience: plan.targetAudience,
            overallTone: plan.overallTone,
            totalDuration: plan.totalDuration,
            scenesDescription,
            existingIssues: existingIssuesStr,
        });
    } catch (error) {
        console.error("[Editor] Critique failed:", error);
        throw new EditorError(
            `Critique failed: ${error instanceof Error ? error.message : String(error)}`,
            "AI_FAILURE",
            error instanceof Error ? error : undefined
        );
    }
}

// --- Main Validation Pipeline ---

/**
 * Run full validation on a content plan.
 * Combines rule-based checks with AI critique.
 */
export async function validateContentPlan(
    plan: ContentPlan,
    options: {
        narrationSegments?: NarrationSegment[];
        visuals?: GeneratedImage[];
        useAICritique?: boolean;
        config?: EditorConfig;
    } = {}
): Promise<ValidationResult> {
    const {
        narrationSegments = [],
        visuals = [],
        useAICritique = true,
        config,
    } = options;

    console.log("[Editor] Validating content plan:", plan.title);

    // Collect all issues
    let allIssues: Array<{ scene: string; type: string; message: string }> = [];

    // 1. Structure validation
    const structureCheck = validatePlanStructure(plan);
    allIssues = [...allIssues, ...structureCheck.issues];

    // 2. Narration sync (if narrations provided)
    if (narrationSegments.length > 0) {
        const narrationCheck = checkNarrationSync(plan.scenes, narrationSegments);
        allIssues = [...allIssues, ...narrationCheck.issues];
    }

    // 3. Visual assets (if visuals provided)
    if (visuals.length > 0) {
        const visualCheck = checkVisualAssets(plan.scenes, visuals);
        allIssues = [...allIssues, ...visualCheck.issues];
    }

    // 4. AI critique (optional)
    let score = 100 - (allIssues.length * 10); // Basic score from rule checks
    let suggestions: string[] = [];

    if (useAICritique && API_KEY) {
        try {
            const critique = await critiqueContentPlan(plan, allIssues, config);
            score = critique.score;
            allIssues = [...allIssues, ...critique.issues];
            suggestions = critique.suggestions;
        } catch (error) {
            console.warn("[Editor] AI critique failed, using rule-based score only:", error);
        }
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    const minScore = config?.minApprovalScore ?? DEFAULT_CONFIG.minApprovalScore;

    // Count critical issues (missing assets, invalid durations)
    const criticalIssues = allIssues.filter(i => 
        i.message.includes("Missing") || 
        i.message.includes("Invalid") ||
        i.message.includes("No scenes")
    );
    
    // Minor timing differences are warnings, not blockers
    const minorTimingIssues = allIssues.filter(i => 
        i.type === "timing" && 
        (i.message.includes("may exceed") || i.message.includes("differs from"))
    );

    console.log(`[Editor] Validation complete. Score: ${score}, Issues: ${allIssues.length} (${criticalIssues.length} critical)`);

    return {
        // Approve if score is good and no critical issues
        // Minor timing warnings shouldn't block production
        approved: score >= minScore && criticalIssues.length === 0,
        score,
        issues: allIssues,
        suggestions,
    };
}

/**
 * Adjust scene durations to match narration.
 * Returns an updated content plan.
 */
export function syncDurationsToNarration(
    plan: ContentPlan,
    narrationSegments: NarrationSegment[]
): ContentPlan {
    const updatedScenes = plan.scenes.map((scene) => {
        const narration = narrationSegments.find(n => n.sceneId === scene.id);

        if (narration) {
            // Sanity check: narration duration should be reasonable (3-60 seconds per scene)
            const audioDuration = narration.audioDuration;
            
            if (audioDuration < 3 || audioDuration > 60) {
                console.warn(`[Editor] Suspicious audio duration for ${scene.id}: ${audioDuration}s. Keeping original ${scene.duration}s`);
                return scene;
            }
            
            // Only adjust if there's a significant difference (> 2 seconds)
            if (Math.abs(audioDuration - scene.duration) > 2) {
                const newDuration = Math.ceil(audioDuration) + 1; // Add 1s buffer
                console.log(`[Editor] Adjusting scene ${scene.id} duration: ${scene.duration}s → ${newDuration}s`);
                return {
                    ...scene,
                    duration: newDuration,
                };
            }
        }

        return scene;
    });

    // Recalculate total duration
    const totalDuration = updatedScenes.reduce((sum, s) => sum + s.duration, 0);

    return {
        ...plan,
        scenes: updatedScenes,
        totalDuration,
    };
}

// --- FFmpeg Assembly ---

export interface AssemblyConfig {
    width?: number;
    height?: number;
    fps?: number;
    transitionDuration?: number; // seconds
    backgroundMusic?: Blob | null;
    backgroundMusicVolume?: number; // 0-1
}

const DEFAULT_ASSEMBLY_CONFIG: Required<Omit<AssemblyConfig, 'backgroundMusic'>> & { backgroundMusic: Blob | null } = {
    width: 1280,
    height: 720,
    fps: 24,
    transitionDuration: 0.5,
    backgroundMusic: null,
    backgroundMusicVolume: 0.3,
};

export interface AssemblyProgress {
    stage: "preparing" | "merging_audio" | "rendering_scenes" | "encoding" | "complete";
    progress: number;
    message: string;
}

/**
 * Assemble final video from content plan, narration, and visuals.
 * Uses server-side FFmpeg for best quality and performance.
 */
export async function assembleNarratedVideo(
    contentPlan: ContentPlan,
    narrationSegments: NarrationSegment[],
    visuals: GeneratedImage[],
    config: AssemblyConfig = {},
    onProgress?: (progress: AssemblyProgress) => void
): Promise<Blob> {
    const mergedConfig = { ...DEFAULT_ASSEMBLY_CONFIG, ...config };

    console.log("[Editor] Starting video assembly for:", contentPlan.title);

    onProgress?.({
        stage: "preparing",
        progress: 0,
        message: "Preparing assets...",
    });

    // Validate we have all required assets
    const visualCheck = checkVisualAssets(contentPlan.scenes, visuals);
    if (!visualCheck.complete) {
        throw new EditorError(
            `Missing visual assets: ${visualCheck.issues.map(i => i.scene).join(", ")}`,
            "ASSEMBLY_ERROR"
        );
    }

    const narrationCheck = checkNarrationSync(contentPlan.scenes, narrationSegments);
    if (!narrationCheck.synced) {
        console.warn("[Editor] Narration sync issues:", narrationCheck.issues);
    }

    // Build timeline data
    const timeline: Array<{
        sceneId: string;
        startTime: number;
        duration: number;
        visualUrl: string;
        visualType: "image" | "video";
        audioBlob: Blob;
        transition: string;
    }> = [];

    let currentTime = 0;
    for (const scene of contentPlan.scenes) {
        const visual = visuals.find(v => v.promptId === scene.id);
        const narration = narrationSegments.find(n => n.sceneId === scene.id);

        if (!visual || !narration) continue;

        timeline.push({
            sceneId: scene.id,
            startTime: currentTime,
            duration: narration.audioDuration,
            visualUrl: visual.imageUrl,
            visualType: visual.type || "image",
            audioBlob: narration.audioBlob,
            transition: scene.transitionTo || "dissolve",
        });

        currentTime += narration.audioDuration;
    }

    onProgress?.({
        stage: "merging_audio",
        progress: 10,
        message: `Merging ${timeline.length} audio segments...`,
    });

    // Merge audio blobs into a single audio track
    const mergedAudio = await mergeAudioBlobs(
        timeline.map(t => t.audioBlob),
        timeline.map(t => t.duration)
    );

    onProgress?.({
        stage: "rendering_scenes",
        progress: 30,
        message: "Rendering video frames...",
    });

    // For now, create a simple video using canvas rendering
    // In production, this would send to FFmpeg server
    const videoBlob = await renderVideoWithCanvas(
        timeline,
        mergedAudio,
        mergedConfig,
        (sceneProgress) => {
            onProgress?.({
                stage: "rendering_scenes",
                progress: 30 + (sceneProgress * 50),
                message: `Rendering scene ${Math.ceil(sceneProgress * timeline.length)}/${timeline.length}...`,
            });
        }
    );

    onProgress?.({
        stage: "complete",
        progress: 100,
        message: "Video assembly complete!",
    });

    console.log(`[Editor] Video assembled: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`);

    return videoBlob;
}

/**
 * Merge multiple audio blobs into a single audio track.
 */
async function mergeAudioBlobs(
    blobs: Blob[],
    durations: number[]
): Promise<Blob> {
    // For PCM audio from Gemini TTS (L16 format at 24kHz)
    const sampleRate = 24000;
    const bytesPerSample = 2; // 16-bit

    // Calculate total size
    const totalSamples = durations.reduce((sum, d) => sum + Math.ceil(d * sampleRate), 0);
    const totalBytes = totalSamples * bytesPerSample;

    const mergedBuffer = new ArrayBuffer(totalBytes);
    const mergedView = new Uint8Array(mergedBuffer);

    let offset = 0;
    for (let i = 0; i < blobs.length; i++) {
        const blobData = new Uint8Array(await blobs[i].arrayBuffer());
        mergedView.set(blobData, offset);
        offset += blobData.length;
    }

    // Create WAV header
    const wavBuffer = createWavBuffer(mergedView, sampleRate);

    return new Blob([wavBuffer], { type: "audio/wav" });
}

/**
 * Create a WAV file buffer from raw PCM data.
 */
function createWavBuffer(pcmData: Uint8Array, sampleRate: number): ArrayBuffer {
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + pcmData.length);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + pcmData.length, true);
    writeString(view, 8, "WAVE");

    // fmt chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample

    // data chunk
    writeString(view, 36, "data");
    view.setUint32(40, pcmData.length, true);

    // Copy PCM data
    new Uint8Array(buffer, headerSize).set(pcmData);

    return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

/**
 * Render video using canvas (client-side fallback).
 * For production, prefer server-side FFmpeg rendering.
 */
async function renderVideoWithCanvas(
    timeline: Array<{
        sceneId: string;
        startTime: number;
        duration: number;
        visualUrl: string;
        visualType: "image" | "video";
        transition: string;
    }>,
    audioBlob: Blob,
    config: Required<Omit<AssemblyConfig, 'backgroundMusic'>> & { backgroundMusic: Blob | null },
    onProgress: (progress: number) => void
): Promise<Blob> {
    const { width, height, fps } = config;
    const totalDuration = timeline.reduce((sum, t) => sum + t.duration, 0);
    const totalFrames = Math.ceil(totalDuration * fps);

    // Create canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    // Load all images
    const images = await Promise.all(
        timeline.map(async (item) => {
            if (item.visualType === "image") {
                const img = new Image();
                img.crossOrigin = "anonymous";
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = reject;
                    img.src = item.visualUrl;
                });
                return { type: "image" as const, element: img };
            }
            return { type: "image" as const, element: new Image() }; // Fallback
        })
    );

    // Capture frames
    const frames: Blob[] = [];

    for (let frame = 0; frame < totalFrames; frame++) {
        const currentTime = frame / fps;

        // Find current scene
        let sceneIndex = 0;
        let sceneStartTime = 0;
        for (let i = 0; i < timeline.length; i++) {
            if (currentTime >= sceneStartTime && currentTime < sceneStartTime + timeline[i].duration) {
                sceneIndex = i;
                break;
            }
            sceneStartTime += timeline[i].duration;
        }

        // Clear canvas
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);

        // Draw current image
        const img = images[sceneIndex]?.element;
        if (img && img.complete && img.naturalWidth > 0) {
            // Cover fit
            const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
            const drawWidth = img.naturalWidth * scale;
            const drawHeight = img.naturalHeight * scale;
            const x = (width - drawWidth) / 2;
            const y = (height - drawHeight) / 2;

            ctx.drawImage(img, x, y, drawWidth, drawHeight);
        }

        // Capture frame
        const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85);
        });
        frames.push(blob);

        if (frame % 10 === 0) {
            onProgress(frame / totalFrames);
        }
    }

    // For now, return a simple WebM video using MediaRecorder simulation
    // In production, this would use FFmpeg
    console.log(`[Editor] Rendered ${frames.length} frames`);

    // Create a simple video by combining frames with audio
    // This is a simplified version - production would use FFmpeg
    const videoBlob = await combineFramesAndAudio(frames, audioBlob, fps, totalDuration);

    return videoBlob;
}

/**
 * Combine rendered frames with audio into final video.
 * Simplified version - production should use FFmpeg for proper encoding.
 */
async function combineFramesAndAudio(
    frames: Blob[],
    audioBlob: Blob,
    fps: number,
    duration: number
): Promise<Blob> {
    // For browser-based assembly, we'll create a simple approach
    // using canvas and MediaRecorder

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d")!;

    const stream = canvas.captureStream(fps);

    // Add audio track
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
    const mediaStreamDest = audioContext.createMediaStreamDestination();
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(mediaStreamDest);

    // Combine tracks
    stream.addTrack(mediaStreamDest.stream.getAudioTracks()[0]);

    const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8,opus",
        videoBitsPerSecond: 2500000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);

    return new Promise((resolve) => {
        recorder.onstop = () => {
            const videoBlob = new Blob(chunks, { type: "video/webm" });
            resolve(videoBlob);
        };

        recorder.start();
        source.start();

        // Draw frames at correct timing
        let frameIndex = 0;
        const frameDuration = 1000 / fps;

        const drawFrame = async () => {
            if (frameIndex >= frames.length) {
                recorder.stop();
                return;
            }

            const img = new Image();
            img.src = URL.createObjectURL(frames[frameIndex]);
            await new Promise<void>((r) => { img.onload = () => r(); });
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(img.src);

            frameIndex++;
            setTimeout(drawFrame, frameDuration);
        };

        drawFrame();
    });
}

