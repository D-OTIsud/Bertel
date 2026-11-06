import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.STORYBOOK_TEST_PORT ?? 6016);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/storybook',
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure', serviceWorkers: 'block' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.STORYBOOK_SKIP_WEBSERVER === '1' ? undefined : {
    // Omit --host deliberately: the patched release must bind loopback by default.
    command: `node node_modules/storybook/dist/bin/dispatcher.js dev --port ${port} --ci --no-open --no-version-updates --exact-port --disable-telemetry`,
    env: { NEXT_PUBLIC_ENABLE_DEMO_MODE: 'true', STORYBOOK_DISABLE_TELEMETRY: '1' },
    // The manager can respond before the preview compiler is ready.
    url: `${baseURL}/iframe.html`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
