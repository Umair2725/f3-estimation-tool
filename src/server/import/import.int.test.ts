import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import type { Role } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../../test/factories";
import {
  approveProject,
  createBatch,
  DUPLICATE_CHOICE_MESSAGE,
  getBatch,
  getImportedProject,
  getUploadedFile,
  rejectProject,
  saveDecisions,
} from "./import";

const users: string[] = [];
const tag = randomUUID().slice(0, 8);

afterAll(async () => {
  const db = getDb();
  await db.estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await db.importBatch.deleteMany({ where: { createdById: { in: users } } });
  await db.uploadedFile.deleteMany({ where: { uploadedById: { in: users } } });
  await db.client.deleteMany({ where: { name: { contains: tag } } });
  await deleteUsers(users);
});

async function person(role: Role = "ADMIN") {
  const user = await createUser({ role });
  users.push(user.id);
  return toCurrentUser(user) as CurrentUser;
}

/** A small past estimate: Summary + one development sheet named like old files ("BackEnd"). */
async function estimateFile(opts: {
  project: string;
  client: string;
  rows: [string, number, number][];
  actual?: Record<string, number>;
  extraSheet?: string;
}) {
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet("Summary");
  summary.getCell("B1").value = "Folio3 Project Estimation Template v 0.5";
  summary.getCell("B2").value = opts.project;
  summary.getCell("B5").value = "Client Name";
  summary.getCell("C5").value = opts.client;
  summary.getCell("B6").value = "Project Manager";
  summary.getCell("C6").value = "Sara";
  summary.getCell("B10").value = "Task Summary";
  summary.getCell("B11").value = "Development Estimates";
  summary.getCell("C11").value = 100;
  summary.getCell("B12").value = "QA Estimates";
  summary.getCell("C12").value = { formula: "C11*0.3", result: 30 };
  summary.getCell("B13").value = "Total Estimates";
  for (const name of ["BackEnd", ...(opts.extraSheet ? [opts.extraSheet] : [])]) {
    const ws = wb.addWorksheet(name);
    ws.getCell("B2").value = `${opts.project} (Node)`;
    ["S.No", "Task", "Minimum", "Maximum", ...(opts.actual ? ["Actual"] : []), "Comments"].forEach(
      (h, i) => (ws.getCell(8, i + 2).value = h),
    );
    ws.getCell("B9").value = 1;
    ws.getCell("C9").value = "Authentication";
    opts.rows.forEach(([title, min, max], i) => {
      ws.getCell(10 + i, 3).value = title;
      ws.getCell(10 + i, 4).value = min;
      ws.getCell(10 + i, 5).value = max;
      if (opts.actual?.[title] !== undefined) ws.getCell(10 + i, 6).value = opts.actual[title];
    });
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

async function zipOf(files: Record<string, Uint8Array>) {
  const zip = new JSZip();
  for (const [path, bytes] of Object.entries(files)) zip.file(path, bytes);
  return zip.generateAsync({ type: "uint8array" });
}

const rows: [string, number, number][] = [
  ["User login", 8, 12],
  ["Password reset", 4, 6],
  ["Sample row", 1, 1],
];

describe("historical import (specs/historical-import)", () => {
  it("imports a zip: a delivered project, an estimate-only project and an unreadable file", async () => {
    const admin = await person();
    const portal = await estimateFile({
      project: `Portal ${tag}`,
      client: `Northwind ${tag}`,
      rows,
      extraSheet: "MVP",
    });
    const portalActuals = await estimateFile({
      project: `Portal ${tag}`,
      client: `Northwind ${tag}`,
      rows: [
        ["User Login + OTP", 10, 10],
        ["Password reset", 5, 5],
      ],
      actual: { "User Login + OTP": 10, "Password reset": 5 },
    });
    const fleet = await estimateFile({
      project: `Fleet ${tag}`,
      client: `Contoso ${tag}`,
      rows: rows.slice(0, 2),
    });
    const bytes = await zipOf({
      "Portal/estimate.xlsx": portal,
      "Portal/estimate-actuals.xlsx": portalActuals,
      "Fleet/Estimation_Sheet.xlsx": fleet,
      "Broken/Estimation_Sheet.xlsx": new TextEncoder().encode("%PDF-1.7 not a workbook"),
      "Fleet/notes.txt": new TextEncoder().encode("ignored"),
    });

    const { batchId } = await createBatch(admin, {
      kind: "zip",
      file: { fileName: "past.zip", bytes },
    });
    const batch = await getBatch(admin, batchId);
    expect(batch.projects.map((p) => [p.folder, p.status])).toEqual([
      ["Broken", "FAILED"],
      ["Fleet", "READY"],
      ["Portal", "READY"],
    ]);
    expect(batch.projects[0].failure).toBe(
      "Estimation_Sheet.xlsx: This file isn't a readable Excel workbook",
    );
    expect(batch.notes).toEqual(['Ignored "Fleet/notes.txt": only .xlsx files are imported']);
    expect(batch.counts).toMatchObject({ failed: 1, waiting: 2, total: 3 });

    // Portal: an unknown "MVP" sheet must get a part; exclude the sample row; approve.
    const portalId = batch.projects[2].id;
    const preview = await getImportedProject(admin, portalId);
    expect(preview.preview?.unassigned).toEqual(["MVP"]);
    expect(preview.comparison?.counts).toMatchObject({ matched: 2, toConfirm: 1 });
    await expect(approveProject(admin, portalId)).rejects.toThrow(
      "Choose a part (or Skip) for: MVP",
    );
    await saveDecisions(admin, portalId, { sheetParts: { MVP: "skip" }, excluded: ["BackEnd!12"] });
    const { requestId } = await approveProject(admin, portalId);

    const db = getDb();
    const request = await db.estimationRequest.findUniqueOrThrow({
      where: { id: requestId! },
      include: {
        parts: { include: { tasks: { include: { subTasks: true } } } },
        actuals: { include: { rows: true } },
      },
    });
    expect(request).toMatchObject({
      projectName: `Portal ${tag}`,
      origin: "IMPORTED",
      baseline: "PRE_AI",
      status: "APPROVED",
      outcome: "DELIVERED",
      qaPercent: 30,
      qaEnabled: true,
      pmEnabled: false,
      projectManager: "Sara",
    });
    // Its approved version 1 is the knowledge-base source (specs/estimate-review).
    const approved = await db.approvedVersion.findMany({ where: { requestId: requestId! } });
    expect(approved.map((a) => [a.version, a.approvedById])).toEqual([[1, admin.id]]);
    expect(
      await db.statusChange.findMany({
        where: { requestId: requestId! },
        select: { toStatus: true, comment: true },
      }),
    ).toEqual([{ toStatus: "APPROVED", comment: "Approved (imported)" }]);
    const subTasks = request.parts.flatMap((p) => p.tasks.flatMap((t) => t.subTasks));
    expect(subTasks.map((s) => [s.title, s.minTenths, s.sourceSheet, s.sourceRow])).toEqual([
      ["User login", 80, "BackEnd", 10],
      ["Password reset", 40, "BackEnd", 11],
    ]);
    expect(subTasks.every((s) => s.sourceFileId)).toBe(true);
    const version = request.actuals[0];
    expect(version).toMatchObject({ number: 1, source: "FILE", fileName: "estimate-actuals.xlsx" });
    const login = version.rows.find((r) => r.title === "User login")!;
    expect(login).toMatchObject({ status: "MATCHED", actualTenths: 100 });
    expect(login.flags).toContain("Matched by similarity at import");

    // Fleet: estimate only.
    const fleetResult = await approveProject(admin, batch.projects[1].id);
    const fleetRequest = await db.estimationRequest.findUniqueOrThrow({
      where: { id: fleetResult.requestId! },
    });
    expect(fleetRequest).toMatchObject({ outcome: "NONE", origin: "IMPORTED" });

    expect((await getBatch(admin, batchId)).counts).toMatchObject({
      imported: 2,
      failed: 1,
      waiting: 0,
    });

    // Original files stay downloadable for everyone with a role once historical.
    const estimator = await person("ESTIMATOR");
    const file = await getUploadedFile(estimator, subTasks[0].sourceFileId!);
    expect(file.fileName).toBe("estimate.xlsx");
  });

  it("detects the same file and newer versions, and needs a choice before approving", async () => {
    const admin = await person();
    const original = await estimateFile({
      project: `Shop ${tag}`,
      client: `Fabrikam ${tag}`,
      rows: rows.slice(0, 1),
    });
    const first = await createBatch(admin, {
      kind: "single",
      estimate: { fileName: "shop.xlsx", bytes: original },
    });
    await approveProject(admin, (await getBatch(admin, first.batchId)).projects[0].id);

    // The same bytes under a different name.
    const again = await createBatch(admin, {
      kind: "single",
      estimate: { fileName: "copy.xlsx", bytes: original },
    });
    const againProject = (await getBatch(admin, again.batchId)).projects[0];
    expect(againProject.duplicate).toMatchObject({ kind: "same-file", projectName: `Shop ${tag}` });
    await expect(approveProject(admin, againProject.id)).rejects.toThrow(DUPLICATE_CHOICE_MESSAGE);
    await saveDecisions(admin, againProject.id, { duplicate: "skip" });
    expect(await approveProject(admin, againProject.id)).toEqual({
      status: "SKIPPED",
      requestId: null,
    });

    // Same project, different content.
    const changed = await estimateFile({
      project: `Shop ${tag}`,
      client: `fabrikam ${tag}`.toUpperCase(),
      rows,
    });
    const newer = await createBatch(admin, {
      kind: "single",
      estimate: { fileName: "shop v2.xlsx", bytes: changed },
    });
    const newerProject = (await getBatch(admin, newer.batchId)).projects[0];
    expect(newerProject.duplicate).toMatchObject({ kind: "newer-version" });
    await saveDecisions(admin, newerProject.id, { duplicate: "new-version" });
    expect((await approveProject(admin, newerProject.id)).status).toBe("APPROVED");
  });

  it("creates nothing when rejected, and refuses non-Admins and oversized batches", async () => {
    const admin = await person();
    const bytes = await estimateFile({ project: `Reject ${tag}`, client: `X ${tag}`, rows });
    const { batchId } = await createBatch(admin, {
      kind: "single",
      estimate: { fileName: "r.xlsx", bytes },
    });
    const projectId = (await getBatch(admin, batchId)).projects[0].id;
    await rejectProject(admin, projectId);
    expect((await getBatch(admin, batchId)).projects[0]).toMatchObject({
      status: "REJECTED",
      requestId: null,
    });
    await expect(approveProject(admin, projectId)).rejects.toMatchObject({ status: 409 });

    const lead = await person("TECH_LEAD");
    await expect(
      createBatch(lead, { kind: "single", estimate: { fileName: "r.xlsx", bytes } }),
    ).rejects.toMatchObject({
      status: 403,
    });
    const tiny = await estimateFile({ project: "T", client: "T", rows: rows.slice(0, 1) });
    const many = await zipOf(
      Object.fromEntries(Array.from({ length: 151 }, (_, i) => [`P${i}/e.xlsx`, tiny])),
    );
    await expect(
      createBatch(admin, { kind: "zip", file: { fileName: "many.zip", bytes: many } }),
    ).rejects.toThrow("A batch can hold at most 150 projects");
  });

  it("parses a 100-project batch in under 60 seconds", async () => {
    const admin = await person();
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 100; i++) {
      files[`Project ${i}/estimate.xlsx`] = await estimateFile({
        project: `Bulk ${tag} ${i}`,
        client: `Bulk ${tag}`,
        rows,
      });
    }
    const bytes = await zipOf(files);
    const started = performance.now();
    const { batchId } = await createBatch(admin, {
      kind: "zip",
      file: { fileName: "bulk.zip", bytes },
    });
    const seconds = (performance.now() - started) / 1000;
    console.info(`100-project batch parsed in ${seconds.toFixed(1)} s`);
    expect(seconds).toBeLessThan(60);
    expect((await getBatch(admin, batchId)).counts).toMatchObject({ waiting: 100, failed: 0 });
  }, 120_000);
});
