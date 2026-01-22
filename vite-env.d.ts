/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MULTI_AGENT?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_FREESOUND_API_KEY?: string;
  readonly VITE_SUNO_API_KEY?: string;
  readonly GOOGLE_CLOUD_PROJECT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}