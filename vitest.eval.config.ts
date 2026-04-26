import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Eval-only Vitest config.
 *
 * Separate from vitest.config.ts so `pnpm test:eval` does not pollute the
 * regular test budget (long timeouts, real API calls, large output).
 *
 * Run: pnpm test:eval               (skips behavioral evals if no API key)
 * Run: pnpm test:eval:update         (re-records snapshots)
 *
 * See __tests__/evals/README.md for fixture authoring + cost expectations.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/evals/**/*.eval.ts'],
    // Behavioral evals call real Gemini APIs; allow generous time budgets.
    testTimeout: 300_000,
    hookTimeout: 60_000,
    // Run serially by default to keep API rate within Gemini's limits.
    // Override with --threads if you have headroom.
    pool: 'forks',
    fileParallelism: false,
    server: {
      deps: {
        inline: [/@langchain\//, /packages\/shared\/src/],
      },
    },
  },
  resolve: {
    alias: {
      '@studio/shared/src': path.resolve(__dirname, 'packages/shared/src'),
      '@shared': path.resolve(__dirname, 'packages/shared/src'),
      '@langchain/google-genai': path.resolve(
        __dirname,
        'packages/shared/node_modules/@langchain/google-genai',
      ),
      '@langchain/core': path.resolve(
        __dirname,
        'packages/shared/node_modules/@langchain/core',
      ),
    },
  },
});
