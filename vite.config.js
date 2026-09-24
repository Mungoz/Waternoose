import { defineConfig } from 'vite';

// itch.io serves the game from a sub-path inside an iframe, so every asset
// URL must be relative.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  worker: { format: 'es' },
});
