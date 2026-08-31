import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.TEACHBACK_E2E_URL ?? "http://127.0.0.1:4340";
const serverPort = Number(new URL(baseURL).port || 80);

export default defineConfig({
  testDir: "./tests/e2e",
  // The old fixture-driven UI specs remain in the worktree for reference.
  // Current end-to-end coverage exercises the recorded-workflow entrypoint.
  testMatch: "**/core-*.spec.ts",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `./node_modules/.bin/vinext start --port ${serverPort} --hostname 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: process.env.TEACHBACK_E2E_REUSE === "1",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
