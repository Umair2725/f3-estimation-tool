import "server-only";
import type { CurrentUser } from "@/server/auth/access";
import { can } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  matchActuals,
  type EstimatePart,
  type FileSheet,
  type MatchDecisions,
  type MatchResult,
} from "@/lib/actuals/match";
import { buildReport, type AccuracyReport } from "@/lib/actuals/report";
import { PART_VALUES } from "@/lib/estimation/options";
import { hoursSchema, HOURS_MESSAGE } from "@/lib/estimation/schemas";
import { toTenths } from "@/lib/estimation/totals";
import { parseEstimateFile } from "./estimate-parser";
import { partLabel } from "./estimates";
import { assertAccess, ServiceError } from "./service-error";

// Actual hours of a won project (specs/actual-hours): recorded in the tool or from an uploaded
// copy of the estimate's Excel, matched to the estimate, saved as versions; the latest counts.

export const NOT_WON_MESSAGE = "Mark the project as won first";
export const LOCKED_MESSAGE = "Delivered: actual hours are final";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;
type Outcome = "NONE" | "IN_DELIVERY" | "LOST" | "DELIVERED";

/** Whether this person may save actual hours for a request with this outcome. */
export function canRecordActuals(actor: CurrentUser, outcome: Outcome): boolean {
  if (!can(actor.role, "actuals.record")) return false;
  if (outcome === "IN_DELIVERY") return true;
  return outcome === "DELIVERED" && can(actor.role, "settings.manage");
}

function assertCanRecord(actor: CurrentUser, outcome: Outcome) {
  if (!can(actor.role, "actuals.record")) {
    throw new ServiceError("Only Tech Leads, Architects and Admins can record actual hours", 403);
  }
  if (outcome === "DELIVERED" && !can(actor.role, "settings.manage"))
    throw new ServiceError(LOCKED_MESSAGE, 403);
  if (outcome !== "IN_DELIVERY" && outcome !== "DELIVERED")
    throw new ServiceError(NOT_WON_MESSAGE, 400);
}

async function loadRequest(db: Tx | ReturnType<typeof getDb>, id: string) {
  const request = await db.estimationRequest.findUnique({
    where: { id },
    select: { id: true, projectName: true, outcome: true, ownerId: true },
  });
  if (!request) throw new ServiceError("Request not found", 404);
  return request;
}

/** The current estimate as the matcher sees it: parts → Tasks → Sub tasks, in display order. */
export async function estimateParts(
  db: Tx | ReturnType<typeof getDb>,
  requestId: string,
): Promise<EstimatePart[]> {
  const parts = await db.requestPart.findMany({
    where: { requestId },
    include: {
      technologies: { include: { technology: true } },
      tasks: { include: { feature: true, subTasks: { orderBy: { position: "asc" } } } },
    },
  });
  return parts
    .sort((a, b) => PART_VALUES.indexOf(a.part) - PART_VALUES.indexOf(b.part))
    .map((p) => ({
      partId: p.id,
      kind: p.part,
      label: partLabel(
        p.part,
        p.technologies.map((t) => t.technology.name).sort((a, b) => a.localeCompare(b)),
      ),
      tasks: [...p.tasks]
        .sort((a, b) => a.feature.position - b.feature.position)
        .map((t) => ({
          title: t.feature.name,
          subTasks: t.subTasks.map((s) => ({
            id: s.id,
            title: s.title,
            minTenths: s.minTenths,
            maxTenths: s.maxTenths,
          })),
        })),
    }));
}

// ---------- reading ----------

export type ActualsRow = {
  key: string;
  status: "MATCHED" | "UNPLANNED" | "DROPPED";
  subTaskId: string | null;
  partId: string | null;
  partLabel: string;
  taskTitle: string;
  title: string;
  estMinTenths: number;
  estMaxTenths: number;
  actualTenths: number | null;
  flags: string[];
};

