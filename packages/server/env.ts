/**
 * Environment loader - must be imported FIRST before any modules that use env vars
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Resolve paths relative to this file so they work regardless of process.cwd()
// packages/server/env.ts → ../../ → workspace root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../');

// Load environment variables from .env files
// override: true ensures .env values win over system env vars (e.g. system PORT=3000)
// .env loads first (base), then .env.local overrides on top
config({ path: path.join(root, '.env'), override: true, debug: process.env.DEBUG === 'true' });
config({ path: path.join(root, '.env.local'), override: true, debug: process.env.DEBUG === 'true' });

// Re-export for convenience
export const env = process.env;

/**
 * Assert that required environment variables are present.
 * Throws at startup if any are missing so the error is caught early.
 *
 * Optional vars (warn only, don't throw):
 *   VITE_GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT   — at least one must be set
 *   SERVER_API_SECRET                             — auth disabled if absent
 */
function assertRequiredEnv(): void {
  const hasGeminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const hasVertexProject = process.env.GOOGLE_CLOUD_PROJECT;

  if (!hasGeminiKey && !hasVertexProject) {
    // Warn rather than throw — some routes don't need Gemini (e.g. health, export)
    console.warn(
      '[env] WARNING: Neither VITE_GEMINI_API_KEY nor GOOGLE_CLOUD_PROJECT is set. ' +
      'AI generation routes will fail.',
    );
  }
}

assertRequiredEnv();
