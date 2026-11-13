// Integration tests use the tests' own database (test/test-database.ts) and the development
// sign-in. Loads .env when present (local), then pins the settings these tests rely on.
import { testDatabaseUrl } from "./test-database";

try {
  process.loadEnvFile();
} catch {
  // CI sets variables directly
}

Object.assign(process.env, {
  // Never the database in DATABASE_URL: it holds real work.
  DATABASE_URL: testDatabaseUrl(process.env),
  NODE_ENV: "test",
  AUTH_DEV_LOGIN: "1",
  AUTH_URL: process.env.AUTH_URL || "http://localhost:3000",
  AUTH_SECRET: process.env.AUTH_SECRET || "integration-test-secret-0123456789abcdef",
  DEV_USER_PASSWORD: process.env.DEV_USER_PASSWORD || "dev-password-not-for-production",
  ADMIN_EMAILS: "boot.admin@folio3.com",
  // No model download and no AI calls in tests (specs/feature-matching).
  EMBEDDINGS_PROVIDER: "stub",
  ANTHROPIC_API_KEY: "",
  // Never real email from tests: they swap in a fake transport (specs/email-notifications).
  SMTP_HOST: "",
  // Tests swap in a fake document reader; by default none is set up (no Claude calls).
  DOCUMENT_READER: "claude",
});
