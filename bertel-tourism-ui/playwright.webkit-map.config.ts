import { defineConfig, devices } from '@playwright/test';
import map from './playwright.map-preview.config';

// Opt-in only: reuse the existing synthetic route guards and approved controls.
// The CDP brief-hover witness is Chromium-specific and is outside this selection.
export default defineConfig({
  ...map,
  grep: /compact map (with touch|restores the opening pin)/,
  globalTimeout: 300_000,
  use: { ...map.use, serviceWorkers: 'block' },
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }],
});
