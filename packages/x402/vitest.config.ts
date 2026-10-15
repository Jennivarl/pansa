import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Test against core's source, no build step needed.
    alias: { '@pansapay/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
  },
});
