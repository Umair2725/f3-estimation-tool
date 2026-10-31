import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import type { Role } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../test/factories";
import { parseFilters } from "@/lib/estimation/filters";
import { createRequest, getRequest, listRequests, saveStep } from "./estimation-requests";
import {
  estimateTotals,
  getEstimate,
  RATE_MESSAGE,
  saveEstimate,
  type EstimateView,
} from "./estimates";

const users: string[] = [];
const tag = randomUUID().slice(0, 8);
let tech: Record<string, string>;

beforeAll(async () => {
  tech = Object.fromEntries((await getDb().technology.findMany()).map((t) => [t.name, t.id]));
});
afterAll(async () => {
  await getDb().estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await getDb().client.deleteMany({ where: { name: { contains: tag } } });
  await deleteUsers(users);
});

async function person(role: Role | null = "ESTIMATOR") {
  const user = await createUser({ role });
  users.push(user.id);
  return toCurrentUser(user) as CurrentUser;
}

/** A request with Backend and Mobile, and "Booking" on both. */
async function requestWithScope(owner: CurrentUser) {
  const { id } = await createRequest(owner, {
    projectName: `Hours ${tag}`,
    projectDate: "2026-10-31",
  });
  await saveStep(owner, id, 2, {
    applicationTypes: [],
    operatingSystems: [],
    browsers: [],
    parts: [
      { part: "BACKEND", technologyIds: [tech["Node.js"]] },
      { part: "MOBILE", technologyIds: [tech["Flutter"]] },
    ],
  });
  await saveStep(owner, id, 3, {
    environments: ["Staging", "Production"],
    appStores: ["Google Play"],
  });
  await saveStep(owner, id, 4, { features: [{ name: "Booking", parts: ["BACKEND", "MOBILE"] }] });
  return id;
}

function inputFrom(view: EstimateView, patch: Partial<EstimateView["overheads"]> = {}) {
  return {
    tasks: view.parts.flatMap((p) =>
      p.tasks.map((t) => ({ taskId: t.taskId, subTasks: t.subTasks })),
    ),
    parts: view.parts.map((p) => ({
      part: p.part,
      deploymentMin: p.deploymentMin,
      deploymentMax: p.deploymentMax,
      assumptions: p.assumptions,
      risks: p.risks,
    })),
    ...view.overheads,
    ...patch,
  };
}

