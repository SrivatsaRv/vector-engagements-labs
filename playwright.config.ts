import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.VECTOR_URL;
const port = 4319;

export default defineConfig({
  testDir: "tests/browser",
  outputDir: "outputs/playwright",
  reporter: [["list"], ["html", { outputFolder: "outputs/playwright-report", open: "never" }]],
  retries: process.env.CI ? 1 : 0,
  // The built Worker runtime owns one local process. Serial CI projects avoid
  // concurrent map-tile and Worker requests tearing down that process while a
  // different viewport is still asserting the same canonical run.
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: externalBaseUrl ?? `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "phone-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "laptop-1366", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "full-hd", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `npm run build && npx wrangler dev --config dist/server/wrangler.json --ip 127.0.0.1 --port ${port}`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
