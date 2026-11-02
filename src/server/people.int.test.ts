import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { authRequest, createUser, deleteUsers, signIn } from "../../test/factories";
import {
  deactivate,
  invite,
  INVITE_DOMAIN_MESSAGE,
  LAST_ADMIN_MESSAGE,
  NO_PENDING_INVITATION,
  listPeople,
  reactivate,
  resendInvitation,
  setRole,
} from "./people";

const created: string[] = [];
afterAll(async () => {
  await getDb().roleInvitation.deleteMany({ where: { email: { startsWith: "pinvite." } } });
  await deleteUsers(created);
});

async function person(options: Parameters<typeof createUser>[0]) {
  const user = await createUser(options);
  created.push(user.id);
  return { user, actor: toCurrentUser(user) as CurrentUser };
}

describe("people service (specs/user-roles)", () => {
  it("refuses non-Admins with 403 and changes nothing", async () => {
    const { actor } = await person({ role: "ESTIMATOR" });
    const { user: target } = await person({ role: null });
    for (const role of ["TECH_LEAD", "ARCHITECT"] as const) {
      const { actor: other } = await person({ role });
      await expect(setRole(other, target.id, "ADMIN")).rejects.toMatchObject({ status: 403 });
    }
    await expect(listPeople(actor)).rejects.toMatchObject({ status: 403 });
    await expect(setRole(actor, target.id, "ADMIN")).rejects.toMatchObject({ status: 403 });
    await expect(deactivate(actor, target.id)).rejects.toMatchObject({ status: 403 });
    await expect(invite(actor, "pinvite.x@folio3.com", "ADMIN")).rejects.toMatchObject({
      status: 403,
    });
    await expect(setRole(null, target.id, "ADMIN")).rejects.toMatchObject({ status: 401 });
    const after = await getDb().user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.role).toBeNull();
  });

  it("lets an Admin list people and assign a role", async () => {
    const { actor } = await person({ role: "ADMIN" });
    const { user: waiting } = await person({ role: null });
    await setRole(actor, waiting.id, "ESTIMATOR");
    const { people } = await listPeople(actor);
    expect(people.find((p) => p.id === waiting.id)?.role).toBe("ESTIMATOR");
  });

  it("rejects an unknown role", async () => {
    const { actor } = await person({ role: "ADMIN" });
    const { user } = await person({ role: null });
    await expect(setRole(actor, user.id, "OWNER")).rejects.toMatchObject({ status: 400 });
  });

  it("invites only @folio3.com addresses", async () => {
    const { actor } = await person({ role: "ADMIN" });
    await expect(invite(actor, "someone@gmail.com", "ESTIMATOR")).rejects.toThrow(
      INVITE_DOMAIN_MESSAGE,
    );
    await expect(invite(actor, "x@folio3.com.evil.com", "ESTIMATOR")).rejects.toThrow(
      INVITE_DOMAIN_MESSAGE,
    );
  });

  it("gives an invited person the role on first sign-in", async () => {
    const { actor } = await person({ role: "ADMIN" });
    const email = `pinvite.${Date.now()}@folio3.com`;
    expect((await invite(actor, ` ${email.toUpperCase()} `, "TECH_LEAD")).outcome).toBe("invited");
    const { user } = await person({ email, role: null });
    expect((await signIn(email)).response.status).toBe(200);
    const after = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.role).toBe("TECH_LEAD");
  });

  it("changes the role directly when the invited person already exists", async () => {
    const { actor } = await person({ role: "ADMIN" });
    const { user } = await person({ role: null });
    expect(await invite(actor, user.email, "ARCHITECT")).toEqual({
      outcome: "updated",
      emailId: null,
    });
    expect((await getDb().user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe(
      "ARCHITECT",
    );
  });

  it("emails invitations, resends, and tells a waiting person they have access", async () => {
    const { actor } = await person({ role: "ADMIN" });
    const email = `pinvite.mail.${Date.now()}@folio3.com`;
    const { emailId } = await invite(actor, email, "TECH_LEAD");
    const invitation = await getDb().emailMessage.findUniqueOrThrow({ where: { id: emailId! } });
    expect(invitation).toMatchObject({
      kind: "INVITATION",
      to: email,
      subject: `${actor.name} invited you to the F3 Estimation Tool as Tech Lead`,
    });
    expect(invitation.text).toContain("/sign-in");

    const again = await resendInvitation(actor, email.toUpperCase());
    expect(again).not.toBe(emailId);
    expect(await getDb().emailMessage.count({ where: { to: email, kind: "INVITATION" } })).toBe(2);
    await expect(resendInvitation(actor, "pinvite.none@folio3.com")).rejects.toThrow(
      NO_PENDING_INVITATION,
    );
    const { actor: lead } = await person({ role: "TECH_LEAD" });
    await expect(resendInvitation(lead, email)).rejects.toMatchObject({ status: 403 });

    // First role: access granted, also when it comes through an invitation. A change: nothing.
    const { user: waiting } = await person({ role: null });
    const { user: waiting2 } = await person({ role: null });
    await setRole(actor, waiting.id, "ESTIMATOR");
    await invite(actor, waiting2.email, "ARCHITECT");
    await setRole(actor, waiting.id, "TECH_LEAD");
    const access = await getDb().emailMessage.findMany({
      where: { userId: { in: [waiting.id, waiting2.id] } },
      orderBy: { createdAt: "asc" },
    });
    expect(access.map((e) => [e.kind, e.to, e.subject])).toEqual([
      [
        "ACCESS_GRANTED",
        waiting.email,
        "You now have access to the F3 Estimation Tool as Estimator",
      ],
      [
        "ACCESS_GRANTED",
        waiting2.email,
        "You now have access to the F3 Estimation Tool as Architect",
      ],
    ]);
    await getDb().emailMessage.deleteMany({ where: { to: { startsWith: "pinvite." } } });
  });

  it("deactivation ends sessions and blocks sign-in; reactivation restores the role", async () => {
    const { actor } = await person({ role: "ADMIN" });
    const { user } = await person({ role: "ARCHITECT" });
    const { cookie } = await signIn(user.email);
    expect(await getDb().session.count({ where: { userId: user.id } })).toBe(1);

    await deactivate(actor, user.id);
    expect(await getDb().session.count({ where: { userId: user.id } })).toBe(0);
    const me = await authRequest("/get-session", { cookie });
    expect(await me.json()).toBeNull();
    expect((await signIn(user.email)).response.status).toBe(403);

    await reactivate(actor, user.id);
    expect((await signIn(user.email)).response.status).toBe(200);
    expect((await getDb().user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe(
      "ARCHITECT",
    );
  });

  describe("last active Admin", () => {
    // Other tests and the dev seed also have Admins; set them aside so ours is the only one.
    let parked: string[] = [];
    beforeEach(async () => {
      const admins = await getDb().user.findMany({ where: { role: "ADMIN", status: "ACTIVE" } });
      parked = admins.map((a) => a.id);
      await getDb().user.updateMany({
        where: { id: { in: parked } },
        data: { status: "DEACTIVATED" },
      });
    });
    afterEach(async () => {
      await getDb().user.updateMany({ where: { id: { in: parked } }, data: { status: "ACTIVE" } });
    });

    it("cannot be demoted or deactivated, even by themselves", async () => {
      const { user, actor } = await person({ role: "ADMIN" });
      await expect(setRole(actor, user.id, "ESTIMATOR")).rejects.toThrow(LAST_ADMIN_MESSAGE);
      await expect(deactivate(actor, user.id)).rejects.toThrow(LAST_ADMIN_MESSAGE);
      const after = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after).toMatchObject({ role: "ADMIN", status: "ACTIVE" });
    });

    it("refuses concurrent demotions that would leave no Admin", async () => {
      const a = await person({ role: "ADMIN" });
      const b = await person({ role: "ADMIN" });
      const results = await Promise.allSettled([
        setRole(a.actor, b.user.id, "ESTIMATOR"),
        setRole(b.actor, a.user.id, "ESTIMATOR"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await getDb().user.count({ where: { role: "ADMIN", status: "ACTIVE" } })).toBe(1);
    });
  });
});
