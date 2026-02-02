/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MULTI_AGENT?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_FREESOUND_API_KEY?: string;
  readonly VITE_SUNO_API_KEY?: string;
  readonly VITE_DEAPI_API_KEY?: string;
  readonly VITE_LANGSMITH_API_KEY?: string;
  readonly GOOGLE_CLOUD_PROJECT?: string;

  // Firebase Authentication
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}