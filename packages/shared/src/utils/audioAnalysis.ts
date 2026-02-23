export const extractFrequencyData = async (
  audioBuffer: AudioBuffer,
  fps: number,
  fftSize: number = 256
): Promise<Uint8Array[]> => {
  const duration = audioBuffer.duration;
  const totalFrames = Math.ceil(duration * fps);

  // Guard: If we are in an environment without proper Web Audio API support
  // (e.g. some Node.js polyfills missing suspend()), safely return empty data.
  // We try to instantiate the context first.
  let offlineCtx: OfflineAudioContext;
  try {
    offlineCtx = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
  } catch (e) {
    console.warn('Failed to create OfflineAudioContext, skipping audio analysis:', e);
    return Array(totalFrames).fill(new Uint8Array(fftSize / 2).fill(0));
  }

  // Check if suspend is supported (Node.js web-audio-api might lack this)
  if (typeof offlineCtx.suspend !== 'function') {
    console.warn('OfflineAudioContext.suspend() is not supported in this environment. Skipping precise audio analysis.');
    return Array(totalFrames).fill(new Uint8Array(fftSize / 2).fill(0));
  }

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  const analyser = offlineCtx.createAnalyser();
  analyser.fftSize = fftSize;

  source.connect(analyser);
  analyser.connect(offlineCtx.destination);

  // Use a Map to store frames by index to guarantee correct ordering
  const frameDataMap = new Map<number, Uint8Array>();
  const bufferLength = analyser.frequencyBinCount;

  // Schedule suspends for each frame (skip frame 0, handle it separately)
  for (let i = 1; i < totalFrames; i++) {
    const frameIndex = i;
    const time = i / fps;

    // We validated suspend exists above
    offlineCtx.suspend(time).then(() => {
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);
      frameDataMap.set(frameIndex, new Uint8Array(dataArray));
      offlineCtx.resume();
    }).catch(err => {
      console.error(`Error processing audio frame ${i}:`, err);
    });
  }

  source.start(0);
  try {
    await offlineCtx.startRendering();
  } catch (e) {
    console.error('Audio rendering failed:', e);
    return Array(totalFrames).fill(new Uint8Array(bufferLength).fill(0));
  }

  // Frame 0: Use empty data since audio hasn't played yet at t=0
  frameDataMap.set(0, new Uint8Array(bufferLength).fill(0));

  // Convert Map to ordered array
  const frequencyDataArray: Uint8Array[] = [];
  for (let i = 0; i < totalFrames; i++) {
    frequencyDataArray.push(frameDataMap.get(i) || new Uint8Array(bufferLength).fill(0));
  }

  return frequencyDataArray;
};