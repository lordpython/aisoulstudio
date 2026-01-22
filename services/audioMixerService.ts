/**
 * Audio Mixer Service
 * 
 * Mixes multiple audio tracks (narration, SFX, background music) into a single audio file.
 * Uses Web Audio API for real-time mixing and offline rendering.
 */

import { VideoSFXPlan } from "./sfxService";

// --- Types ---

export interface AudioTrack {
  /** Audio source URL or Blob */
  source: string | Blob;
  /** Start time in seconds */
  startTime: number;
  /** Duration in seconds (0 = full length) */
  duration?: number;
  /** Volume level 0-1 */
  volume: number;
  /** Whether to loop the audio */
  loop?: boolean;
  /** Fade in duration in seconds */
  fadeIn?: number;
  /** Fade out duration in seconds */
  fadeOut?: number;
}

export interface SceneAudioInfo {
  sceneId: string;
  startTime: number;
  duration: number;
}

export interface MixConfig {
  /** Main narration/voice track */
  narrationUrl: string;
  /** SFX plan with audio URLs */
  sfxPlan: VideoSFXPlan | null;
  /** Scene timing information */
  scenes: SceneAudioInfo[];
  /** Master volume for SFX (0-1) */
  sfxMasterVolume?: number;
  /** Master volume for background music (0-1) */
  musicMasterVolume?: number;
  /** Output sample rate */
  sampleRate?: number;
  /** Enable dynamic audio ducking (lowers music during speech) */
  enableDucking?: boolean;
  /** Ducking amount (0-1, how much to reduce music, default 0.7 = reduce to 30%) */
  duckingAmount?: number;
}

// --- Dynamic Audio Ducking ---

/**
 * Calculate a ducking envelope from narration audio.
 * Returns an array of gain values (0-1) representing how much to duck the music.
 * Higher values = more speech = lower music.
 * 
 * @param narrationBuffer - The decoded narration audio
 * @param sampleRate - Output sample rate
 * @param blockSize - Size of analysis blocks in samples (default: 4410 = 100ms at 44.1kHz)
 * @returns Float32Array of ducking values (0 = no duck, 1 = full duck)
 */
function calculateDuckingEnvelope(
  narrationBuffer: AudioBuffer,
  sampleRate: number = 44100,
  blockSize: number = 4410 // ~100ms blocks
): Float32Array {
  const channelData = narrationBuffer.getChannelData(0);
  const numBlocks = Math.ceil(channelData.length / blockSize);
  const envelope = new Float32Array(numBlocks);

  // Calculate RMS amplitude for each block
  for (let block = 0; block < numBlocks; block++) {
    const start = block * blockSize;
    const end = Math.min(start + blockSize, channelData.length);

    let sumSquares = 0;
    for (let i = start; i < end; i++) {
      sumSquares += channelData[i] * channelData[i];
    }

    const rms = Math.sqrt(sumSquares / (end - start));

    // Convert RMS to ducking value (0-1)
    // RMS > 0.05 indicates speech, scale up to full duck at RMS 0.3
    const threshold = 0.05;
    const ceiling = 0.30;

    if (rms < threshold) {
      envelope[block] = 0; // No speech, no duck
    } else {
      // Scale between threshold and ceiling
      const normalized = Math.min(1, (rms - threshold) / (ceiling - threshold));
      envelope[block] = normalized;
    }
  }

  // Smooth the envelope to avoid abrupt changes (simple moving average)
  const smoothedEnvelope = new Float32Array(numBlocks);
  const smoothWindow = 3; // ~300ms smoothing

  for (let i = 0; i < numBlocks; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - smoothWindow); j <= Math.min(numBlocks - 1, i + smoothWindow); j++) {
      sum += envelope[j];
      count++;
    }
    smoothedEnvelope[i] = sum / count;
  }

  return smoothedEnvelope;
}

/**
 * Apply ducking envelope to a gain node.
 * Schedules gain changes over time based on the envelope.
 */
function applyDuckingToGain(
  gainNode: GainNode,
  envelope: Float32Array,
  baseVolume: number,
  duckingAmount: number,
  blockDuration: number, // Duration of each envelope block in seconds
  startTime: number = 0
): void {
  const minVolume = baseVolume * (1 - duckingAmount);

  for (let i = 0; i < envelope.length; i++) {
    const time = startTime + i * blockDuration;
    const duckValue = envelope[i];
    const targetVolume = baseVolume - (duckValue * (baseVolume - minVolume));

    // Use exponential ramp for smoother transitions
    gainNode.gain.linearRampToValueAtTime(targetVolume, time);
  }
}



/**
 * Fetch audio from URL and decode to AudioBuffer
 */
