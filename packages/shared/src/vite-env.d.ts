// Minimal ImportMeta augmentation for shared package
// Used by services that access import.meta.env (e.g., logger.ts, ai/config.ts)
// Safe in both browser (Vite replaces values) and Node.js (optional chaining handles undefined)

interface ImportMetaEnv {
  readonly VITE_USE_MULTI_AGENT?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_FREESOUND_API_KEY?: string;
  readonly VITE_SUNO_API_KEY?: string;
  readonly VITE_DEAPI_API_KEY?: string;
  readonly VITE_LANGSMITH_API_KEY?: string;
  readonly GOOGLE_CLOUD_PROJECT?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly url: string;
  glob<T = unknown>(
    pattern: string,
    options?: { eager?: boolean; as?: string; query?: string; import?: string }
  ): Record<string, T>;
}
