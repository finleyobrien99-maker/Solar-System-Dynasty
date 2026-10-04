/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Relative base so the build works on GitHub Pages or any static host.
// `--mode app` builds one self-contained HTML file for the phone app in mobile/.
export default defineConfig(({ mode }) =>
  mode === 'app'
    ? {
        base: './',
        plugins: [react(), viteSingleFile()],
        build: { outDir: 'mobile/web-build', emptyOutDir: true, copyPublicDir: false },
      }
    : {
        base: './',
        plugins: [react()],
        // React rarely changes and the game often, so React gets its own file
        // and returning players only re-download the game. No lazy-loaded
        // screens: the offline service worker only caches what has been
        // fetched, so a screen never opened online would fail offline.
        build: { rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-dom/client'] } } } },
        // Unit tests live beside the engine; e2e/ belongs to Playwright.
        test: { include: ['src/**/*.test.{ts,tsx}'] },
      },
);
