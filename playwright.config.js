import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {timeout: 7000},
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', {open: 'never'}]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium', channel: 'chromium',
    viewport: {width: 1440, height: 1000},
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure', screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node scripts/preview.mjs --timeout=3600',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 15000
  }
});
