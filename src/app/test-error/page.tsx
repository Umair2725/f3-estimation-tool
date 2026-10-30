import { connection } from "next/server";

// Test-only page used by the end-to-end tests to check the error page (app-shell spec).
// src/proxy.ts turns it into a normal 404 unless ENABLE_TEST_ROUTES=1.

// Rendered at request time only, never prerendered at build.
export const instant = false;

export default async function TestErrorPage() {
  await connection();
  throw new Error("Intentional test error: internal details that must not be shown");
}
