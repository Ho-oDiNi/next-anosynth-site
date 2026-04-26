import { defineConfig, devices } from "@playwright/test";

const MINUTES = 12 * 60 * 60 * 1000;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",

  timeout: MINUTES,

  expect: {
    timeout: 60_000,
  },

  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    navigationTimeout: 120_000,
    actionTimeout: 60_000,
  },

  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
