/**
 * Audio Utilities for Agent Tools
 *
 * Provides utilities for concatenating and managing audio blobs
 */

import { NarrationSegment } from "../../types";

/**
 * Concatenate multiple WAV audio blobs into a single WAV blob
 *
 * IMPORTANT: This assumes all blobs are WAV files with the same format
 * (sample rate, bit depth, channels). Gemini TTS produces 24kHz, 16-bit, mono WAV.
 *
 * @param audioBlobs - Array of WAV audio blobs to concatenate
 * @returns Single concatenated WAV blob
 */
export async function concatenateWavBlobs(audioBlobs: Blob[]): Promise<Blob> {
  if (audioBlobs.length === 0) {
    throw new Error("No audio blobs to concatenate");
  }

  if (audioBlobs.length === 1) {
    return audioBlobs[0];
  }

  // WAV file structure:
  // - 44 bytes header (RIFF, fmt, data chunks)
  // - Remaining bytes are PCM audio data

  const WAV_HEADER_SIZE = 44;

  // Read all PCM data (skip headers)
  const pcmDataArrays: Uint8Array[] = [];
  let totalPcmSize = 0;

  for (const blob of audioBlobs) {
    const arrayBuffer = await blob.arrayBuffer();
    const fullData = new Uint8Array(arrayBuffer);

    // Extract PCM data (skip 44-byte header)
    const pcmData = fullData.slice(WAV_HEADER_SIZE);
    pcmDataArrays.push(pcmData);
    totalPcmSize += pcmData.length;
  }

  // Concatenate all PCM data
  const concatenatedPcm = new Uint8Array(totalPcmSize);
  let offset = 0;
  for (const pcmData of pcmDataArrays) {
    concatenatedPcm.set(pcmData, offset);
    offset += pcmData.length;
  }

  // Create new WAV header for the concatenated audio
  const newWavHeader = createWavHeader(
    concatenatedPcm.length,
    24000, // Gemini TTS sample rate
    1,     // Mono
    16     // 16-bit
  );

  // Combine header and PCM data
  const finalWav = new Uint8Array(newWavHeader.length + concatenatedPcm.length);
  finalWav.set(newWavHeader, 0);
  finalWav.set(concatenatedPcm, newWavHeader.length);

  return new Blob([finalWav], { type: 'audio/wav' });
}

/**
 * Create a WAV header for PCM audio data
 *
 * @param pcmDataLength - Length of PCM data in bytes
 * @param sampleRate - Sample rate (default 24000 for Gemini TTS)
 * @param numChannels - Number of channels (default 1 for mono)
 * @param bitsPerSample - Bits per sample (default 16)
 * @returns WAV header as Uint8Array
 */
function createWavHeader(
  pcmDataLength: number,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16
): Uint8Array {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const fileSize = pcmDataLength + 36; // 44 - 8 bytes

  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, pcmDataLength, true);

  return new Uint8Array(header);
}

/**
 * Write string to DataView
 */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Concatenate narration segments into a single audio blob
 *
 * @param segments - Array of narration segments
 * @returns Single concatenated audio blob
 */
export async function concatenateNarrationSegments(
  segments: NarrationSegment[]
): Promise<Blob> {
  if (segments.length === 0) {
    throw new Error("No narration segments to concatenate");
  }

  const audioBlobs = segments.map(seg => seg.audioBlob);
  return concatenateWavBlobs(audioBlobs);
}
