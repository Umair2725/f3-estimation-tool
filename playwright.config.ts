import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT } from "./e2e/helpers";
import { testDatabaseUrl } from "./test/test-database";

// E2E runs use the tests' own database, never the one in DATABASE_URL (it holds real work).
// Workers and the seed helper inherit this; global setup creates, migrates and seeds it.
try {
  process.loadEnvFile();
} catch {
  // CI sets variables directly
}
process.env.DATABASE_URL = testDatabaseUrl(process.env);

// End-to-end tests for the app-shell, system-health, authentication and user-roles specs.
// They run against the production build (`npm run build` first) on port 3100. NODE_ENV=test
// keeps the development sign-in available (it is refused when NODE_ENV=production).
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./test/prepare-test-database.ts",
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
      testIgnore: /estimation-requests\.spec\.ts/,
    },
    {
      // Checks Home's "Continue where you left off" (the Estimator's latest draft), so it runs
      // after the specs that also create Estimator drafts, never alongside them.
      name: "chromium-drafts",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["chromium"],
      testMatch: /estimation-requests\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      NODE_ENV: "test",
      AUTH_URL: BASE_URL,
      AUTH_DEV_LOGIN: "1",
      ENABLE_TEST_ROUTES: "1",
      EMBEDDINGS_PROVIDER: "stub",
      // Never real email or AI calls from e2e runs, even with these set in .env.
      SMTP_HOST: "",
      ANTHROPIC_API_KEY: "",
      // A test-only reader for requirement documents (specs/requirement-documents).
      DOCUMENT_READER: "stub",
      // A test-only AI guess, so its rounds and risks can be checked (specs/feature-matching).
      AI_GUESS: "stub",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
