export * from './types';
export * from './rateLimiter';
export * from './generation';
export * from './manipulation';
export * from './audioProcessing';

// Register debug helpers on window for browser console access
import { testSunoAPI, createMusicVideo, generateCover, generatePersona } from './generation';
import { extendMusic, uploadAndExtend } from './manipulation';
import { convertToWav, separateVocals, getStemSeparationStatus, uploadFileBase64, uploadFileUrl } from './audioProcessing';

if (typeof window !== "undefined") {
  (window as any).testSunoAPI = testSunoAPI;
  (window as any).sunoVideo = createMusicVideo;
  (window as any).sunoCover = generateCover;
  (window as any).sunoExtend = extendMusic;
  (window as any).sunoUploadExtend = uploadAndExtend;
  (window as any).sunoPersona = generatePersona;
  (window as any).sunoConvertWav = convertToWav;
  (window as any).sunoSeparateVocals = separateVocals;
  (window as any).sunoStemStatus = getStemSeparationStatus;
  (window as any).sunoUploadBase64 = uploadFileBase64;
  (window as any).sunoUploadUrl = uploadFileUrl;
}
