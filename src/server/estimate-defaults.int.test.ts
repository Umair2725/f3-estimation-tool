import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import type { Role } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../test/factories";
import {
  DEFAULT_RATE_MESSAGE,
  MINUTES_PER_ROUND_MESSAGE,
  getDefaults,
  readDefaults,
  updateDefaults,
  type EstimateDefaults,
} from "./estimate-defaults";
import { createRequest } from "./estimation-requests";

const users: string[] = [];
let original: EstimateDefaults;

beforeAll(async () => {
  original = await readDefaults();
});
afterAll(async () => {
  await getDb().estimateDefaults.update({ where: { id: "default" }, data: original });
  await getDb().estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await deleteUsers(users);
});

async function person(role: Role) {
  const user = await createUser({ role });
  users.push(user.id);
  return toCurrentUser(user) as CurrentUser;
}

const step1 = { projectName: "Defaults test", projectDate: "2026-10-31" };

describe("estimate defaults (specs/estimate-defaults)", () => {
  it("starts with the brief's values", async () => {
    // The migration's row; other tests restore it afterwards.
    expect(await getDefaults(await person("ESTIMATOR"))).toEqual({
      qaPercent: 25,
      pmPercent: 30,
      bugFixPercent: 10,
      defaultRate: 30,
      approvedRates: [25, 30, 35, 40, 45, 50],
      minutesPerRound: 6,
    });
  });

  it("lets an Admin change the default minutes per round (whole 1 to 480)", async () => {
    const admin = await person("ADMIN");
    await updateDefaults(admin, { ...original, minutesPerRound: 45 });
    expect((await readDefaults()).minutesPerRound).toBe(45);
    for (const minutesPerRound of [0, 600, 30.5]) {
      await expect(updateDefaults(admin, { ...original, minutesPerRound })).rejects.toMatchObject({
        status: 400,
        message: MINUTES_PER_ROUND_MESSAGE,
      });
    }
    await expect(
      updateDefaults(await person("ESTIMATOR"), { ...original, minutesPerRound: 90 }),
    ).rejects.toMatchObject({ status: 403 });
    expect((await readDefaults()).minutesPerRound).toBe(45);
    await updateDefaults(admin, original);
  });

  it("applies an Admin change to new requests only", async () => {
    const admin = await person("ADMIN");
    const estimator = await person("ESTIMATOR");
    const before = await createRequest(estimator, step1);

    await updateDefaults(admin, {
      ...original,
      qaPercent: 20,
      approvedRates: [30, 35, 40],
      defaultRate: 35,
    });
    const after = await createRequest(estimator, step1);

    const rows = await getDb().estimationRequest.findMany({
      where: { id: { in: [before.id, after.id] } },
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[before.id]).toMatchObject({ qaPercent: 25, hourlyRate: 30, rateConfirmed: false });
    expect(byId[after.id]).toMatchObject({
      qaPercent: 20,
      pmPercent: 30,
      bugFixPercent: 10,
      hourlyRate: 35,
    });

    await updateDefaults(admin, original);
  });

  it("keeps the default rate among the approved rates", async () => {
    const admin = await person("ADMIN");
    await expect(
      updateDefaults(admin, { ...original, approvedRates: [25, 35], defaultRate: 30 }),
    ).rejects.toMatchObject({ status: 400, message: DEFAULT_RATE_MESSAGE });
    await expect(updateDefaults(admin, { ...original, approvedRates: [] })).rejects.toMatchObject({
      status: 400,
    });
    await expect(updateDefaults(admin, { ...original, qaPercent: 120 })).rejects.toThrow(
      "Enter a whole number from 0 to 100",
    );
    expect(await readDefaults()).toEqual(original);
  });

  it("refuses non-Admins", async () => {
    await expect(updateDefaults(await person("ESTIMATOR"), original)).rejects.toMatchObject({
      status: 403,
    });
    await expect(updateDefaults(await person("TECH_LEAD"), original)).rejects.toMatchObject({
      status: 403,
    });
  });
});
