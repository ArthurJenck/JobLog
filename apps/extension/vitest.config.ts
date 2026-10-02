import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['utils/**/*.{test,spec}.ts'],
  },
});
