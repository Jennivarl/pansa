import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run api -w @pansapay/demo` serves the API on 4021.
    proxy: { '/api': 'http://localhost:4021' },
  },
});
