import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
    // Inline @langchain/* and packages/shared/src so all imports go through the
    // same Vite module graph, allowing vi.mock() to intercept @langchain/* imports
    // made from within packages/shared/src (e.g. storyPipeline.ts).
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
      // Resolve @langchain/* from the root workspace so vi.mock('@langchain/...')
      // intercepts the same module instance used by packages/shared/src.
      '@langchain/google-genai': path.resolve(
        __dirname,
        'packages/shared/node_modules/@langchain/google-genai'
      ),
      '@langchain/core': path.resolve(
        __dirname,
        'packages/shared/node_modules/@langchain/core'
      ),
    },
  },
});
