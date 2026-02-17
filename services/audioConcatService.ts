/**
 * Audio Concatenation Service
 * 
 * Combines multiple audio segments into a single audio file using Web Audio API.
 * Used for combining narration segments before video export.
 */

export interface AudioSegment {
  url: string;
  duration: number;
}

/**
 * Concatenate multiple audio URLs into a single audio blob
 * Uses Web Audio API for proper audio decoding and re-encoding
 */
export async function concatenateAudioSegments(
  segments: AudioSegment[],
  onProgress?: (percent: number) => void
): Promise<Blob> {
  if (segments.length === 0) {
    throw new Error('No audio segments provided');
  }

  if (segments.length === 1 && segments[0]) {
    // Single segment - just fetch and return
    const response = await fetch(segments[0].url);
    return response.blob();
  }

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

  try {
    // Fetch and decode all audio segments
    const decodedBuffers: AudioBuffer[] = [];
    
    for (let i = 0; i < segments.length; i++) {
      onProgress?.(Math.round((i / segments.length) * 50));
      
      const seg = segments[i];
      if (!seg) continue;
      const response = await fetch(seg.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      decodedBuffers.push(audioBuffer);
    }

    // Calculate total duration
    const totalLength = decodedBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const firstBuffer = decodedBuffers[0];
    if (!firstBuffer) throw new Error('No audio buffers decoded');
    const sampleRate = firstBuffer.sampleRate;
    const numberOfChannels = Math.max(...decodedBuffers.map(b => b.numberOfChannels));

    // Create output buffer
    const outputBuffer = audioContext.createBuffer(
      numberOfChannels,
      totalLength,
      sampleRate
    );

    // Copy all segments into output buffer
    let offset = 0;
    for (let i = 0; i < decodedBuffers.length; i++) {
      onProgress?.(50 + Math.round((i / decodedBuffers.length) * 30));
      
      const buffer = decodedBuffers[i];
      if (!buffer) continue;
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        const inputData = buffer.numberOfChannels > channel
          ? buffer.getChannelData(channel)
          : buffer.getChannelData(0); // Use first channel if mono
        outputData.set(inputData, offset);
      }
      offset += buffer.length;
    }

    onProgress?.(85);

    // Encode to WAV (simple format that works everywhere)
    const wavBlob = audioBufferToWav(outputBuffer);
    
    onProgress?.(100);
    
    return wavBlob;
  } finally {
    await audioContext.close();
  }
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
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write interleaved audio data
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i] ?? 0;
      // Clamp and convert to 16-bit integer
      const intSample = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Create a combined audio URL from multiple narration segments
 */
export async function createCombinedNarrationAudio(
  segments: Array<{ audioUrl?: string; duration: number }>,
  onProgress?: (message: string, percent: number) => void
): Promise<string> {
  const validSegments: AudioSegment[] = segments
    .filter((s): s is { audioUrl: string; duration: number } => !!s.audioUrl)
    .map(s => ({ url: s.audioUrl, duration: s.duration }));
  
  if (validSegments.length === 0) {
    throw new Error('No valid audio segments found');
  }

  if (validSegments.length === 1) {
    return validSegments[0]!.url;
  }

  onProgress?.('Combining narration audio...', 10);

  const combinedBlob = await concatenateAudioSegments(
    validSegments.map(s => ({ url: s.url, duration: s.duration })),
    (percent) => onProgress?.('Combining audio...', 10 + (percent * 0.2))
  );

  const combinedUrl = URL.createObjectURL(combinedBlob);
  
  onProgress?.('Audio combined', 30);
  
  return combinedUrl;
}
