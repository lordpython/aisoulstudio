import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

/**
 * FFmpeg Export Integration Test (Full-Length with Video Clips)
 *
 * Tests the full server-side FFmpeg pipeline with production content:
 * 1. Extracts JPEG frames from the 5 Veo video clips (~8s each, 24fps)
 * 2. Concatenates all 5 narration audio clips (~70s total)
 * 3. Uploads extracted frames → finalizes → validates output MP4
 *
 * This mirrors the real production pipeline where video clips (not
 * static images) are the primary visual source.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TEST_DATA_DIR = path.join(ROOT, 'public/production_prod_1769364025193_ch60ee8c1');
const SERVER_URL = 'http://localhost:3001';
const FPS = 24;
const BATCH_SIZE = 96;

// ── Helpers ──────────────────────────────────────────────────────

/** Extract all frames from a video clip as JPEG buffers */
function extractFramesFromVideo(videoPath: string, fps: number, tmpDir: string): Buffer[] {
    const prefix = path.join(tmpDir, 'vframe_');
    execSync(
        `ffmpeg -hide_banner -loglevel error -i "${videoPath}" -vf fps=${fps} -q:v 2 "${prefix}%06d.jpg" -y`,
        { maxBuffer: 50 * 1024 * 1024 }
    );

    const frameFiles = fs.readdirSync(tmpDir)
        .filter(f => f.startsWith('vframe_') && f.endsWith('.jpg'))
        .sort();

    const buffers = frameFiles.map(f => fs.readFileSync(path.join(tmpDir, f)));

    // Clean up extracted files
    frameFiles.forEach(f => fs.unlinkSync(path.join(tmpDir, f)));

    return buffers;
}

/** Concatenate WAV files into a single file */
function concatAudioFiles(wavPaths: string[], outPath: string): void {
    const inputs = wavPaths.map(p => `-i "${p}"`).join(' ');
    const filterParts = wavPaths.map((_, i) => `[${i}:a]`).join('');
    const filter = `${filterParts}concat=n=${wavPaths.length}:v=0:a=1[out]`;

    execSync(
        `ffmpeg -hide_banner -loglevel error ${inputs} -filter_complex "${filter}" -map "[out]" -y "${outPath}"`,
        { maxBuffer: 50 * 1024 * 1024 }
    );
}

/** Get audio duration in seconds */
function getAudioDuration(filePath: string): number {
    const out = execSync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
        { encoding: 'utf-8' }
    );
    return parseFloat(out.trim());
}

