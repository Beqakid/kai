import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@kai/ui-sdk': path.resolve(__dirname, '../kai-ui-sdk/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
  },
});