async function fetchAndDecodeAudio(
  audioContext: OfflineAudioContext | AudioContext,
  url: string
): Promise<AudioBuffer | null> {
  try {
    console.log(`[AudioMixer] Fetching audio: ${url.substring(0, 50)}...`);
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      console.warn(`[AudioMixer] Failed to fetch audio: ${response.status}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log(`[AudioMixer] Decoded audio: ${audioBuffer.duration.toFixed(2)}s`);
    return audioBuffer;
  } catch (error) {
    console.warn(`[AudioMixer] Error fetching/decoding audio:`, error);
    return null;
  }
}

/**
 * Create a gain node with optional fade envelope
 */
function createGainWithFade(
  audioContext: OfflineAudioContext,
  startTime: number,
  duration: number,
  volume: number,
  fadeIn: number = 0,
  fadeOut: number = 0
): GainNode {
  const gainNode = audioContext.createGain();

  // Start at 0 if fade in
  if (fadeIn > 0) {
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + fadeIn);
  } else {
    gainNode.gain.setValueAtTime(volume, startTime);
  }

  // Fade out at end
  if (fadeOut > 0 && duration > fadeOut) {
    const fadeOutStart = startTime + duration - fadeOut;
    gainNode.gain.setValueAtTime(volume, fadeOutStart);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
  }

  return gainNode;
}

// --- Main Mixing Function ---

/**
 * Mix narration with SFX and background music.
 * Returns a WAV blob with all audio mixed together.
 */
export async function mixAudioWithSFX(config: MixConfig): Promise<Blob> {
  const {
    narrationUrl,
    sfxPlan,
    scenes,
    sfxMasterVolume = 1.0,
    musicMasterVolume = 0.5,
    sampleRate = 44100,
  } = config;

  console.log("[AudioMixer] Starting audio mix...");
  console.log(`[AudioMixer] Scenes: ${scenes.length}, SFX Plan: ${sfxPlan ? 'yes' : 'no'}`);

  // First, fetch and decode the main narration to get total duration
  const tempContext = new AudioContext({ sampleRate });
  const narrationBuffer = await fetchAndDecodeAudio(tempContext, narrationUrl);

  if (!narrationBuffer) {
    throw new Error("Failed to load narration audio");
  }

  const totalDuration = narrationBuffer.duration;
  const totalSamples = Math.ceil(totalDuration * sampleRate);

  console.log(`[AudioMixer] Total duration: ${totalDuration.toFixed(2)}s`);

  // Create offline context for rendering
  const offlineContext = new OfflineAudioContext(
    1, // mono output
    totalSamples,
    sampleRate
  );

  // --- Track 1: Narration (main voice) ---
  const narrationSource = offlineContext.createBufferSource();
  narrationSource.buffer = narrationBuffer;

  const narrationGain = offlineContext.createGain();
  narrationGain.gain.setValueAtTime(1.0, 0); // Full volume for narration

  narrationSource.connect(narrationGain);
  narrationGain.connect(offlineContext.destination);
  narrationSource.start(0);

  // --- Track 2: Scene-specific SFX ---
  if (sfxPlan && sfxPlan.scenes.length > 0) {
    let currentTime = 0;

    for (let i = 0; i < scenes.length; i++) {
      const sceneInfo = scenes[i];
      const sfxScene = sfxPlan.scenes.find(s => s.sceneId === sceneInfo.sceneId);

      if (sfxScene?.ambientTrack?.audioUrl) {
        try {
          const sfxBuffer = await fetchAndDecodeAudio(offlineContext, sfxScene.ambientTrack.audioUrl);

          if (sfxBuffer) {
            const sfxSource = offlineContext.createBufferSource();
            sfxSource.buffer = sfxBuffer;
            sfxSource.loop = true; // Loop ambient sounds

            // Calculate volume (use suggested volume * master volume)
            const volume = (sfxScene.ambientTrack.suggestedVolume || 0.3) * sfxMasterVolume;

            // Create gain with fade in/out for smooth transitions
            const fadeTime = 0.5; // 500ms fade
            const sfxGain = createGainWithFade(
              offlineContext,
              sceneInfo.startTime,
              sceneInfo.duration,
              volume,
              fadeTime,
              fadeTime
            );

            sfxSource.connect(sfxGain);
            sfxGain.connect(offlineContext.destination);

            // Start at scene start, stop at scene end
            sfxSource.start(sceneInfo.startTime);
            sfxSource.stop(sceneInfo.startTime + sceneInfo.duration);

            console.log(`[AudioMixer] Added SFX "${sfxScene.ambientTrack.name}" at ${sceneInfo.startTime.toFixed(1)}s for ${sceneInfo.duration.toFixed(1)}s`);
          }
        } catch (error) {
          console.warn(`[AudioMixer] Failed to add SFX for scene ${sceneInfo.sceneId}:`, error);
        }
      }

      currentTime += sceneInfo.duration;
    }
  }

  // --- Track 3: Background Music (with optional ducking) ---
  if (sfxPlan?.backgroundMusic?.audioUrl) {
    try {
      const musicBuffer = await fetchAndDecodeAudio(offlineContext, sfxPlan.backgroundMusic.audioUrl);

      if (musicBuffer) {
        const musicSource = offlineContext.createBufferSource();
        musicSource.buffer = musicBuffer;
        musicSource.loop = true; // Loop background music

        // Base volume for background music
        const volume = (sfxPlan.backgroundMusic.suggestedVolume || 0.6) * musicMasterVolume;

        // Create music gain node
        const musicGain = offlineContext.createGain();

        // Check if ducking is enabled
        const { enableDucking = true, duckingAmount = 0.7 } = config;

        if (enableDucking) {
          // Calculate ducking envelope from narration
          const blockSize = Math.round(sampleRate * 0.1); // 100ms blocks
          const duckingEnvelope = calculateDuckingEnvelope(narrationBuffer, sampleRate, blockSize);
          const blockDuration = blockSize / sampleRate;

          console.log(`[AudioMixer] Applying dynamic ducking (${(duckingAmount * 100).toFixed(0)}% reduction during speech)`);

          // Apply initial fade in
          musicGain.gain.setValueAtTime(0, 0);
          musicGain.gain.linearRampToValueAtTime(volume, 2.0);

          // Apply ducking envelope starting after fade in
          applyDuckingToGain(musicGain, duckingEnvelope, volume, duckingAmount, blockDuration, 2.0);

          // Fade out at end
          if (totalDuration > 4) {
            musicGain.gain.setValueAtTime(volume * (1 - duckingEnvelope[duckingEnvelope.length - 1] || 0), totalDuration - 2);
            musicGain.gain.linearRampToValueAtTime(0, totalDuration);
          }
        } else {
          // No ducking - use standard fade envelope
          musicGain.gain.setValueAtTime(0, 0);
          musicGain.gain.linearRampToValueAtTime(volume, 2.0); // 2s fade in
          musicGain.gain.setValueAtTime(volume, totalDuration - 2);
          musicGain.gain.linearRampToValueAtTime(0, totalDuration); // 2s fade out
        }

        musicSource.connect(musicGain);
        musicGain.connect(offlineContext.destination);
        musicSource.start(0);
        musicSource.stop(totalDuration);

        console.log(`[AudioMixer] Added background music "${sfxPlan.backgroundMusic.name}"${enableDucking ? ' with dynamic ducking' : ''}`);
      }
    } catch (error) {
      console.warn("[AudioMixer] Failed to add background music:", error);
    }
  }

  // --- Render the mix ---
  console.log("[AudioMixer] Rendering audio mix...");
  const renderedBuffer = await offlineContext.startRendering();

  // Convert to WAV
  const wavBlob = audioBufferToWav(renderedBuffer);
  console.log(`[AudioMixer] Mix complete: ${(wavBlob.size / 1024 / 1024).toFixed(2)} MB`);

  // Cleanup
  await tempContext.close();

  return wavBlob;
}

/**
 * Convert AudioBuffer to WAV Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const samples = buffer.length;
  const dataSize = samples * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write audio data
  const channelData = buffer.getChannelData(0);
  let offset = 44;

  for (let i = 0; i < samples; i++) {
    // Clamp and convert to 16-bit
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Check if SFX mixing is available (has audio URLs)
 */
export function canMixSFX(sfxPlan: VideoSFXPlan | null): boolean {
  if (!sfxPlan) return false;

  // Check if any scene has an audio URL
  const hasSceneSfx = sfxPlan.scenes.some(s => s.ambientTrack?.audioUrl);
  const hasBackgroundMusic = !!sfxPlan.backgroundMusic?.audioUrl;

  return hasSceneSfx || hasBackgroundMusic;
}

/**
 * Merges multiple audio blobs into a single linear WAV file.
 * Used for concatenating scene narration segments.
 */
export async function mergeConsecutiveAudioBlobs(
  blobs: Blob[],
  sampleRate: number = 24000
): Promise<Blob> {
  if (blobs.length === 0) {
    throw new Error("No blobs to merge");
  }

  // If only one blob, just return it (or converting if needed, but assuming compatible)
  if (blobs.length === 1) {
    return blobs[0];
  }

  console.log(`[AudioMixer] Merging ${blobs.length} blobs...`);

  // Decode all blobs
  const audioContext = new AudioContext({ sampleRate });
  const audioBuffers: AudioBuffer[] = [];

  try {
    for (const blob of blobs) {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      audioBuffers.push(audioBuffer);
    }

    // Calculate total duration
    const totalDuration = audioBuffers.reduce((acc, buf) => acc + buf.duration, 0);
    const totalSamples = Math.ceil(totalDuration * sampleRate);

    // Create offline context
    const offlineContext = new OfflineAudioContext(1, totalSamples, sampleRate);

    // Schedule sources
    let currentTime = 0;
    for (const buffer of audioBuffers) {
      const source = offlineContext.createBufferSource();
      source.buffer = buffer;
      source.connect(offlineContext.destination);
      source.start(currentTime);
      currentTime += buffer.duration;
    }

    // Render
    const renderedBuffer = await offlineContext.startRendering();

    // Convert to WAV
    return audioBufferToWav(renderedBuffer);
  } finally {
    await audioContext.close();
  }
}