export type ActualsView = {
  request: { id: string; projectName: string; outcome: Outcome };
  canRecord: boolean;
  estimate: EstimatePart[];
  /** The latest version's rows, or the estimate with no actuals yet. */
  rows: ActualsRow[];
  latest: { number: number; source: "MANUAL" | "FILE"; createdBy: string; createdAt: Date } | null;
  history: {
    id: string;
    number: number;
    source: "MANUAL" | "FILE";
    fileName: string | null;
    createdBy: string;
    createdAt: Date;
  }[];
  report: AccuracyReport | null;
};

export async function getActuals(actor: CurrentUser | null, id: string): Promise<ActualsView> {
  assertAccess(actor);
  const db = getDb();
  const request = await loadRequest(db, id);
  const estimate = await estimateParts(db, id);
  const versions = await db.actualsVersion.findMany({
    where: { requestId: id },
    orderBy: { number: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
  const latest = versions[0];
  let rows: ActualsRow[];
  if (latest) {
    const saved = await db.actualHours.findMany({
      where: { versionId: latest.id },
      orderBy: { position: "asc" },
    });
    rows = saved.map((r) => ({
      key: r.id,
      status: r.status,
      subTaskId: r.subTaskId,
      partId: r.requestPartId,
      partLabel: r.partLabel,
      taskTitle: r.taskTitle,
      title: r.title,
      estMinTenths: r.estMinTenths,
      estMaxTenths: r.estMaxTenths,
      actualTenths: r.actualTenths,
      flags: r.flags,
    }));
  } else {
    rows = estimate.flatMap((p) =>
      p.tasks.flatMap((t) =>
        t.subTasks.map((s) => ({
          key: `est:${s.id}`,
          status: "DROPPED" as const,
          subTaskId: s.id,
          partId: p.partId,
          partLabel: p.label,
          taskTitle: t.title,
          title: s.title,
          estMinTenths: s.minTenths,
          estMaxTenths: s.maxTenths,
          actualTenths: null,
          flags: [],
        })),
      ),
    );
  }
  return {
    request: { id: request.id, projectName: request.projectName, outcome: request.outcome },
    canRecord: canRecordActuals(actor, request.outcome),
    estimate,
    rows,
    latest: latest
      ? {
          number: latest.number,
          source: latest.source,
          createdBy: latest.createdBy.name,
          createdAt: latest.createdAt,
        }
      : null,
    history: versions.map((v) => ({
      id: v.id,
      number: v.number,
      source: v.source,
      fileName: v.fileName,
      createdBy: v.createdBy.name,
      createdAt: v.createdAt,
    })),
    report: latest ? buildReport(rows) : null,
  };
}

/** Latest actual total per request ("· actual N"), for lists. */
export async function latestActualTotals(requestIds: string[]): Promise<Map<string, number>> {
  if (requestIds.length === 0) return new Map();
  const db = getDb();
  const versions = await db.actualsVersion.findMany({
    where: { requestId: { in: requestIds } },
    orderBy: { number: "desc" },
    select: { id: true, requestId: true },
  });
  const latest = new Map<string, string>();
  for (const v of versions) if (!latest.has(v.requestId)) latest.set(v.requestId, v.id);
  const sums = await db.actualHours.groupBy({
    by: ["versionId"],
    where: { versionId: { in: [...latest.values()] }, status: { not: "DROPPED" } },
    _sum: { actualTenths: true },
  });
  const byVersion = new Map(sums.map((s) => [s.versionId, (s._sum.actualTenths ?? 0) / 10]));
  return new Map([...latest.entries()].map(([req, ver]) => [req, byVersion.get(ver) ?? 0]));
}

// ---------- saving ----------

type NewRow = Omit<Prisma.ActualHoursCreateManyInput, "versionId">;

async function createVersion(
  tx: Tx,
  actor: CurrentUser,
  requestId: string,
  rows: NewRow[],
  file?: { fileName: string; bytes: Uint8Array; fingerprint: string },
) {
  const last = await tx.actualsVersion.findFirst({
    where: { requestId },
    orderBy: { number: "desc" },
  });
  const version = await tx.actualsVersion.create({
    data: {
      requestId,
      number: (last?.number ?? 0) + 1,
      source: file ? "FILE" : "MANUAL",
      fileName: file?.fileName,
      fileBytes: file ? Buffer.from(file.bytes) : undefined,
      fingerprint: file?.fingerprint,
      createdById: actor.id,
    },
  });
  if (rows.length)
    await tx.actualHours.createMany({ data: rows.map((r) => ({ ...r, versionId: version.id })) });
  return version;
}

function checkHours(value: number, field: string) {
  if (!hoursSchema.safeParse(value).success)
    throw new ServiceError(HOURS_MESSAGE, 400, { [field]: HOURS_MESSAGE });
}

export type ManualInput = {
  rows: {
    subTaskId?: string;
    unplanned?: { requestPartId: string; taskTitle: string; title: string };
    actual: number | null;
  }[];
};

/** Saves actual hours typed in the tool as a new version. Estimated Sub tasks left empty are Dropped. */
export async function saveManualVersion(actor: CurrentUser | null, id: string, input: ManualInput) {
  assertAccess(actor);
  return getDb().$transaction(async (tx) => {
    const request = await loadRequest(tx, id);
    assertCanRecord(actor, request.outcome);
    const estimate = await estimateParts(tx, id);
    const given = new Map(
      input.rows.filter((r) => r.subTaskId).map((r) => [r.subTaskId!, r.actual]),
    );
    const rows: NewRow[] = [];
    let position = 0;
    for (const part of estimate) {
      for (const task of part.tasks) {
        for (const sub of task.subTasks) {
          const actual = given.get(sub.id) ?? null;
          if (actual !== null) checkHours(actual, sub.id);
          rows.push({
            subTaskId: sub.id,
            requestPartId: part.partId,
            partLabel: part.label,
            taskTitle: task.title,
            title: sub.title,
            estMinTenths: sub.minTenths,
            estMaxTenths: sub.maxTenths,
            actualTenths: actual === null ? null : toTenths(actual),
            status: actual === null ? "DROPPED" : "MATCHED",
            flags: [],
            position: position++,
          });
        }
      }
      for (const u of input.rows.filter((r) => r.unplanned?.requestPartId === part.partId)) {
        const title = u.unplanned!.title.trim();
        if (!title) throw new ServiceError("Enter a title for each unplanned row", 400);
        if (u.actual === null) throw new ServiceError(`Enter the actual hours for "${title}"`, 400);
        checkHours(u.actual, title);
        rows.push({
          subTaskId: null,
          requestPartId: part.partId,
          partLabel: part.label,
          taskTitle: u.unplanned!.taskTitle.trim() || "Unplanned work",
          title,
          actualTenths: toTenths(u.actual),
          status: "UNPLANNED",
          flags: [],
          position: position++,
        });
      }
    }
    return createVersion(tx, actor, id, rows);
  });
}

// ---------- uploads ----------

type StoredParse = {
  sheets: FileSheet[];
  warnings: { sheet?: string; row?: number; cell?: string; message: string }[];
};

export async function createPendingUpload(
  actor: CurrentUser | null,
  id: string,
  file: { fileName: string; bytes: Uint8Array },
) {
  assertAccess(actor);
  const db = getDb();
  const request = await loadRequest(db, id);
  assertCanRecord(actor, request.outcome);
  if (!/\.xlsx$/i.test(file.fileName))
    throw new ServiceError("Upload the estimate as an .xlsx file", 400);
  if (file.bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new ServiceError("The file is larger than 10 MB", 400);
  if (file.bytes.byteLength === 0) throw new ServiceError("The file is empty", 400);

  const parsed = await parseEstimateFile(Buffer.from(file.bytes), file.fileName);
  if (!parsed.ok) throw new ServiceError(parsed.error, 400);
  const stored: StoredParse = {
    sheets: parsed.sheets
      .filter((s) => s.status === "ok")
      .map((s) => ({
        name: s.name,
        kind: s.kind,
        tasks: s.tasks.map((t) => ({
          title: t.title,
          subTasks: t.subTasks.map(({ title, min, max, actual, row }) => ({
            title,
            min,
            max,
            actual,
            row,
          })),
        })),
      })),
    warnings: parsed.warnings,
  };

  await db.actualsUpload.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const upload = await db.actualsUpload.create({
    data: {
      requestId: id,
      fileName: file.fileName,
      fileBytes: Buffer.from(file.bytes),
      fingerprint: parsed.fingerprint,
      parsed: stored as unknown as Prisma.InputJsonValue,
      createdById: actor.id,
      expiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
    },
  });
  return { uploadId: upload.id };
}

async function loadUpload(db: Tx | ReturnType<typeof getDb>, id: string, uploadId: string) {
  const upload = await db.actualsUpload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.requestId !== id || upload.expiresAt < new Date()) {
    throw new ServiceError("This upload has expired or doesn't exist. Upload the file again.", 404);
  }
  return upload;
}

export type UploadPreview = {
  fileName: string;
  sheets: FileSheet[];
  match: MatchResult;
  warnings: StoredParse["warnings"];
  estimate: EstimatePart[];
};

export async function previewUpload(
  actor: CurrentUser | null,
  id: string,
  uploadId: string,
  decisions: MatchDecisions = {},
): Promise<UploadPreview> {
  assertAccess(actor);
  const db = getDb();
  const request = await loadRequest(db, id);
  assertCanRecord(actor, request.outcome);
  const upload = await loadUpload(db, id, uploadId);
  const parsed = upload.parsed as unknown as StoredParse;
  const estimate = await estimateParts(db, id);
  return {
    fileName: upload.fileName,
    sheets: parsed.sheets,
    match: matchActuals(estimate, parsed.sheets, decisions),
    warnings: parsed.warnings,
    estimate,
  };
}

export async function saveUploadVersion(
  actor: CurrentUser | null,
  id: string,
  uploadId: string,
  decisions: MatchDecisions = {},
) {
  assertAccess(actor);
  for (const [key, value] of Object.entries(decisions.hours ?? {})) checkHours(value, key);
  return getDb().$transaction(async (tx) => {
    const request = await loadRequest(tx, id);
    assertCanRecord(actor, request.outcome);
    const upload = await loadUpload(tx, id, uploadId);
    const parsed = upload.parsed as unknown as StoredParse;
    const match = matchActuals(await estimateParts(tx, id), parsed.sheets, decisions);
    if (match.sheets.some((s) => s.needsAssignment)) {
      throw new ServiceError("Choose a part (or Skip) for every sheet first", 400);
    }
    const rows: NewRow[] = match.rows.map((r, position) => ({
      subTaskId: r.subTaskId,
      requestPartId: r.partId,
      partLabel: r.partLabel,
      taskTitle: r.taskTitle,
      title: r.title,
      estMinTenths: r.estMinTenths,
      estMaxTenths: r.estMaxTenths,
      actualTenths: r.actual === null ? null : toTenths(r.actual),
      status: r.status,
      similarity: r.similarity,
      flags: r.flags,
      sourceSheet: r.sourceSheet,
      sourceRow: r.sourceRow,
      position,
    }));
    const version = await createVersion(tx, actor, id, rows, {
      fileName: upload.fileName,
      bytes: upload.fileBytes,
      fingerprint: upload.fingerprint,
    });
    await tx.actualsUpload.delete({ where: { id: uploadId } });
    return version;
  });
}

export async function discardUpload(actor: CurrentUser | null, id: string, uploadId: string) {
  assertAccess(actor);
  await getDb().actualsUpload.deleteMany({ where: { id: uploadId, requestId: id } });
}

export async function getVersionFile(actor: CurrentUser | null, id: string, versionId: string) {
  assertAccess(actor);
  const version = await getDb().actualsVersion.findUnique({ where: { id: versionId } });
  if (!version || version.requestId !== id || !version.fileBytes)
    throw new ServiceError("File not found", 404);
  return { fileName: version.fileName ?? "actuals.xlsx", bytes: version.fileBytes };
}
