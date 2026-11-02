import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import type { Role } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../../test/factories";
import { saveManualVersion, TEAM_LEVEL_REQUIRED } from "../actuals";
import { getEstimate, saveEstimate, type EstimateView } from "../estimates";
import { createRequest, saveStep } from "../estimation-requests";
import {
  addObservation,
  confirmBenchmark,
  createBenchmark,
  decideProposal,
  getBenchmark,
  listProposals,
  retireBenchmark,
  updateBenchmark,
} from "./benchmarks";
import { applyImport, previewImport } from "./import";

const users: string[] = [];
const tag = randomUUID().slice(0, 8);
// Fixture codes in FB-8000–8999: apart from the seed list and the reference range (9001 up).
const base = 8000 + Math.floor(Math.random() * 900);
const codes = [`FB-${base}`, `FB-${base + 1}`];
let tech: Record<string, string>;

beforeAll(async () => {
  tech = Object.fromEntries((await getDb().technology.findMany()).map((t) => [t.name, t.id]));
  await getDb().featureBenchmark.deleteMany({ where: { code: { in: codes } } });
});
afterAll(async () => {
  const db = getDb();
  await db.featureBenchmark.deleteMany({
    where: { OR: [{ code: { in: codes } }, { createdById: { in: users } }] },
  });
  await db.estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await db.client.deleteMany({ where: { name: { contains: tag } } });
  await deleteUsers(users);
});

async function person(role: Role) {
  const user = await createUser({ role });
  users.push(user.id);
  return toCurrentUser(user) as CurrentUser;
}

const db = () => getDb();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe("library permissions and status (specs/feature-benchmarks)", () => {
  it("lets editors create, Tech Leads confirm, Architects retire; hand edits return to Draft", async () => {
    const estimator = await person("ESTIMATOR");
    const lead = await person("TECH_LEAD");
    const architect = await person("ARCHITECT");
    const admin = await person("ADMIN");
    const input = {
      feature: `Sign up ${tag}`,
      part: "WEB_FRONTEND",
      stack: "React",
      experienced: 4,
      junior: 6,
    };

    await expect(createBenchmark(estimator, input)).rejects.toMatchObject({ status: 403 });
    const b = await createBenchmark(lead, input);
    expect(b).toMatchObject({ status: "DRAFT", experiencedTenths: 40, juniorTenths: 60 });
    expect(Number(b.code.slice(3))).toBeLessThan(9001);
    await expect(createBenchmark(lead, { ...input, experienced: 8, junior: 6 })).rejects.toThrow(
      "Experienced hours can't be more than junior hours",
    );

    await expect(confirmBenchmark(estimator, b.id)).rejects.toMatchObject({ status: 403 });
    await expect(confirmBenchmark(admin, b.id)).rejects.toMatchObject({ status: 403 });
    await confirmBenchmark(lead, b.id);
    expect(await getBenchmark(estimator, b.id)).toMatchObject({
      status: "CONFIRMED",
      confirmedBy: { name: lead.name },
    });

    // Editing the hours of a Confirmed benchmark sends it back to Draft.
    await updateBenchmark(architect, b.id, { ...input, experienced: 5 });
    const edited = await getBenchmark(lead, b.id);
    expect(edited).toMatchObject({ status: "DRAFT", experiencedTenths: 50, confirmedById: null });
    expect(edited.changes[0]).toMatchObject({
      kind: "EDIT",
      fromExperienced: 40,
      toExperienced: 50,
    });

    await expect(retireBenchmark(lead, b.id)).rejects.toMatchObject({ status: 403 });
    await retireBenchmark(architect, b.id);
    expect((await getBenchmark(lead, b.id)).status).toBe("RETIRED");
    await expect(updateBenchmark(admin, b.id, input)).rejects.toMatchObject({ status: 409 });
  });
});

