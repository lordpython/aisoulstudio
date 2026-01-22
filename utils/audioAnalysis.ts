export const extractFrequencyData = async (
  audioBuffer: AudioBuffer,
  fps: number,
  fftSize: number = 256
): Promise<Uint8Array[]> => {
  const duration = audioBuffer.duration;
  const totalFrames = Math.ceil(duration * fps);
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

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
    offlineCtx.suspend(time).then(() => {
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);
      frameDataMap.set(frameIndex, new Uint8Array(dataArray));
      offlineCtx.resume();
    });
  }

  source.start(0);
  await offlineCtx.startRendering();

  // Frame 0: Use empty data since audio hasn't played yet at t=0
  // (This is accurate - at time 0, no audio has been processed)
  frameDataMap.set(0, new Uint8Array(bufferLength).fill(0));

  // Convert Map to ordered array
  const frequencyDataArray: Uint8Array[] = [];
  for (let i = 0; i < totalFrames; i++) {
    frequencyDataArray.push(frameDataMap.get(i) || new Uint8Array(bufferLength).fill(0));
  }

  return frequencyDataArray;
};