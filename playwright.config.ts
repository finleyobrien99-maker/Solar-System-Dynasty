/// <reference types="node" />
import { defineConfig } from '@playwright/test';

// End-to-end smoke tests against the production build (`npm run e2e`).
// They drive a browser that's already installed rather than downloading one:
// Edge locally (Windows ships it), Chrome on CI (GitHub's runners have it).
// Override with PW_CHANNEL, e.g. PW_CHANNEL=chrome.
const channel = process.env.PW_CHANNEL ?? (process.env.CI ? 'chrome' : 'msedge');

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', channel, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
