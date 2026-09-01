import { defineConfig, devices } from "@playwright/test";

const publicRun = process.env.TEACHBACK_E2E_PUBLIC === "1";
const configuredURL = process.env.TEACHBACK_E2E_URL;

if (publicRun && !configuredURL) {
  throw new Error(
    "Set TEACHBACK_E2E_URL when running the public-site E2E suite.",
  );
}

const baseURL = configuredURL ?? "http://127.0.0.1:4340";
const parsedURL = new URL(baseURL);
const isLocalURL = ["127.0.0.1", "localhost", "::1"].includes(
  parsedURL.hostname,
);

if (!publicRun && !isLocalURL) {
  throw new Error(
    "Use `bun run test:e2e:public` when TEACHBACK_E2E_URL points to a public site.",
  );
}

const serverPort = Number(
  parsedURL.port || (parsedURL.protocol === "https:" ? 443 : 80),
);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/core-*.spec.ts",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: publicRun
    ? undefined
    : {
        command: `./node_modules/.bin/vinext start --port ${serverPort} --hostname 127.0.0.1`,
        url: baseURL,
        reuseExistingServer: process.env.TEACHBACK_E2E_REUSE === "1",
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
