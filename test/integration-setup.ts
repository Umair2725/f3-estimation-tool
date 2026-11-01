// Integration tests use the local or CI database and the development sign-in.
// Loads .env when present (local), then pins the settings these tests rely on.
try {
  process.loadEnvFile();
} catch {
  // CI sets variables directly
}

Object.assign(process.env, {
  NODE_ENV: "test",
  AUTH_DEV_LOGIN: "1",
  AUTH_URL: process.env.AUTH_URL || "http://localhost:3000",
  AUTH_SECRET: process.env.AUTH_SECRET || "integration-test-secret-0123456789abcdef",
  DEV_USER_PASSWORD: process.env.DEV_USER_PASSWORD || "dev-password-not-for-production",
  ADMIN_EMAILS: "boot.admin@folio3.com",
  // No model download and no AI calls in tests (specs/feature-matching).
  EMBEDDINGS_PROVIDER: "stub",
  ANTHROPIC_API_KEY: "",
});

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Integration tests need DATABASE_URL (start the db with `docker compose up -d db`).",
  );
}
