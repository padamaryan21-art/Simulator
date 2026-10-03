import { config } from "dotenv";
import { defineConfig } from "@playwright/test";

config({ path: ".env.local" });
config();

const PORT = 3100;

/**
 * Browser tests. They run against their own dev server on port 3100 (your normal dashboard on
 * 3000 is untouched), sign in as a throwaway Supabase user created and deleted by global
 * setup/teardown, never send to Telegram, and clean up every record they create (ZZ-E2E-).
 *
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Microsoft Edge is already installed on Windows; Playwright's own Chromium download is blocked here.
    channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge",
    storageState: "tests/e2e/.auth/state.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    // The tests must never contact Telegram, whatever the real .env.local says.
    env: { SIMULATION_DRY_RUN: "true", NEXT_DIST_DIR: ".next-e2e" },
  },
});