describe("estimate hours (specs/estimate-hours)", () => {
  it("shows one Task per feature and part, labelled by part and stack", async () => {
    const owner = await person();
    const id = await requestWithScope(owner);
    const view = await getEstimate(owner, id);
    expect(view.parts.map((p) => p.label)).toEqual(["Backend (Node.js)", "Mobile (Flutter)"]);
    expect(view.parts.map((p) => p.tasks.map((t) => t.featureName))).toEqual([
      ["Booking"],
      ["Booking"],
    ]);
    expect(view.environments).toEqual(["Staging", "Production", "Google Play"]);
    expect(view.overheads).toMatchObject({
      qaPercent: 25,
      pmPercent: 30,
      bugFixPercent: 10,
      rateConfirmed: false,
    });
    expect(view.request.canEdit).toBe(true);
  });

  it("saves Sub tasks, extras and overheads, and computes the spec totals", async () => {
    const owner = await person();
    const id = await requestWithScope(owner);
    const view = await getEstimate(owner, id);
    const [backend, mobile] = view.parts;
    backend.tasks[0].subTasks = [
      { title: "Booking API", min: 60, max: 80, comment: "" },
      { title: "Reminders job", min: 40, max: 60, comment: "Uses the queue" },
    ];
    backend.deploymentMin = 16;
    backend.deploymentMax = 24;
    backend.assumptions = ["Client provides SMS gateway", ""];
    mobile.risks = ["App store review delays"];
    await saveEstimate(owner, id, inputFrom(view, { rateConfirmed: true }));

    const saved = await getEstimate(owner, id);
    expect(saved.parts[0].tasks[0].subTasks.map((s) => s.title)).toEqual([
      "Booking API",
      "Reminders job",
    ]);
    expect(saved.parts[0].assumptions).toEqual(["Client provides SMS gateway"]);
    expect(saved.parts[1].risks).toEqual(["App store review delays"]);
    expect(saved.overheads.rateConfirmed).toBe(true);
    const totals = estimateTotals(saved);
    expect(totals.total.min).toBeCloseTo(195.3, 9);
    expect(totals.total.max).toBeCloseTo(275.9, 9);
    expect(totals.cost.max).toBeCloseTo(8277, 9);

    // Reordering is just a new order on save.
    saved.parts[0].tasks[0].subTasks.reverse();
    await saveEstimate(owner, id, inputFrom(saved));
    const reordered = await getEstimate(owner, id);
    expect(reordered.parts[0].tasks[0].subTasks.map((s) => s.title)).toEqual([
      "Reminders job",
      "Booking API",
    ]);
  });

  it("refuses invalid hours and unapproved rates", async () => {
    const owner = await person();
    const id = await requestWithScope(owner);
    const view = await getEstimate(owner, id);
    view.parts[0].tasks[0].subTasks = [{ title: "X", min: 2.25, max: 3, comment: "" }];
    await expect(saveEstimate(owner, id, inputFrom(view))).rejects.toThrow(
      "Enter hours from 0 to 9999, with at most one decimal",
    );
    view.parts[0].tasks[0].subTasks = [];
    await expect(saveEstimate(owner, id, inputFrom(view, { hourlyRate: 33 }))).rejects.toThrow(
      RATE_MESSAGE,
    );
  });

  it("keeps a current rate that is no longer approved", async () => {
    const owner = await person();
    const id = await requestWithScope(owner);
    await getDb().estimationRequest.update({ where: { id }, data: { hourlyRate: 33 } });
    const view = await getEstimate(owner, id);
    await saveEstimate(owner, id, inputFrom(view));
    expect((await getEstimate(owner, id)).overheads.hourlyRate).toBe(33);
    await expect(saveEstimate(owner, id, inputFrom(view, { hourlyRate: 34 }))).rejects.toThrow(
      RATE_MESSAGE,
    );
  });

  it("lets others view but not save; no role can't view", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const admin = await person("ADMIN");
    const id = await requestWithScope(owner);
    const seen = await getEstimate(lead, id);
    expect(seen.request.canEdit).toBe(false);
    await expect(saveEstimate(lead, id, inputFrom(seen))).rejects.toMatchObject({ status: 403 });
    await saveEstimate(admin, id, inputFrom(seen, { bugFixPercent: 15 }));
    expect((await getEstimate(owner, id)).overheads.bugFixPercent).toBe(15);
    await expect(getEstimate(await person(null), id)).rejects.toMatchObject({ status: 403 });
  });
});

describe("hours on the home list and request page (specs/estimate-hours)", () => {
  it("shows the rounded grand total once there are Sub task hours", async () => {
    const owner = await person();
    const id = await requestWithScope(owner);
    const name = `List hours ${randomUUID().slice(0, 6)}`;
    await getDb().estimationRequest.update({ where: { id }, data: { projectName: name } });
    const row = async () => (await listRequests(owner, parseFilters({ q: name }))).rows[0];
    expect((await row()).hours).toBe("–");
    expect((await getRequest(owner, id)).hours).toBe("–");

    const view = await getEstimate(owner, id);
    view.parts[0].tasks[0].subTasks = [{ title: "API", min: 100, max: 140, comment: "" }];
    view.parts[0].deploymentMin = 16;
    view.parts[0].deploymentMax = 24;
    await saveEstimate(owner, id, inputFrom(view));
    expect((await row()).hours).toBe("195–276");
    expect((await getRequest(owner, id)).hours).toBe("195–276");
  });
});
