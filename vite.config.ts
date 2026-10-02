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
      },
);
