import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT } from "./e2e/helpers";

// End-to-end tests for the app-shell, system-health, authentication and user-roles specs.
// They run against the production build (`npm run build` first) on port 3100. NODE_ENV=test
// keeps the development sign-in available (it is refused when NODE_ENV=production).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      AUTH_URL: BASE_URL,
      AUTH_DEV_LOGIN: "1",
      ENABLE_TEST_ROUTES: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
