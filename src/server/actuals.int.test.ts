import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import type { Role } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../test/factories";
import {
  createPendingUpload,
  discardUpload,
  getActuals,
  getVersionFile,
  latestActualTotals,
  LOCKED_MESSAGE,
  NOT_WON_MESSAGE,
  previewUpload,
  saveManualVersion,
  saveUploadVersion,
} from "./actuals";
import { getEstimate, saveEstimate } from "./estimates";
import { createRequest, saveStep } from "./estimation-requests";
import { exportInternal } from "./export/export";
import { setOutcome } from "./outcome";

const users: string[] = [];
const tag = randomUUID().slice(0, 8);
let tech: Record<string, string>;
beforeAll(async () => {
  tech = Object.fromEntries((await getDb().technology.findMany()).map((t) => [t.name, t.id]));
});
afterAll(async () => {
  await getDb().estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await deleteUsers(users);
});

async function person(role: Role | null = "ESTIMATOR") {
  const user = await createUser({ role });
  users.push(user.id);
  return toCurrentUser(user) as CurrentUser;
}

/** A Backend request with "User login" (8–12), "Image uploader" (6–8) and "Booking API" (40–56). */
async function wonRequest(owner: CurrentUser, won = true) {
  const { id } = await createRequest(owner, {
    projectName: `Actuals ${tag}`,
    projectDate: "2026-11-01",
  });
  await saveStep(owner, id, 2, {
    applicationTypes: [],
    operatingSystems: [],
    browsers: [],
    parts: [{ part: "BACKEND", technologyIds: [tech["Node.js"]] }],
  });
  await saveStep(owner, id, 4, {
    loadedIds: [],
    features: [
      { name: "Authentication", parts: ["BACKEND"] },
      { name: "Booking", parts: ["BACKEND"] },
    ],
  });
  const view = await getEstimate(owner, id);
  view.parts[0].tasks[0].subTasks = [
    { title: "User login", min: 8, max: 12, comment: "" },
    { title: "Image uploader", min: 6, max: 8, comment: "" },
  ];
  view.parts[0].tasks[1].subTasks = [{ title: "Booking API", min: 40, max: 56, comment: "" }];
  await saveEstimate(owner, id, {
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
  });
  if (won) await setOutcome(owner, id, { outcome: "IN_DELIVERY" });
  return id;
}

const subTaskIds = async (owner: CurrentUser, id: string) =>
  Object.fromEntries(
    (await getActuals(owner, id)).estimate.flatMap((p) =>
      p.tasks.flatMap((t) => t.subTasks.map((s) => [s.title, s.id])),
    ),
  );

