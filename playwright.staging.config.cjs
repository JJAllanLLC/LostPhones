const { defineConfig } = require('@playwright/test');

const STAGING_ORIGIN = 'https://lostphones-v2-staging.vercel.app';
const requestedOrigin = process.env.LOSTPHONES_E2E_BASE_URL || STAGING_ORIGIN;

if (requestedOrigin !== STAGING_ORIGIN) {
  throw new Error('The paid-download E2E suite may only target LostPhones V2 staging.');
}
if (process.env.CI && !process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  throw new Error('VERCEL_AUTOMATION_BYPASS_SECRET is required in CI.');
}

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  outputDir: 'test-results/staging-e2e',
  use: {
    baseURL: STAGING_ORIGIN,
    browserName: 'chromium',
    acceptDownloads: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  }
});
