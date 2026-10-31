// Pure sign-in policy rules (specs/authentication, specs/user-roles). No database or framework
// imports, so every branch is unit-tested.
import type { Role } from "./permissions";

export const ALLOWED_DOMAIN = "folio3.com";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isFolio3Email(email: string): boolean {
  return /^[^@\s]+@folio3\.com$/.test(normalizeEmail(email));
}

/** Only verified @folio3.com identities may sign in or be created. */
export function isAllowedIdentity(user: { email?: string | null; emailVerified?: boolean | null }) {
  return Boolean(user.email) && user.emailVerified === true && isFolio3Email(user.email!);
}

export type RoleDecision = { role: Role | null; consumeInvitation: boolean };

/**
 * The role a person gets when signing in. An existing role is never changed here, so removing
 * someone from ADMIN_EMAILS never demotes them. Otherwise: ADMIN_EMAILS first, then an
 * invitation, else no role (waiting for access).
 */
export function decideRole(input: {
  email: string;
  currentRole: Role | null;
  adminEmails: readonly string[];
  invitationRole: Role | null;
}): RoleDecision {
  if (input.currentRole) return { role: input.currentRole, consumeInvitation: false };
  const email = normalizeEmail(input.email);
  if (input.adminEmails.map(normalizeEmail).includes(email)) {
    return { role: "ADMIN", consumeInvitation: input.invitationRole !== null };
  }
  if (input.invitationRole) return { role: input.invitationRole, consumeInvitation: true };
  return { role: null, consumeInvitation: false };
}

/**
 * Where to send someone after sign-in. Only same-site relative paths are allowed, so the
 * `next` parameter can't be used to redirect to another site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  if (/[\u0000-\u001f]/.test(next)) return "/";
  try {
    const url = new URL(next, "http://same-site.invalid");
    if (url.origin !== "http://same-site.invalid") return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
