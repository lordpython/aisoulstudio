import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@studio/shared/src': path.resolve(__dirname, 'packages/shared/src'),
      '@shared': path.resolve(__dirname, 'packages/shared/src'),
    },
  },
});
