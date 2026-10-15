import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ScopeLift's ESM build uses directory imports Node can't resolve; let vite bundle it.
    server: { deps: { inline: ['@scopelift/stealth-address-sdk'] } },
  },
});
