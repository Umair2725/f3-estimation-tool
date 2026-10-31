// Helpers for integration tests: create throwaway users directly in the database and sign in
// through the real Better Auth handler with the development (email-and-password) sign-in.
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Role } from "@/server/auth/permissions";
import { getAuth } from "@/server/auth/auth";
import { getDb } from "@/server/db";

export const PASSWORD = "integration-password-123";

export function uniqueEmail(prefix = "it"): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@folio3.com`;
}

export async function createUser(options: {
  email?: string;
  role?: Role | null;
  status?: "ACTIVE" | "DEACTIVATED";
}) {
  const db = getDb();
  const user = await db.user.create({
    data: {
      id: randomUUID(),
      email: options.email ?? uniqueEmail(),
      name: "Integration Test",
      emailVerified: true,
      role: options.role === undefined ? "ESTIMATOR" : options.role,
      status: options.status ?? "ACTIVE",
    },
  });
  await db.account.create({
    data: {
      id: randomUUID(),
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPassword(PASSWORD),
    },
  });
  return user;
}

const base = () => process.env.AUTH_URL ?? "http://localhost:3000";

export function authRequest(path: string, init: { body?: unknown; cookie?: string } = {}) {
  return getAuth().handler(
    new Request(`${base()}/api/auth${path}`, {
      method: init.body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        origin: base(),
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  );
}

/** Signs in with the development sign-in; returns the response and the `cookie` header to reuse. */
export async function signIn(email: string, password = PASSWORD) {
  const response = await authRequest("/sign-in/email", { body: { email, password } });
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { response, cookie };
}

export async function deleteUsers(ids: string[]) {
  if (ids.length) await getDb().user.deleteMany({ where: { id: { in: ids } } });
}
