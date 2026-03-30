#!/usr/bin/env node
/**
 * Real Render Integration Test
 *
 * TWO modes:
 *
 *   --local   (default) — Converts scenes to JPEG frames and encodes locally via
 *              ffmpeg using libx264. Fastest way to see real output. No server needed.
 *
 *   --server  — Exercises the full HTTP export pipeline (init → chunk → finalize).
 *              Server must be running: pnpm run server
 *
 * Usage:
 *   node scripts/test-render.mjs                   # local ffmpeg test
 *   node scripts/test-render.mjs --seconds 2       # 2s per scene
 *   node scripts/test-render.mjs --scenes 2        # only 2 scenes
 *   node scripts/test-render.mjs --server          # use server pipeline
 *
 * Output: dist/test-render-output.mp4
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFileSync, execFile } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SERVER = process.env.SERVER_URL ?? 'http://localhost:3001';

const ASSETS_DIR = path.join(ROOT, 'packages/frontend/public/production_prod_1769364025193_ch60ee8c1');
const OUT = path.join(ROOT, 'dist/test-render-output.mp4');

// --- CLI args ---
const args = process.argv.slice(2);
const getFlag = (flag) => args.includes(flag);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? Number(args[i + 1]) || null : null;
};
const USE_SERVER = getFlag('--server');
const SECONDS_PER_SCENE = getArg('--seconds') ?? 4;
const SCENE_COUNT = getArg('--scenes') ?? 5;
const FPS = 24;
const BATCH_SIZE = 48;

const ALL_SCENES = ['scene_0.png', 'scene_1.png', 'scene_2.png', 'scene_3.png', 'scene_4.png'];
const SCENES = ALL_SCENES.slice(0, SCENE_COUNT);
const AUDIO_FILE = 'narration_scene-1.wav';

// ─── image helpers ───────────────────────────────────────────────────────────

/** Convert a PNG to JPEG at 720p using ffmpeg. Returns a Buffer of JPEG bytes. */
function pngToJpeg(srcPath, quality = 3) {
  const tmp = path.join(os.tmpdir(), `studio_test_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  try {
    execFileSync('ffmpeg', [
      '-y',
      '-i', srcPath,
      '-vframes', '1',
      '-q:v', String(quality),
      '-vf', 'scale=1280:720',
      tmp,
    ], { stdio: 'pipe' });
    return fs.readFileSync(tmp);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// ─── local encode path ───────────────────────────────────────────────────────

/**
 * Write JPEG frames to a temp dir and encode with ffmpeg locally.
 * Uses libx264 for reliable software encoding.
 */
async function runLocalEncode(sceneBuffers, audioPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-render-'));

  try {
    // Write frames
    process.stdout.write(`   Writing frames to ${tmpDir}... `);
    let frameIndex = 0;
    for (const buf of sceneBuffers) {
      const framesForScene = FPS * SECONDS_PER_SCENE;
      for (let f = 0; f < framesForScene; f++) {
        const name = `frame${String(frameIndex).padStart(6, '0')}.jpg`;
        fs.writeFileSync(path.join(tmpDir, name), buf);
        frameIndex++;
      }
    }
    console.log(`${frameIndex} frames ✓`);

    // Build ffmpeg args
    const inputPattern = path.join(tmpDir, 'frame%06d.jpg');
    const ffmpegArgs = [
      '-y',
      '-framerate', String(FPS),
      '-i', inputPattern,
    ];

    if (fs.existsSync(audioPath)) {
      ffmpegArgs.push('-i', audioPath);
      ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
    }

    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '21',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      OUT,
    );

    fs.mkdirSync(path.dirname(OUT), { recursive: true });

    // Run with progress
    console.log('   Encoding with libx264...');
    await new Promise((resolve, reject) => {
      const proc = execFile('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stderr = '';
      proc.stderr?.on('data', (d) => {
        stderr += d.toString();
        const m = stderr.match(/frame=\s*(\d+)/g);
        if (m) {
          const last = m[m.length - 1]?.match(/\d+/)?.[0];
          if (last) {
            const pct = Math.round((parseInt(last) / frameIndex) * 100);
            const bar = '█'.repeat(Math.floor(pct / 5)).padEnd(20, '░');
            process.stdout.write(`\r   [${bar}] ${pct}%  (frame ${last}/${frameIndex})            `);
          }
        }
      });

      proc.on('close', (code) => {
        process.stdout.write('\n');
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}\n${stderr.slice(-500)}`));
      });
    });
  } finally {
    // Clean up temp frames
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── server path helpers ─────────────────────────────────────────────────────

async function checkServer() {
  try {
    const r = await fetch(`${SERVER}/api/health`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function initSession(audioData, totalFrames) {
  const form = new FormData();
  form.append('audio', new Blob([audioData], { type: 'audio/wav' }), 'audio.mp3');
  form.append('fps', String(FPS));
  form.append('totalFrames', String(totalFrames));
  const r = await fetch(`${SERVER}/api/export/init`, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`Init failed ${r.status}: ${await r.text().catch(() => '')}`);
  return r.json();
}

async function uploadBatch(sessionId, frames) {
  const form = new FormData();
  for (const { name, data } of frames) {
    form.append('frames', new Blob([data], { type: 'image/jpeg' }), name);
  }
  const r = await fetch(`${SERVER}/api/export/chunk?sessionId=${sessionId}`, {
    method: 'POST', body: form,
  });
  if (!r.ok) throw new Error(`Chunk failed ${r.status}: ${await r.text().catch(() => '')}`);
}

async function finalizeExport(sessionId, totalFrames) {
  const r = await fetch(`${SERVER}/api/export/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, fps: FPS, totalFrames, sync: false }),
  });
  if (!r.ok) throw new Error(`Finalize failed ${r.status}`);
  return r.json();
}

async function listenForJob(jobId) {
  const r = await fetch(`${SERVER}/api/export/events/${jobId}`, {
    headers: { Accept: 'text/event-stream' },
  });
  if (!r.ok) throw new Error(`SSE connect failed ${r.status}`);

  let lastPct = -1;
  let buf = '';

  for await (const chunk of r.body) {
    buf += Buffer.from(chunk).toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      let data;
      try { data = JSON.parse(line.slice(5).trim()); } catch { continue; }

      const pct = Math.round(data.progress ?? 0);
      if (pct !== lastPct) {
        lastPct = pct;
        const bar = '█'.repeat(Math.floor(pct / 5)).padEnd(20, '░');
        process.stdout.write(`\r   [${bar}] ${pct}%  ${data.message ?? ''}            `);
      }

      if (data.status === 'complete') { process.stdout.write('\n'); return; }
      if (data.status === 'failed') {
        process.stdout.write('\n');
        throw new Error(data.error ?? 'Job failed');
      }
    }
  }
}

async function downloadVideo(jobId) {
  const r = await fetch(`${SERVER}/api/export/download/${jobId}`);
  if (!r.ok) throw new Error(`Download failed ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// ─── server encode path ──────────────────────────────────────────────────────

async function runServerEncode(sceneBuffers, audioBuffer, totalFrames) {
  if (!(await checkServer())) {
    console.error('\n   ❌  Server offline. Run: pnpm run server\n');
    process.exit(1);
  }
  console.log('   Server online ✓');

  process.stdout.write('   Initializing session... ');
  const { sessionId } = await initSession(audioBuffer, totalFrames);
  console.log(`session=${sessionId} ✓`);

  console.log(`   Uploading ${totalFrames} frames...`);
  let frameIndex = 0;
  for (let si = 0; si < sceneBuffers.length; si++) {
    process.stdout.write(`   Scene ${si + 1}/${sceneBuffers.length} `);
    let batch = [];
    for (let f = 0; f < FPS * SECONDS_PER_SCENE; f++) {
      batch.push({ name: `frame${String(frameIndex).padStart(6, '0')}.jpg`, data: sceneBuffers[si] });
      frameIndex++;
      if (batch.length >= BATCH_SIZE) { await uploadBatch(sessionId, batch); process.stdout.write('.'); batch = []; }
    }
    if (batch.length) { await uploadBatch(sessionId, batch); process.stdout.write('.'); }
    console.log(` ✓`);
  }

  process.stdout.write('   Queuing job... ');
  const { jobId } = await finalizeExport(sessionId, totalFrames);
  console.log(`${jobId} ✓`);

  console.log('   Waiting for SSE completion:');
  await listenForJob(jobId);

  process.stdout.write('   Downloading... ');
  const videoData = await downloadVideo(jobId);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, videoData);
  console.log(`${(videoData.length / 1024 / 1024).toFixed(1)} MB ✓`);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const totalFrames = SCENES.length * FPS * SECONDS_PER_SCENE;
  const totalSeconds = SCENES.length * SECONDS_PER_SCENE;
  const mode = USE_SERVER ? 'server (HTTP pipeline)' : 'local (ffmpeg direct)';

  console.log('┌─ Real Render Integration Test ────────────────────────────┐');
  console.log(`│  Mode   : ${mode.padEnd(46)}│`);
  console.log(`│  Scenes : ${String(SCENES.length).padEnd(2)} × ${SECONDS_PER_SCENE}s = ${totalSeconds}s  @  ${FPS}fps${' '.repeat(26)}│`);
  console.log(`│  Frames : ${String(totalFrames).padEnd(46)}│`);
  console.log(`│  Output : dist/test-render-output.mp4${' '.repeat(19)}│`);
  console.log('└───────────────────────────────────────────────────────────┘\n');

  // Convert PNGs to real JPEG
  process.stdout.write('1. Converting scenes to 720p JPEG... ');
  const scenePaths = SCENES.map(f => path.join(ASSETS_DIR, 'visuals', f));
  const missing = scenePaths.find(p => !fs.existsSync(p));
  if (missing) { console.error(`\n   ❌  Missing: ${missing}`); process.exit(1); }
  const sceneBuffers = scenePaths.map(p => pngToJpeg(p));
  const audioPath = path.join(ASSETS_DIR, 'audio', AUDIO_FILE);
  if (!fs.existsSync(audioPath)) { console.error(`\n   ❌  Missing audio: ${audioPath}`); process.exit(1); }
  const audioBuffer = fs.readFileSync(audioPath);
  const totalMb = (sceneBuffers.reduce((s, b) => s + b.length, 0) / 1024 / 1024).toFixed(1);
  console.log(`done (${totalMb} MB)\n`);

  console.log('2. Encoding video:');
  if (USE_SERVER) {
    await runServerEncode(sceneBuffers, audioBuffer, totalFrames);
  } else {
    await runLocalEncode(sceneBuffers, audioPath);
  }

  const sizeMb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅  Done!  ${OUT}  (${sizeMb} MB)`);
  console.log(`   Play   : start "${path.resolve(OUT)}"`);
}

main().catch(err => {
  console.error('\n❌ ', err.message);
  process.exit(1);
});