describe("recording actual hours (specs/actual-hours)", () => {
  it("saves manual versions; empty rows are dropped; the report shows variance", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const id = await wonRequest(owner);
    const ids = await subTaskIds(owner, id);
    await saveManualVersion(lead, id, {
      teamLevel: "EXPERIENCED",
      rows: [
        { subTaskId: ids["User login"], actual: 10 },
        { subTaskId: ids["Booking API"], actual: 38 },
        {
          unplanned: {
            requestPartId: (await getActuals(lead, id)).estimate[0].partId,
            taskTitle: "Authentication",
            title: "Data migration",
          },
          actual: 6,
        },
      ],
    });
    const view = await getActuals(owner, id);
    expect(view.latest).toMatchObject({ number: 1, source: "MANUAL" });
    const status = Object.fromEntries(view.rows.map((r) => [r.title, [r.status, r.actualTenths]]));
    expect(status).toEqual({
      "User login": ["MATCHED", 100],
      "Image uploader": ["DROPPED", null],
      "Booking API": ["MATCHED", 380],
      "Data migration": ["UNPLANNED", 60],
    });
    const booking = view.report!.parts[0].tasks.find((t) => t.title === "Booking")!;
    expect(booking).toMatchObject({ estMin: 40, estMax: 56, actual: 38, variance: -5 });
    expect(view.report!.actualTotal).toBe(54);
    expect((await latestActualTotals([id])).get(id)).toBe(54);

    await saveManualVersion(lead, id, {
      teamLevel: "EXPERIENCED",
      rows: [{ subTaskId: ids["User login"], actual: 12 }],
    });
    expect((await getActuals(owner, id)).history.map((h) => h.number)).toEqual([2, 1]);
  });

  it("refuses Estimators, requests that aren't won, and non-Admins once delivered", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const admin = await person("ADMIN");
    const notWon = await wonRequest(owner, false);
    await expect(
      saveManualVersion(lead, notWon, { teamLevel: "EXPERIENCED", rows: [] }),
    ).rejects.toThrow(NOT_WON_MESSAGE);

    const id = await wonRequest(owner);
    await expect(
      saveManualVersion(owner, id, { teamLevel: "EXPERIENCED", rows: [] }),
    ).rejects.toMatchObject({ status: 403 });
    expect((await getActuals(owner, id)).canRecord).toBe(false);
    await setOutcome(lead, id, { outcome: "DELIVERED" });
    await expect(
      saveManualVersion(lead, id, { teamLevel: "EXPERIENCED", rows: [] }),
    ).rejects.toThrow(LOCKED_MESSAGE);
    await saveManualVersion(admin, id, { teamLevel: "EXPERIENCED", rows: [] });
    await expect(getActuals(await person(null), id)).rejects.toMatchObject({ status: 403 });
  });

  it("rejects bad hours", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const id = await wonRequest(owner);
    const ids = await subTaskIds(owner, id);
    await expect(
      saveManualVersion(lead, id, {
        teamLevel: "EXPERIENCED",
        rows: [{ subTaskId: ids["User login"], actual: 2.25 }],
      }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("actuals upload (specs/actual-hours)", () => {
  it("round trip: export, edit hours in Excel, upload, preview, confirm and save", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const id = await wonRequest(owner);

    // Edit the exported file as a PM would: real hours, a rename, an extra row, a removed row.
    const { buffer } = await exportInternal(owner, id);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Backend (Node.js)")!;
    ws.eachRow((row) => {
      const title = row.getCell(3).value;
      if (title === "User login") {
        row.getCell(3).value = "User Login + OTP";
        row.getCell(4).value = 10;
        row.getCell(5).value = 10;
      } else if (title === "Image uploader") {
        row.getCell(3).value = "Data migration";
        row.getCell(4).value = 6;
        row.getCell(5).value = 6;
      } else if (title === "Booking API") {
        row.getCell(4).value = 38;
        row.getCell(5).value = 42; // Min and Max differ: Min is used and flagged
      }
    });
    const edited = new Uint8Array(await wb.xlsx.writeBuffer());

    await expect(
      createPendingUpload(lead, id, { fileName: "actuals.pdf", bytes: edited }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createPendingUpload(lead, id, {
        fileName: "bad.xlsx",
        bytes: new TextEncoder().encode("%PDF-1.7"),
      }),
    ).rejects.toThrow("This file isn't a readable Excel workbook");

    const { uploadId } = await createPendingUpload(lead, id, {
      fileName: "Actuals.xlsx",
      bytes: edited,
    });
    const preview = await previewUpload(lead, id, uploadId);
    const byTitle = Object.fromEntries(preview.match.rows.map((r) => [r.title, r]));
    expect(byTitle["User login"]).toMatchObject({
      status: "MATCHED",
      needsConfirmation: true,
      actual: 10,
    });
    expect(byTitle["Booking API"]).toMatchObject({
      status: "MATCHED",
      actual: 38,
      flags: ["Min and Max differ; Min was used"],
    });
    expect(byTitle["Data migration"]).toMatchObject({ status: "UNPLANNED", actual: 6 });
    expect(byTitle["Image uploader"]).toMatchObject({ status: "DROPPED" });
    expect(await getDb().actualsVersion.count({ where: { requestId: id } })).toBe(0); // nothing stored yet

    const version = await saveUploadVersion(
      lead,
      id,
      uploadId,
      { hours: { [byTitle["Booking API"].key]: 39 } },
      "EXPERIENCED",
    );
    expect(version).toMatchObject({ number: 1, source: "FILE", fileName: "Actuals.xlsx" });
    expect(version.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(await getDb().actualsUpload.count({ where: { id: uploadId } })).toBe(0);
    const saved = await getActuals(owner, id);
    expect(saved.rows.find((r) => r.title === "Booking API")?.actualTenths).toBe(390);
    const file = await getVersionFile(owner, id, version.id);
    expect(Buffer.from(file.bytes).equals(Buffer.from(edited))).toBe(true);
  });

  it("rejecting a proposed match makes the rows unplanned and dropped; discard stores nothing", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const id = await wonRequest(owner);
    const { buffer } = await exportInternal(owner, id);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    wb.getWorksheet("Backend (Node.js)")!.eachRow((row) => {
      if (row.getCell(3).value === "User login") row.getCell(3).value = "User Login + OTP";
    });
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());

    const first = await createPendingUpload(lead, id, { fileName: "a.xlsx", bytes });
    await discardUpload(lead, id, first.uploadId);
    await expect(previewUpload(lead, id, first.uploadId)).rejects.toMatchObject({ status: 404 });

    const { uploadId } = await createPendingUpload(lead, id, { fileName: "b.xlsx", bytes });
    const login = (await previewUpload(lead, id, uploadId)).match.rows.find(
      (r) => r.title === "User login",
    )!;
    await saveUploadVersion(
      lead,
      id,
      uploadId,
      { rejected: [`${login.key}>${login.subTaskId}`] },
      "EXPERIENCED",
    );
    const status = Object.fromEntries(
      (await getActuals(owner, id)).rows.map((r) => [r.title, r.status]),
    );
    expect(status["User Login + OTP"]).toBe("UNPLANNED");
    expect(status["User login"]).toBe("DROPPED");
  });
});
