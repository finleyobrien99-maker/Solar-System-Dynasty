/// <reference types="node" />
import { defineConfig } from '@playwright/test';

// End-to-end smoke tests against the production build (`npm run e2e`).
// They drive a browser that's already installed rather than downloading one:
// Edge locally (Windows ships it), Chrome on CI (GitHub's runners have it).
// Override with PW_CHANNEL, e.g. PW_CHANNEL=chrome.
const channel = process.env.PW_CHANNEL ?? (process.env.CI ? 'chrome' : 'msedge');
// Locally an existing server on the port is reused, so two checkouts testing
// at once must use different ports (E2E_PORT), or one tests the other's build.
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry on CI, with a trace, so a flaky failure arrives with evidence
  // (the report still marks it flaky). Each test also logs its world seed.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${port}`, channel, actionTimeout: 15_000, trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
