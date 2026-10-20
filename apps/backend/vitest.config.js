import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/tests/**/*.test.js'],
    setupFiles: ['src/tests/setup.js'],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 20000,
  },
});
