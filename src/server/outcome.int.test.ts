import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import type { Role } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../test/factories";
import { createRequest } from "./estimation-requests";
import { NO_HOURS_MESSAGE, outcomeChoices, REOPEN_MESSAGE, setOutcome } from "./outcome";

const users: string[] = [];
const tag = randomUUID().slice(0, 8);
afterAll(async () => {
  await getDb().estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await deleteUsers(users);
});

async function person(role: Role | null = "ESTIMATOR") {
  const user = await createUser({ role });
  users.push(user.id);
  return toCurrentUser(user) as CurrentUser;
}

/** A request owned by `owner`, optionally with one Sub task of 10–14 hours. */
async function request(owner: CurrentUser, withHours = true) {
  const { id } = await createRequest(owner, {
    projectName: `Outcome ${tag}`,
    projectDate: "2026-11-01",
  });
  if (withHours) {
    const db = getDb();
    const part = await db.requestPart.create({ data: { requestId: id, part: "BACKEND" } });
    const feature = await db.feature.create({
      data: { requestId: id, name: "Booking", parts: ["BACKEND"], position: 0 },
    });
    await db.estimateTask.create({
      data: {
        featureId: feature.id,
        requestPartId: part.id,
        subTasks: { create: { title: "API", minTenths: 100, maxTenths: 140, position: 0 } },
      },
    });
  }
  return id;
}

const outcomeOf = async (id: string) =>
  (await getDb().estimationRequest.findUniqueOrThrow({ where: { id } })).outcome;

describe("project outcome (specs/project-outcome)", () => {
  it("starts as none and lets the owner mark it won, then delivered", async () => {
    const owner = await person();
    const id = await request(owner);
    expect(await outcomeOf(id)).toBe("NONE");
    await setOutcome(owner, id, { outcome: "IN_DELIVERY" });
    expect(await outcomeOf(id)).toBe("IN_DELIVERY");
    await setOutcome(owner, id, { outcome: "DELIVERED" });
    expect(await outcomeOf(id)).toBe("DELIVERED");
  });

  it("needs hours first", async () => {
    const owner = await person();
    const id = await request(owner, false);
    await expect(setOutcome(owner, id, { outcome: "IN_DELIVERY" })).rejects.toThrow(
      NO_HOURS_MESSAGE,
    );
  });

  it("keeps a Lost reason and refuses invalid transitions", async () => {
    const owner = await person();
    const id = await request(owner);
    await setOutcome(owner, id, { outcome: "LOST", reason: " Budget cut " });
    const row = await getDb().estimationRequest.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      outcome: "LOST",
      outcomeReason: "Budget cut",
      outcomeChangedById: owner.id,
    });
    await expect(setOutcome(owner, id, { outcome: "DELIVERED" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("allows Tech Leads, Architects and Admins but not other Estimators", async () => {
    const owner = await person();
    const id = await request(owner);
    await expect(setOutcome(await person(), id, { outcome: "IN_DELIVERY" })).rejects.toMatchObject({
      status: 403,
    });
    expect(await outcomeOf(id)).toBe("NONE");
    await setOutcome(await person("TECH_LEAD"), id, { outcome: "IN_DELIVERY" });
    await setOutcome(await person("ARCHITECT"), id, { outcome: "LOST" });
    await setOutcome(await person("ADMIN"), id, { outcome: "IN_DELIVERY" });
    await expect(setOutcome(await person(null), id, { outcome: "NONE" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("lets only an Admin reopen a delivered project", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const admin = await person("ADMIN");
    const id = await request(owner);
    await setOutcome(lead, id, { outcome: "IN_DELIVERY" });
    await setOutcome(lead, id, { outcome: "DELIVERED" });
    await expect(setOutcome(lead, id, { outcome: "IN_DELIVERY" })).rejects.toThrow(REOPEN_MESSAGE);
    expect(outcomeChoices(lead, { ownerId: owner.id, outcome: "DELIVERED" })).toEqual([]);
    expect(outcomeChoices(admin, { ownerId: owner.id, outcome: "DELIVERED" })).toEqual([
      "IN_DELIVERY",
    ]);
    await setOutcome(admin, id, { outcome: "IN_DELIVERY" });
    expect(await outcomeOf(id)).toBe("IN_DELIVERY");
  });
});
