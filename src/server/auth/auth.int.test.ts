import { afterAll, describe, expect, it } from "vitest";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db";
import { createAuth, devLoginEnabled } from "./auth";
import {
  authRequest,
  createUser,
  deleteUsers,
  PASSWORD,
  signIn,
  uniqueEmail,
} from "../../../test/factories";

const created: string[] = [];
afterAll(async () => {
  await deleteUsers(created);
  await getDb().roleInvitation.deleteMany({ where: { email: { startsWith: "invited." } } });
});

describe("development sign-in (specs/authentication)", () => {
  it("signs in a dev user and sets an HTTP-only, SameSite=Lax session cookie", async () => {
    const user = await createUser({ role: "ESTIMATOR" });
    created.push(user.id);

    const { response, cookie } = await signIn(user.email);
    expect(response.status).toBe(200);

    const setCookies = response.headers.getSetCookie();
    const session = setCookies.find((c) => c.includes("session_token"));
    expect(session).toBeDefined();
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    // Served over http in tests, so not Secure; https deployments get Secure (useSecureCookies).
    expect(session).not.toMatch(/;\s*Secure/i);

    const me = await authRequest("/get-session", { cookie });
    const body = await me.json();
    expect(body.user.email).toBe(user.email);
    expect(body.user.role).toBe("ESTIMATOR");
  });

  it("refuses a wrong password", async () => {
    const user = await createUser({});
    created.push(user.id);
    const { response } = await signIn(user.email, "wrong-password");
    expect(response.status).toBe(401);
  });

  it("never allows sign-up through the API", async () => {
    const response = await authRequest("/sign-up/email", {
      body: { email: uniqueEmail("signup"), password: "whatever-123456", name: "X" },
    });
    expect(response.status).not.toBe(200);
    const count = await getDb().user.count({ where: { email: { startsWith: "signup." } } });
    expect(count).toBe(0);
  });

  it("refuses sign-in for a deactivated person", async () => {
    const user = await createUser({ status: "DEACTIVATED" });
    created.push(user.id);
    const { response, cookie } = await signIn(user.email);
    expect(response.status).toBe(403);
    // The sign-in page relies on this code to show the "access turned off" message.
    expect(((await response.json()) as { code: string }).code.toUpperCase()).toBe("DEACTIVATED");
    expect(cookie).not.toContain("session_token=");
    expect(await getDb().session.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("roles on sign-in (specs/user-roles)", () => {
  it("makes ADMIN_EMAILS people Admin on first sign-in", async () => {
    const user = await createUser({ email: "boot.admin@folio3.com", role: null });
    created.push(user.id);
    const { response } = await signIn(user.email);
    expect(response.status).toBe(200);
    const after = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.role).toBe("ADMIN");
  });

  it("applies and consumes an invitation", async () => {
    const inviter = await createUser({ role: "ADMIN" });
    created.push(inviter.id);
    const email = `invited.${Date.now()}@folio3.com`;
    await getDb().roleInvitation.create({
      data: { email, role: "TECH_LEAD", invitedById: inviter.id },
    });
    const user = await createUser({ email, role: null });
    created.push(user.id);

    await signIn(email);

    const after = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.role).toBe("TECH_LEAD");
    expect(await getDb().roleInvitation.findUnique({ where: { email } })).toBeNull();
  });

  it("leaves people without an invitation without a role", async () => {
    const user = await createUser({ role: null });
    created.push(user.id);
    await signIn(user.email);
    const after = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.role).toBeNull();
  });

  it("does not change an existing role", async () => {
    const user = await createUser({ email: undefined, role: "ARCHITECT" });
    created.push(user.id);
    await signIn(user.email);
    const after = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.role).toBe("ARCHITECT");
  });
});

describe("development sign-in switched off (specs/authentication)", () => {
  it("is only on with AUTH_DEV_LOGIN=1 outside production", () => {
    expect(devLoginEnabled({ AUTH_DEV_LOGIN: "1", NODE_ENV: "development" })).toBe(true);
    expect(devLoginEnabled({ AUTH_DEV_LOGIN: "1", NODE_ENV: "test" })).toBe(true);
    expect(devLoginEnabled({ AUTH_DEV_LOGIN: "0", NODE_ENV: "development" })).toBe(false);
    expect(devLoginEnabled({ AUTH_DEV_LOGIN: "1", NODE_ENV: "production" })).toBe(false);
  });

  it("refuses email-and-password sign-in when AUTH_DEV_LOGIN=0", async () => {
    const user = await createUser({ role: "ADMIN" });
    created.push(user.id);
    const auth = createAuth({ ...getEnv(), AUTH_DEV_LOGIN: "0" });
    const base = process.env.AUTH_URL!;
    const response = await auth.handler(
      new Request(`${base}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ email: user.email, password: PASSWORD }),
      }),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.getSetCookie().join()).not.toContain("session_token=");
  });
});
