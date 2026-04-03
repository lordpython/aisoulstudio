export * from './voiceConfig';
export * from './dialogueDetection';
export * from './ttsCore';
export * from './narration';
// Re-exported for backward compat — consumers can import from either narratorService or deapiService
export { DEAPI_TTS_MODELS, type DeApiTtsModel } from '../deapiService';
