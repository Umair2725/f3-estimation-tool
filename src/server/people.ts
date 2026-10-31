import "server-only";
import { checkAccess, type CurrentUser } from "@/server/auth/access";
import { isRole, type Role } from "@/server/auth/permissions";
import { isFolio3Email, normalizeEmail } from "@/server/auth/policy";
import { getDb } from "@/server/db";

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

/** Assigns or changes a role; takes effect on the person's next request. */
export async function setRole(actor: CurrentUser | null, userId: string, role: unknown) {
  assertCanManage(actor);
  assertRole(role);
  return getDb().$transaction(async (tx) => {
    const target = await guardLastAdminIfDemoting(tx, userId, role);
    if (target.role === role) return target;
    return tx.user.update({ where: { id: userId }, data: { role } });
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
 * Pre-assigns a role to a @folio3.com address. If that person has already signed in, their
 * role is changed directly instead.
 */
export async function invite(
  actor: CurrentUser | null,
  rawEmail: string,
  role: unknown,
): Promise<"invited" | "updated"> {
  assertCanManage(actor);
  assertRole(role);
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || !isFolio3Email(email)) {
    throw new PeopleError(INVITE_DOMAIN_MESSAGE, 400);
  }
  const existing = await getDb().user.findUnique({ where: { email } });
  if (existing) {
    await setRole(actor, existing.id, role);
    return "updated";
  }
  await getDb().roleInvitation.upsert({
    where: { email },
    create: { email, role, invitedById: actor.id },
    update: { role, invitedById: actor.id },
  });
  return "invited";
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
