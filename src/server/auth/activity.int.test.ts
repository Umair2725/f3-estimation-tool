import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../../test/factories";
import { ACTIVITY_INTERVAL_MS, touchLastActive } from "./activity";

const created: string[] = [];
afterAll(() => deleteUsers(created));

describe("touchLastActive (specs/user-roles: last active)", () => {
  it("writes at most once per interval", async () => {
    const user = await createUser({});
    created.push(user.id);
    const t0 = new Date("2026-01-01T09:00:00Z");

    expect(await touchLastActive(user.id, t0)).toBe(true);
    // Just before the interval ends: no write.
    expect(
      await touchLastActive(user.id, new Date(t0.getTime() + ACTIVITY_INTERVAL_MS - 1000)),
    ).toBe(false);
    let row = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.lastActiveAt).toEqual(t0);

    // After the interval: updated.
    const later = new Date(t0.getTime() + ACTIVITY_INTERVAL_MS + 1000);
    expect(await touchLastActive(user.id, later)).toBe(true);
    row = await getDb().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.lastActiveAt).toEqual(later);
  });
});