describe("observations, recalculation and proposals", () => {
  it("applies small changes, proposes large ones on Confirmed, and logs every change", async () => {
    const lead = await person("TECH_LEAD");
    const architect = await person("ARCHITECT");
    const b = await createBenchmark(lead, {
      feature: `Password reset ${tag}`,
      part: "BACKEND",
      experienced: 4,
      junior: 6,
    });
    await confirmBenchmark(lead, b.id);

    // 3.5 h is -12.5%: applied at once, still Confirmed.
    expect(
      await addObservation(lead, b.id, {
        hours: 3.5,
        level: "EXPERIENCED",
        observedOn: daysAgo(5),
      }),
    ).toEqual({ result: "apply" });
    let now = await getBenchmark(lead, b.id);
    expect(now).toMatchObject({ status: "CONFIRMED", experiencedTenths: 35, projectsCount: 1 });
    expect(now.changes[0]).toMatchObject({
      kind: "RECALCULATED",
      fromExperienced: 40,
      toExperienced: 35,
    });
    expect(now.changes[0].observationIds).toHaveLength(1);

    // Adding 2 h makes the mean 2.75 → 3 h (-14%): applied. Then 1 h → 2 h (-33%): proposed.
    await addObservation(lead, b.id, { hours: 2, level: "EXPERIENCED", observedOn: daysAgo(3) });
    expect((await getBenchmark(lead, b.id)).experiencedTenths).toBe(30);
    expect(
      await addObservation(lead, b.id, {
        hours: 0.5,
        level: "EXPERIENCED",
        observedOn: daysAgo(1),
      }),
    ).toEqual({ result: "propose" });
    now = await getBenchmark(lead, b.id);
    expect(now.experiencedTenths).toBe(30);
    expect(now.proposal).toMatchObject({ kind: "PROPOSED", toExperienced: 20 });
    expect((await listProposals(architect)).map((p) => p.id)).toContain(b.id);
    await expect(listProposals(lead)).rejects.toMatchObject({ status: 403 });

    await expect(decideProposal(lead, b.id, true)).rejects.toMatchObject({ status: 403 });
    await decideProposal(architect, b.id, false);
    now = await getBenchmark(lead, b.id);
    expect(now).toMatchObject({ experiencedTenths: 30, proposal: null, status: "CONFIRMED" });

    // A further observation proposes again, and accepting applies it.
    await addObservation(lead, b.id, { hours: 0.5, level: "EXPERIENCED", observedOn: daysAgo(0) });
    await decideProposal(architect, b.id, true);
    now = await getBenchmark(lead, b.id);
    expect(now.experiencedTenths).toBeLessThan(30);
    expect(now.changes[0].kind).toBe("PROPOSAL_ACCEPTED");

    // Mixed observations are kept but not used.
    const before = now.experiencedTenths;
    await addObservation(lead, b.id, { hours: 40, level: "MIXED" });
    expect((await getBenchmark(lead, b.id)).experiencedTenths).toBe(before);
    await expect(
      addObservation(await person("ESTIMATOR"), b.id, { hours: 2, level: "JUNIOR" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("import", () => {
  const surveyHeader = [
    "ID",
    "Module",
    "Feature",
    "Part",
    "Typical stack",
    "What is included (one instance)",
    "Pre-AI Min (h)",
    "Pre-AI Max (h)",
    "Pre-AI source",
    "AI hours - experienced dev",
    "AI hours - junior dev",
    "AI tools used",
    "Based on # projects",
    "Filled by (Tech Lead)",
    "Confirmed by (Architect)",
    "Date (YYYY-MM-DD)",
    "Notes",
  ];

  async function survey(rows: (string | number | null)[][]) {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Instructions");
    const ws = wb.addWorksheet("Features");
    ws.getRow(1).values = [null, ...surveyHeader];
    rows.forEach((r, i) => (ws.getRow(i + 2).values = [null, ...r]));
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  it("previews the seed CSV without saving anything, and is Admin only", async () => {
    const admin = await person("ADMIN");
    const bytes = new Uint8Array(readFileSync("data/feature-benchmarks.csv"));
    const preview = await previewImport(admin, { fileName: "feature-benchmarks.csv", bytes });
    const { counts } = preview;
    expect(counts.new + counts.changed + counts.unchanged).toBe(166);
    expect(counts).toMatchObject({ problems: 0, withHours: 0 });
    await expect(
      previewImport(await person("ARCHITECT"), { fileName: "feature-benchmarks.csv", bytes }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("applies survey hours as observations, keeps confirmed-by as a note, and doesn't duplicate", async () => {
    const admin = await person("ADMIN");
    const bytes = await survey([
      [
        codes[0],
        "Users",
        `Sign up form ${tag}`,
        "Web/Frontend",
        "React",
        "Form + validation",
        10,
        12,
        "Sample A",
        4,
        6,
        "Claude Code",
        3,
        "Sara",
        "Ahmed",
        "2026-10-01",
        "",
      ],
      [
        codes[1],
        "Users",
        `Bad row ${tag}`,
        "Frontendz",
        "Any",
        "",
        null,
        null,
        "",
        null,
        null,
        "",
        null,
        "",
        "",
        "",
        "",
      ],
    ]);
    const file = { fileName: "feature-hours-survey.xlsx", bytes };
    const preview = await previewImport(admin, file);
    expect(preview.counts).toMatchObject({ new: 1, problems: 1, withHours: 1 });
    expect(preview.problems[0].message).toBe("Row 3: unknown part Frontendz");
    expect(await db().featureBenchmark.count({ where: { code: codes[0] } })).toBe(0);

    expect(await applyImport(admin, file)).toEqual({ applied: 1, skipped: 1 });
    const b = await db().featureBenchmark.findUniqueOrThrow({
      where: { code: codes[0] },
      include: { observations: true },
    });
    expect(b).toMatchObject({
      status: "DRAFT",
      part: "WEB_FRONTEND",
      experiencedTenths: 40,
      juniorTenths: 60,
      preAiMinTenths: 100,
      projectsCount: 3,
      notes: "Confirmed in survey by Ahmed",
    });
    expect(b.observations.map((o) => [o.level, o.hoursTenths, o.source]).sort()).toEqual([
      ["EXPERIENCED", 40, "SURVEY"],
      ["JUNIOR", 60, "SURVEY"],
    ]);

    await applyImport(admin, file);
    expect(await db().benchmarkObservation.count({ where: { benchmarkId: b.id } })).toBe(2);
  });
});

describe("actual hours feed benchmarks (specs/actual-hours)", () => {
  function inputFrom(view: EstimateView) {
    return {
      tasks: view.parts.flatMap((p) =>
        p.tasks.map((t) => ({ taskId: t.taskId, subTasks: t.subTasks })),
      ),
      parts: view.parts.map(({ part, deploymentMin, deploymentMax, assumptions, risks }) => ({
        part,
        deploymentMin,
        deploymentMax,
        assumptions,
        risks,
      })),
      ...view.overheads,
    };
  }

  async function deliveredRequest(owner: CurrentUser, baseline: "AI_ERA" | "PRE_AI") {
    const { id } = await createRequest(owner, {
      projectName: `Actuals ${tag}`,
      clientName: `Fabrikam ${tag}`,
      projectDate: "2026-11-01",
    });
    await saveStep(owner, id, 2, {
      applicationTypes: ["Web"],
      operatingSystems: [],
      browsers: ["Chrome"],
      parts: [{ part: "BACKEND", technologyIds: [tech["Node.js"]] }],
    });
    await saveStep(owner, id, 4, {
      features: [{ name: "Sign in", description: "", parts: ["BACKEND"] }],
    });
    const view = await getEstimate(owner, id);
    view.parts[0].tasks[0].subTasks = [{ title: "Login API", min: 4, max: 6, comment: "" }];
    await saveEstimate(owner, id, inputFrom(view));
    await db().estimationRequest.update({
      where: { id },
      data: { outcome: "IN_DELIVERY", baseline },
    });
    const subTaskId = (await getEstimate(owner, id)).parts[0].tasks[0].subTasks[0].id!;
    return { id, subTaskId };
  }

  it("asks the level for AI-era work and turns linked Sub tasks into observations", async () => {
    const owner = await person("ESTIMATOR");
    const lead = await person("TECH_LEAD");
    const b = await createBenchmark(lead, {
      feature: `Login ${tag}`,
      part: "BACKEND",
      experienced: 4,
      junior: 6,
    });
    const { id, subTaskId } = await deliveredRequest(owner, "AI_ERA");
    await db().subTask.update({ where: { id: subTaskId }, data: { benchmarkId: b.id } });

    await expect(
      saveManualVersion(lead, id, { rows: [{ subTaskId, actual: 3.5 }] }),
    ).rejects.toThrow(TEAM_LEVEL_REQUIRED);
    await saveManualVersion(lead, id, {
      teamLevel: "EXPERIENCED",
      rows: [{ subTaskId, actual: 3.5 }],
    });
    let obs = await db().benchmarkObservation.findMany({ where: { benchmarkId: b.id } });
    expect(obs.map((o) => [o.level, o.hoursTenths, o.source, o.requestId])).toEqual([
      ["EXPERIENCED", 35, "ACTUALS", id],
    ]);
    expect((await getBenchmark(lead, b.id)).experiencedTenths).toBe(35);

    // Version 2 replaces version 1's observations.
    await saveManualVersion(lead, id, {
      teamLevel: "EXPERIENCED",
      rows: [{ subTaskId, actual: 3 }],
    });
    obs = await db().benchmarkObservation.findMany({ where: { benchmarkId: b.id } });
    expect(obs.map((o) => o.hoursTenths)).toEqual([30]);

    // Mixed: recorded, but not used to recalculate (the hours stay at 3 h).
    await saveManualVersion(lead, id, { teamLevel: "MIXED", rows: [{ subTaskId, actual: 9 }] });
    obs = await db().benchmarkObservation.findMany({ where: { benchmarkId: b.id } });
    expect(obs.map((o) => [o.level, o.hoursTenths])).toEqual([["MIXED", 90]]);
    expect((await getBenchmark(lead, b.id)).experiencedTenths).toBe(30);
  });

  it("asks nothing and adds nothing for imported pre-AI projects", async () => {
    const owner = await person("ESTIMATOR");
    const lead = await person("TECH_LEAD");
    const b = await createBenchmark(lead, {
      feature: `Pre ${tag}`,
      part: "BACKEND",
      experienced: 4,
    });
    const { id, subTaskId } = await deliveredRequest(owner, "PRE_AI");
    await db().subTask.update({ where: { id: subTaskId }, data: { benchmarkId: b.id } });
    await saveManualVersion(lead, id, { rows: [{ subTaskId, actual: 3 }] });
    expect(await db().benchmarkObservation.count({ where: { benchmarkId: b.id } })).toBe(0);
  });
});
