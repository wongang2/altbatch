import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: false },
  test: { include: ['tests/**/*.test.ts'] },
});
