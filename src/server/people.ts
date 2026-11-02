import "server-only";
import { checkAccess, type CurrentUser } from "@/server/auth/access";
import { isRole, ROLE_LABELS, type Role } from "@/server/auth/permissions";
import { isFolio3Email, normalizeEmail } from "@/server/auth/policy";
import { getDb } from "@/server/db";
import { queueEmail, queueEmailToUser } from "@/server/email/queue";

// People and roles management (specs/user-roles). Every function takes the acting person and
// checks `people.manage` itself, so API routes and server actions can't forget the check.

export class PeopleError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409,
  ) {
    super(message);
    this.name = "PeopleError";
  }
}

export const LAST_ADMIN_MESSAGE = "There must be at least one active Admin";
export const INVITE_DOMAIN_MESSAGE = "Only @folio3.com addresses can be invited";
export const NO_PENDING_INVITATION = "There's no pending invitation for this address";

export type PersonRow = {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  status: "ACTIVE" | "DEACTIVATED";
  lastActiveAt: Date | null;
};

export type InvitationRow = { email: string; role: Role; createdAt: Date };

function assertCanManage(actor: CurrentUser | null): asserts actor is CurrentUser {
  const access = checkAccess(actor, "people.manage");
  if (!access.ok) throw new PeopleError(access.message, access.status);
}

function assertRole(role: unknown): asserts role is Role {
  if (!isRole(role)) throw new PeopleError("Choose a valid role", 400);
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["$transaction"]>[0]>[0];

/**
 * Serializes every change that could remove an active Admin, then refuses it when `userId`
 * is the only one left. Must run inside the transaction that makes the change.
 */
async function guardLastAdmin(tx: Tx, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('people.active-admins'))`;
  const target = await tx.user.findUnique({ where: { id: userId } });
  if (!target) throw new PeopleError("Person not found", 404);
  if (target.role === "ADMIN" && target.status === "ACTIVE") {
    const admins = await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
    if (admins <= 1) throw new PeopleError(LAST_ADMIN_MESSAGE, 409);
  }
  return target;
}

export async function listPeople(
  actor: CurrentUser | null,
): Promise<{ people: PersonRow[]; invitations: InvitationRow[] }> {
  assertCanManage(actor);
  const db = getDb();
  const [people, invitations] = await Promise.all([
    db.user.findMany({
      select: { id: true, name: true, email: true, role: true, status: true, lastActiveAt: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    db.roleInvitation.findMany({
      select: { email: true, role: true, createdAt: true },
      orderBy: { email: "asc" },
    }),
  ]);
  return { people, invitations };
}

/**
 * Assigns or changes a role; takes effect on the person's next request. A first role also
 * queues the "access granted" email (specs/email-notifications); a change of role sends none.
 */
export async function setRole(actor: CurrentUser | null, userId: string, role: unknown) {
  assertCanManage(actor);
  assertRole(role);
  return getDb().$transaction(async (tx) => {
    const target = await guardLastAdminIfDemoting(tx, userId, role);
    if (target.role === role) return target;
    const updated = await tx.user.update({ where: { id: userId }, data: { role } });
    if (target.role === null) {
      await queueEmailToUser(tx, userId, {
        content: { kind: "ACCESS_GRANTED", roleLabel: ROLE_LABELS[role] },
      });
    }
    return updated;
  });
}

async function guardLastAdminIfDemoting(tx: Tx, userId: string, role: Role) {
  if (role === "ADMIN") {
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target) throw new PeopleError("Person not found", 404);
    return target;
  }
  return guardLastAdmin(tx, userId);
}

/**
 * Pre-assigns a role to a @folio3.com address and queues the invitation email. If that person
 * has already signed in, their role is changed directly instead. The caller delivers
 * `emailId` and tells the Admin whether it went out.
 */
export async function invite(
  actor: CurrentUser | null,
  rawEmail: string,
  role: unknown,
): Promise<{ outcome: "invited" | "updated"; emailId: string | null }> {
  assertCanManage(actor);
  assertRole(role);
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || !isFolio3Email(email)) {
    throw new PeopleError(INVITE_DOMAIN_MESSAGE, 400);
  }
  const existing = await getDb().user.findUnique({ where: { email } });
  if (existing) {
    await setRole(actor, existing.id, role);
    return { outcome: "updated", emailId: null };
  }
  const emailId = await getDb().$transaction(async (tx) => {
    await tx.roleInvitation.upsert({
      where: { email },
      create: { email, role, invitedById: actor.id },
      update: { role, invitedById: actor.id },
    });
    return queueInvitation(tx, actor, email, role);
  });
  return { outcome: "invited", emailId };
}

function queueInvitation(tx: Tx, actor: CurrentUser, email: string, role: Role) {
  return queueEmail(tx, {
    to: email,
    content: { kind: "INVITATION", inviterName: actor.name, roleLabel: ROLE_LABELS[role] },
  });
}

/** Queues a new invitation email for a pending invitation; returns its id. */
export async function resendInvitation(
  actor: CurrentUser | null,
  rawEmail: string,
): Promise<string | null> {
  assertCanManage(actor);
  const email = normalizeEmail(rawEmail);
  return getDb().$transaction(async (tx) => {
    const invitation = await tx.roleInvitation.findUnique({ where: { email } });
    if (!invitation) throw new PeopleError(NO_PENDING_INVITATION, 404);
    return queueInvitation(tx, actor, email, invitation.role);
  });
}

export async function revokeInvitation(actor: CurrentUser | null, rawEmail: string) {
  assertCanManage(actor);
  await getDb().roleInvitation.deleteMany({ where: { email: normalizeEmail(rawEmail) } });
}

/** Turns off access and ends every session at once. Past records are kept. */
export async function deactivate(actor: CurrentUser | null, userId: string) {
  assertCanManage(actor);
  return getDb().$transaction(async (tx) => {
    await guardLastAdmin(tx, userId);
    await tx.session.deleteMany({ where: { userId } });
    return tx.user.update({ where: { id: userId }, data: { status: "DEACTIVATED" } });
  });
}

/** Restores access with the person's previous role. */
export async function reactivate(actor: CurrentUser | null, userId: string) {
  assertCanManage(actor);
  const db = getDb();
  if (!(await db.user.findUnique({ where: { id: userId } }))) {
    throw new PeopleError("Person not found", 404);
  }
  return db.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
}
