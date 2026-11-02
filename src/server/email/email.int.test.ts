import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../../test/factories";
import { listEmails, retryEmail, sendTestEmail } from "./admin";
import { deliverOne, deliverQueued, MAX_ATTEMPTS } from "./deliver";
import { queueEmail, queueEmailToUser } from "./queue";
import { redact, setMailTransportForTests, type OutgoingEmail } from "./transport";

// specs/email-notifications: queue in the transaction, deliver after commit, retries.

const created: string[] = [];
let sent: OutgoingEmail[] = [];
let failNext = 0;

function useFakeTransport() {
  setMailTransportForTests({
    async send(email) {
      if (failNext > 0) {
        failNext--;
        throw new Error("Connection refused");
      }
      sent.push(email);
    },
  });
}

const approved = {
  kind: "APPROVED" as const,
  actorName: "Dev Tech Lead",
  projectName: "Mail test",
  requestId: "r1",
};

beforeEach(async () => {
  await getDb().emailMessage.deleteMany({});
  sent = [];
  failNext = 0;
  useFakeTransport();
});
afterEach(() => setMailTransportForTests(undefined));
afterAll(async () => {
  await getDb().emailMessage.deleteMany({});
  await deleteUsers(created);
});

async function admin(): Promise<CurrentUser> {
  const user = await createUser({ role: "ADMIN" });
  created.push(user.id);
  return toCurrentUser(user) as CurrentUser;
}

describe("email queue and delivery", () => {
  it("sends only after the transaction commits", async () => {
    const db = getDb();
    const id = await db.$transaction((tx) =>
      queueEmail(tx, { to: "Sara.A@Folio3.com", content: approved }),
    );
    expect(sent).toHaveLength(0);
    await deliverQueued();
    expect(sent.map((e) => e.to)).toEqual(["sara.a@folio3.com"]);
    const row = await db.emailMessage.findUniqueOrThrow({ where: { id: id! } });
    expect(row).toMatchObject({ status: "SENT", attempts: 1, lastError: null });
    expect(row.sentAt).not.toBeNull();
  });

  it("leaves nothing behind when the action rolls back", async () => {
    await expect(
      getDb().$transaction(async (tx) => {
        await queueEmail(tx, { to: "sara.a@folio3.com", content: approved });
        throw new Error("approval failed");
      }),
    ).rejects.toThrow("approval failed");
    await deliverQueued();
    expect(sent).toHaveLength(0);
    expect(await getDb().emailMessage.count()).toBe(0);
  });

  it("records a failure, then succeeds on the next attempt without sending twice", async () => {
    const id = await getDb().$transaction((tx) =>
      queueEmail(tx, { to: "sara.a@folio3.com", content: approved }),
    );
    failNext = 1;
    expect(await deliverQueued()).toEqual({ sent: 0, failed: 1 });
    expect(await getDb().emailMessage.findUniqueOrThrow({ where: { id: id! } })).toMatchObject({
      status: "FAILED",
      attempts: 1,
      lastError: "Connection refused",
    });
    expect(await deliverQueued()).toEqual({ sent: 1, failed: 0 });
    expect(await deliverQueued()).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(await getDb().emailMessage.findUniqueOrThrow({ where: { id: id! } })).toMatchObject({
      status: "SENT",
      attempts: 2,
    });
  });

  it("gives up after three attempts until an Admin retries", async () => {
    const actor = await admin();
    const id = await getDb().$transaction((tx) =>
      queueEmail(tx, { to: "sara.a@folio3.com", content: approved }),
    );
    failNext = MAX_ATTEMPTS;
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await deliverQueued();
    expect(await getDb().emailMessage.findUniqueOrThrow({ where: { id: id! } })).toMatchObject({
      status: "FAILED",
      attempts: MAX_ATTEMPTS,
    });
    expect(sent).toHaveLength(0);
    expect(await retryEmail(actor, id!)).toBe(true);
    expect(sent).toHaveLength(1);
    await expect(retryEmail(actor, id!)).rejects.toMatchObject({ status: 409 });
  });

  it("sends each email once when two deliveries run together", async () => {
    await getDb().$transaction(async (tx) => {
      for (let i = 0; i < 5; i++) {
        await queueEmail(tx, { to: `p${i}@folio3.com`, content: approved });
      }
    });
    await Promise.all([deliverQueued(), deliverQueued(), deliverQueued()]);
    expect(sent.map((e) => e.to).sort()).toEqual([
      "p0@folio3.com",
      "p1@folio3.com",
      "p2@folio3.com",
      "p3@folio3.com",
      "p4@folio3.com",
    ]);
  });

  it("records Not sent when email isn't set up, and sends nothing", async () => {
    setMailTransportForTests(null);
    const id = await getDb().$transaction((tx) =>
      queueEmail(tx, { to: "sara.a@folio3.com", content: approved }),
    );
    expect(await deliverOne(id)).toBe(false);
    expect(await getDb().emailMessage.findUniqueOrThrow({ where: { id: id! } })).toMatchObject({
      status: "NOT_SENT",
      attempts: 0,
    });
  });

  it("never emails outside @folio3.com or a deactivated person", async () => {
    const off = await createUser({ status: "DEACTIVATED" });
    created.push(off.id);
    const ids = await getDb().$transaction(async (tx) => [
      await queueEmail(tx, { to: "someone@gmail.com", content: approved }),
      await queueEmailToUser(tx, off.id, { content: approved }),
    ]);
    expect(ids).toEqual([null, null]);
    expect(await getDb().emailMessage.count()).toBe(0);
  });

  it("keeps credentials out of stored errors", () => {
    expect(
      redact("Invalid login for me@folio3.com with app-pass-s3cret", [
        "app-pass-s3cret",
        "me@folio3.com",
      ]),
    ).toBe("Invalid login for *** with ***");
    expect(redact("x".repeat(900), [undefined])).toHaveLength(500);
  });
});

describe("Email page service", () => {
  it("sends a test to the Admin and lists it", async () => {
    const actor = await admin();
    expect(await sendTestEmail(actor)).toBe(true);
    expect(sent[0]).toMatchObject({
      to: actor.email,
      subject: "Test email from the F3 Estimation Tool",
    });
    const rows = await listEmails(actor);
    expect(rows[0]).toMatchObject({ kind: "TEST", status: "SENT" });
  });

  it("refuses the test when email isn't set up, and refuses non-Admins", async () => {
    const actor = await admin();
    setMailTransportForTests(null);
    await expect(sendTestEmail(actor)).rejects.toMatchObject({ status: 409 });
    const lead = await createUser({ role: "TECH_LEAD" });
    created.push(lead.id);
    const leadActor = toCurrentUser(lead) as CurrentUser;
    await expect(listEmails(leadActor)).rejects.toMatchObject({ status: 403 });
    await expect(sendTestEmail(leadActor)).rejects.toMatchObject({ status: 403 });
  });
});