/** Check server health */
async function waitForServer(maxRetries = 5): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await fetch(`${SERVER_URL}/api/health`);
            if (res.ok) return;
        } catch { /* retry */ }
        console.log(`   Waiting for server... (${i + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Server is not reachable at ' + SERVER_URL);
}

function fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Main Test ────────────────────────────────────────────────────

async function testExport() {
    const t0 = Date.now();
    console.log('🚀 FFmpeg Export Integration Test (Full-Length + Video Clips)');
    console.log(`📂 Test data: ${TEST_DATA_DIR}\n`);

    await waitForServer();
    console.log('✅ Server is healthy\n');

    // Temp workspace
    const tmpDir = path.join(ROOT, 'temp', '_test_export');
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1. Concatenate all narration audio
    console.log('🔊 Preparing audio...');
    const audioFiles = fs.readdirSync(path.join(TEST_DATA_DIR, 'audio'))
        .filter(f => f.startsWith('narration_scene-') && f.endsWith('.wav'))
        .sort()
        .map(f => path.join(TEST_DATA_DIR, 'audio', f));

    const mergedAudioPath = path.join(tmpDir, 'merged_narration.wav');
    concatAudioFiles(audioFiles, mergedAudioPath);

    const audioDuration = getAudioDuration(mergedAudioPath);
    const totalFrames = Math.ceil(audioDuration * FPS);
    console.log(`   ${audioFiles.length} clips → ${fmtTime(audioDuration)} (${audioDuration.toFixed(1)}s)`);
    console.log(`   Total frames needed: ${totalFrames} @ ${FPS} FPS\n`);

    // 2. Extract frames from each Veo video clip
    console.log('🎥 Extracting frames from video clips...');
    const videoFiles = fs.readdirSync(path.join(TEST_DATA_DIR, 'video_clips'))
        .filter(f => f.endsWith('.mp4'))
        .sort();

    const sceneFrames: Buffer[][] = [];
    let totalExtracted = 0;

    for (const vid of videoFiles) {
        const vidPath = path.join(TEST_DATA_DIR, 'video_clips', vid);
        const frames = extractFramesFromVideo(vidPath, FPS, tmpDir);
        sceneFrames.push(frames);
        totalExtracted += frames.length;
        console.log(`   ✓ ${vid} → ${frames.length} frames (${(frames.reduce((s, b) => s + b.length, 0) / 1024 / 1024).toFixed(1)} MB)`);
    }
    console.log(`   ${totalExtracted} total frames extracted from ${videoFiles.length} clips\n`);

    // 3. Build the full frame list by distributing scenes evenly across the timeline
    //    Each scene gets an equal share of the total duration.
    //    If a scene's video is shorter, loop its frames; if longer, truncate.
    const framesPerScene = Math.ceil(totalFrames / sceneFrames.length);
    const allFrames: { buffer: Buffer; name: string }[] = [];

    for (let i = 0; i < totalFrames; i++) {
        const sceneIdx = Math.min(Math.floor(i / framesPerScene), sceneFrames.length - 1);
        const sceneData = sceneFrames[sceneIdx]!;
        const localFrame = (i - sceneIdx * framesPerScene) % sceneData.length;
        allFrames.push({
            buffer: sceneData[localFrame]!,
            name: `frame${i.toString().padStart(6, '0')}.jpg`,
        });
    }
    console.log(`📦 ${allFrames.length} frames assembled (${sceneFrames.length} scenes × ~${framesPerScene} frames each)\n`);

    // 4. Init session
    console.log('📡 Initializing export session...');
    const audioBlob = new Blob([fs.readFileSync(mergedAudioPath)], { type: 'audio/wav' });
    const initForm = new FormData();
    initForm.append('audio', audioBlob, 'audio.mp3');
    initForm.append('fps', String(FPS));
    initForm.append('totalFrames', String(totalFrames));

    const initRes = await fetch(`${SERVER_URL}/api/export/init`, {
        method: 'POST',
        body: initForm,
    });
    if (!initRes.ok) throw new Error(`Init failed: ${initRes.status} - ${await initRes.text()}`);

    const { sessionId, jobId } = await initRes.json();
    console.log(`   Session: ${sessionId}  Job: ${jobId}\n`);

    // 5. Upload frames in batches
    const totalBatches = Math.ceil(totalFrames / BATCH_SIZE);
    console.log(`📤 Uploading ${totalFrames} frames in ${totalBatches} batches...`);
    const uploadStart = Date.now();

    for (let b = 0; b < totalBatches; b++) {
        const chunk = new FormData();
        const start = b * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, totalFrames);

        for (let i = start; i < end; i++) {
            const f = allFrames[i]!;
            chunk.append('frames', new Blob([new Uint8Array(f.buffer)], { type: 'image/jpeg' }), f.name);
        }

        const res = await fetch(`${SERVER_URL}/api/export/chunk?sessionId=${sessionId}`, {
            method: 'POST',
            body: chunk,
        });
        if (!res.ok) throw new Error(`Chunk upload batch ${b + 1}/${totalBatches} failed`);

        const pct = Math.round(((b + 1) / totalBatches) * 100);
        const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
        process.stdout.write(`\r   [${bar}] ${pct}% (batch ${b + 1}/${totalBatches})`);
    }

    const uploadTime = ((Date.now() - uploadStart) / 1000).toFixed(1);
    console.log(`\n   Upload complete in ${uploadTime}s\n`);

    // 6. Finalize (sync encode)
    console.log('🎬 Finalizing (sync encode)...');
    const encodeStart = Date.now();

    const finalRes = await fetch(`${SERVER_URL}/api/export/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, fps: FPS, totalFrames, sync: true }),
    });

    if (!finalRes.ok) {
        const errBody = await finalRes.text();
        throw new Error(`Finalize failed (${finalRes.status}): ${errBody}`);
    }

    const videoBlob = await finalRes.arrayBuffer();
    const encodeTime = ((Date.now() - encodeStart) / 1000).toFixed(1);
    const sizeMB = (videoBlob.byteLength / 1024 / 1024).toFixed(2);

    console.log(`   Encode completed in ${encodeTime}s`);
    console.log(`   Output size: ${sizeMB} MB`);

    // 7. Validate
    const errors: string[] = [];

    if (videoBlob.byteLength < 10 * 1024) {
        errors.push(`Output too small (${videoBlob.byteLength} bytes)`);
    }

    const header = new Uint8Array(videoBlob.slice(0, 12));
    const ftyp = String.fromCharCode(header[4]!, header[5]!, header[6]!, header[7]!);
    if (ftyp !== 'ftyp') {
        errors.push(`Invalid MP4 header: expected 'ftyp', got '${ftyp}'`);
    }

    // Save for inspection
    const outputPath = path.join(tmpDir, 'test_output.mp4');
    fs.writeFileSync(outputPath, Buffer.from(videoBlob));
    console.log(`   Saved to: ${outputPath}`);

    // ffprobe validation
    try {
        const probeOut = execSync(
            `ffprobe -v quiet -show_entries format=duration,size,bit_rate -show_entries stream=codec_name,width,height,r_frame_rate -of json "${outputPath}"`,
            { encoding: 'utf-8' }
        );
        const probe = JSON.parse(probeOut);
        const fmt = probe.format;
        const vStream = probe.streams?.find((s: any) => s.codec_name === 'h264');
        const aStream = probe.streams?.find((s: any) => s.codec_name === 'aac');

        console.log(`\n   📋 ffprobe validation:`);
        console.log(`      Duration:   ${parseFloat(fmt.duration).toFixed(1)}s (expected ~${audioDuration.toFixed(1)}s)`);
        console.log(`      Bitrate:    ${(parseInt(fmt.bit_rate) / 1000).toFixed(0)} kbps`);
        console.log(`      Video:      ${vStream?.codec_name} ${vStream?.width}x${vStream?.height} @ ${vStream?.r_frame_rate}`);
        console.log(`      Audio:      ${aStream?.codec_name}`);

        const outDuration = parseFloat(fmt.duration);
        if (Math.abs(outDuration - audioDuration) > 2) {
            errors.push(`Duration mismatch: expected ~${audioDuration.toFixed(1)}s, got ${outDuration.toFixed(1)}s`);
        }
        if (!vStream) errors.push('No H.264 video stream found');
        if (!aStream) errors.push('No AAC audio stream found');
    } catch (e) {
        errors.push(`ffprobe validation failed: ${e}`);
    }

    // 8. Stats
    const statsRes = await fetch(`${SERVER_URL}/api/export/stats`);
    const stats = await statsRes.json();

    // 9. Report
    const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('\n' + '═'.repeat(60));
    if (errors.length === 0) {
        console.log('✅ ALL CHECKS PASSED');
        console.log(`   • Source: ${videoFiles.length} Veo clips + ${audioFiles.length} narration clips`);
        console.log(`   • Pipeline: init → ${totalBatches} chunk batches → sync finalize`);
        console.log(`   • Encoder: ${stats.encoder.selected} (hardware: ${stats.encoder.isHardware})`);
        console.log(`   • Frames: ${totalFrames} @ ${FPS} FPS → ${fmtTime(audioDuration)} video`);
        console.log(`   • Output: ${sizeMB} MB valid MP4`);
        console.log(`   • Timing: extract ${((Date.now() - t0) / 1000 - parseFloat(uploadTime) - parseFloat(encodeTime)).toFixed(1)}s | upload ${uploadTime}s | encode ${encodeTime}s | total ${totalTime}s`);
    } else {
        console.error('❌ TEST FAILED:');
        errors.forEach(e => console.error(`   • ${e}`));
        process.exit(1);
    }
    console.log('═'.repeat(60));
}

testExport().catch(err => {
    console.error('\n❌ Test failed:', err.message || err);
    process.exit(1);
});
