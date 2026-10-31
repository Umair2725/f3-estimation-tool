import { execSync } from "node:child_process";
import type { APIRequestContext } from "@playwright/test";

// Shared by the e2e setup and specs. The server runs the production build with NODE_ENV=test
// and the development sign-in (see playwright.config.ts).
export const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;
export const PASSWORD = process.env.DEV_USER_PASSWORD || "dev-password-not-for-production";

export const USERS = {
  estimator: "dev.estimator@folio3.com",
  techlead: "dev.techlead@folio3.com",
  architect: "dev.architect@folio3.com",
  admin: "dev.admin@folio3.com",
  newcomer: "dev.newcomer@folio3.com",
} as const;
export type TestRole = keyof typeof USERS;

export const authFile = (role: TestRole) => `playwright/.auth/${role}.json`;

/** Brings the dev users back to their seeded roles and status. */
export function seed() {
  execSync("npm run db:seed", {
    stdio: "pipe",
    env: { ...process.env, NODE_ENV: "test", AUTH_DEV_LOGIN: "1" },
  });
}

/** Signs in through the development sign-in API; the session cookie stays on `request`. */
export async function apiSignIn(request: APIRequestContext, email: string) {
  return request.post("/api/auth/sign-in/email", {
    data: { email, password: PASSWORD },
    headers: { Origin: BASE_URL },
  });
}
