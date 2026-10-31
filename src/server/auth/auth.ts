import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import type { Env } from "@/lib/env-schema";
import { parseAdminEmails } from "@/lib/env-schema";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getDb } from "@/server/db";
import { isRole } from "./permissions";
import { decideRole, isAllowedIdentity, isFolio3Email, normalizeEmail } from "./policy";

/** Error codes shown on the sign-in page (`/sign-in?error=…`). */
export const SIGN_IN_ERRORS = { domain: "domain", deactivated: "deactivated" } as const;

const TWELVE_HOURS = 12 * 60 * 60;
const FIFTEEN_MINUTES = 15 * 60;

/** Development sign-in exists only when explicitly enabled and never in production. */
export function devLoginEnabled(env: Pick<Env, "AUTH_DEV_LOGIN" | "NODE_ENV">): boolean {
  return env.AUTH_DEV_LOGIN === "1" && env.NODE_ENV !== "production";
}

/**
 * Runs on every new session: blocks deactivated people, then gives a role to people who don't
 * have one yet (ADMIN_EMAILS, otherwise a pending invitation). See specs/user-roles.
 */
async function prepareUserForSession(userId: string, env: Env): Promise<void> {
  const db = getDb();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status === "DEACTIVATED") {
    throw new APIError("FORBIDDEN", { code: SIGN_IN_ERRORS.deactivated, message: "deactivated" });
  }
  if (user.role) return;

  const email = normalizeEmail(user.email);
  const invitation = await db.roleInvitation.findUnique({ where: { email } });
  const decision = decideRole({
    email,
    currentRole: null,
    adminEmails: parseAdminEmails(env.ADMIN_EMAILS),
    invitationRole: invitation && isRole(invitation.role) ? invitation.role : null,
  });
  if (!decision.role && !decision.consumeInvitation) return;

  await db.$transaction([
    ...(decision.role
      ? [db.user.update({ where: { id: user.id }, data: { role: decision.role } })]
      : []),
    ...(decision.consumeInvitation ? [db.roleInvitation.delete({ where: { email } })] : []),
  ]);
  logger.info("role assigned on sign-in", { userId: user.id, role: decision.role });
}

/** Exported for tests; the app uses getAuth(). */
export function createAuth(env: Env = getEnv()) {
  const dev = devLoginEnabled(env);
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            // Shown to Google as a hint and enforced against the token's hosted-domain claim.
            hd: "folio3.com",
            prompt: "select_account" as const,
          },
        }
      : {};

  return betterAuth({
    appName: "F3 Estimation Tool",
    secret: env.AUTH_SECRET,
    baseURL: env.AUTH_URL,
    database: prismaAdapter(getDb(), { provider: "postgresql" }),
    socialProviders: google,
    // Development and test only (seeded users); sign-up through the API is never allowed.
    emailAndPassword: { enabled: dev, disableSignUp: true },
    session: {
      expiresIn: TWELVE_HOURS,
      updateAge: FIFTEEN_MINUTES,
      // Off on purpose: every request reads the session, so deactivation is immediate.
      cookieCache: { enabled: false },
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, input: false },
        status: { type: "string", required: false, input: false, defaultValue: "ACTIVE" },
        lastActiveAt: { type: "date", required: false, input: false },
      },
      // Domain rule (specs/authentication): checked before an account is created and on every
      // Google sign-in. Development users are seeded, so their email is never "verified".
      validateUserInfo: ({ user, source }) => {
        const allowed =
          source.method === "email-password"
            ? dev && typeof user.email === "string" && isFolio3Email(user.email)
            : isAllowedIdentity(user);
        if (allowed) return;
        return {
          error: SIGN_IN_ERRORS.domain,
          errorDescription: "Only @folio3.com accounts can sign in",
        };
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            await prepareUserForSession(session.userId, env);
          },
        },
      },
    },
    onAPIError: { errorURL: "/sign-in" },
    advanced: {
      useSecureCookies: env.AUTH_URL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { f3Auth?: Auth };

/** The Better Auth instance, created on first use (so `next build` works without settings). */
export function getAuth(): Auth {
  if (!globalForAuth.f3Auth) globalForAuth.f3Auth = createAuth();
  return globalForAuth.f3Auth;
}
