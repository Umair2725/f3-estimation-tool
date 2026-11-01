import "server-only";
import JSZip from "jszip";
import type { CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { matchActuals, type EstimatePart, type FileSheet } from "@/lib/actuals/match";
import { nameKey, type Part } from "@/lib/estimation/options";
import { groupZipEntries, MAX_XLSX_BYTES, type ProjectFiles } from "@/lib/import/group";
import {
  buildPreview,
  type ImportDecisions,
  type ImportPreview,
  type StoredParse,
} from "@/lib/import/preview";
import { readDefaults } from "../estimate-defaults";
import { parseEstimateFile } from "../estimate-parser";
import { assertAccess, ServiceError } from "../service-error";
import { reindexRequestSoftly } from "../matching/hooks";
import { storeApprovedVersion } from "../review/snapshot-source";

// Historical import (specs/historical-import): Admins upload past estimates (with actuals for
// delivered projects), check a preview per project, and approve them into read-only historical
// requests. Files are identified by content; nothing is created until a person approves.

export const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 300 * 1024 * 1024;
export const MAX_PROJECTS = 150;
export const DUPLICATE_CHOICE_MESSAGE = "Choose what to do with the duplicate first";

type Tx = Prisma.TransactionClient;
type Db = Tx | ReturnType<typeof getDb>;
type Upload = { fileName: string; bytes: Uint8Array };
export type Duplicate =
  | { kind: "same-file"; requestId: string; projectName: string }
  | { kind: "newer-version"; requestId: string; projectName: string };

function assertAdmin(actor: CurrentUser | null): asserts actor is CurrentUser {
  assertAccess(actor, "settings.manage");
}

/** The parts of a parse result the import keeps (no bytes, no per-sheet details it doesn't use). */
async function parseForImport(file: Upload): Promise<StoredParse | { error: string }> {
  const parsed = await parseEstimateFile(Buffer.from(file.bytes), file.fileName);
  if (!parsed.ok) return { error: parsed.error };
  return {
    fingerprint: parsed.fingerprint,
    templateVersion: parsed.templateVersion,
    summary: {
      projectName: parsed.summary.projectName,
      clientName: parsed.summary.clientName,
      projectManager: parsed.summary.projectManager,
      date: parsed.summary.date,
      qaPercent: parsed.summary.qaPercent,
      pmPercent: parsed.summary.pmPercent,
    },
    sheets: parsed.sheets.map((s) => ({
      name: s.name,
      kind: s.kind,
      status: s.status,
      stack: s.stack,
      bugFixPercent: s.bugFixPercent,
      tasks: s.tasks.map((t) => ({
        title: t.title,
        row: t.row,
        research: t.research,
        subTasks: t.subTasks.map(({ title, min, max, comment, row, actual }) => ({
          title,
          min,
          max,
          comment,
          row,
          actual,
        })),
      })),
    })),
    warnings: parsed.warnings,
  };
}

/** "Already imported" or "possibly a newer version" (specs/historical-import). */
export async function findDuplicate(
  db: Db,
  fingerprint: string,
  projectName: string,
  clientName: string,
  excludeProjectId?: string,
): Promise<Duplicate | null> {
  const sameFile = await db.importedProject.findFirst({
    where: {
      status: "APPROVED",
      id: excludeProjectId ? { not: excludeProjectId } : undefined,
      estimateFile: { fingerprint },
      requestId: { not: null },
    },
    include: { request: { select: { id: true, projectName: true } } },
  });
  if (sameFile?.request) {
    return {
      kind: "same-file",
      requestId: sameFile.request.id,
      projectName: sameFile.request.projectName,
    };
  }
  if (!projectName.trim()) return null;
  const imported = await db.estimationRequest.findMany({
    where: { origin: "IMPORTED" },
    select: { id: true, projectName: true, client: { select: { name: true } } },
  });
  const match = imported.find(
    (r) =>
      nameKey(r.projectName) === nameKey(projectName) &&
      nameKey(r.client?.name ?? "") === nameKey(clientName),
  );
  return match
    ? { kind: "newer-version", requestId: match.id, projectName: match.projectName }
    : null;
}

// ---------- upload ----------

export type UploadInput =
  { kind: "zip"; file: Upload } | { kind: "single"; estimate: Upload; actuals?: Upload | null };

type Collected = {
  folder: string;
  estimate: Upload | null;
  actuals: Upload | null;
  failure: string | null;
};

async function readZip(file: Upload): Promise<{ projects: Collected[]; notes: string[] }> {
  if (file.bytes.byteLength > MAX_ZIP_BYTES)
    throw new ServiceError("The zip is larger than 100 MB", 400);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file.bytes);
  } catch {
    throw new ServiceError("This file isn't a readable zip", 400);
  }
  const files = Object.values(zip.files).filter((f) => !f.dir);
  const size = (f: JSZip.JSZipObject) =>
    (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  if (files.reduce((s, f) => s + size(f), 0) > MAX_UNZIPPED_BYTES) {
    throw new ServiceError(
      "The zip unpacks to more than 300 MB; split it into smaller batches",
      400,
    );
  }
  const { projects, notes } = groupZipEntries(files.map((f) => ({ path: f.name, size: size(f) })));
  if (projects.length > MAX_PROJECTS) {
    throw new ServiceError(`A batch can hold at most ${MAX_PROJECTS} projects`, 400);
  }
  const read = async (path: string | null): Promise<Upload | null> => {
    if (!path) return null;
    const bytes = await zip.file(path)!.async("uint8array");
    return { fileName: path.split("/").at(-1)!, bytes };
  };
  const collected: Collected[] = [];
  for (const p of projects as ProjectFiles[]) {
    collected.push({
      folder: p.folder,
      estimate: p.failure ? null : await read(p.estimatePath),
      actuals: p.failure ? null : await read(p.actualsPath),
      failure: p.failure,
    });
  }
  return { projects: collected, notes };
}

export async function createBatch(actor: CurrentUser | null, input: UploadInput) {
  assertAdmin(actor);
  let collected: Collected[];
  let notes: string[] = [];
  let sourceName: string;
  if (input.kind === "zip") {
    if (!/\.zip$/i.test(input.file.fileName)) throw new ServiceError("Upload a .zip file", 400);
    ({ projects: collected, notes } = await readZip(input.file));
    sourceName = input.file.fileName;
    if (collected.length === 0) throw new ServiceError("The zip has no .xlsx files to import", 400);
  } else {
    for (const f of [input.estimate, input.actuals].filter(Boolean) as Upload[]) {
      if (!/\.xlsx$/i.test(f.fileName))
        throw new ServiceError("Upload estimates as .xlsx files", 400);
      if (f.bytes.byteLength > MAX_XLSX_BYTES)
        throw new ServiceError(`${f.fileName} is larger than 10 MB`, 400);
    }
    collected = [
      {
        folder: input.estimate.fileName.replace(/\.xlsx$/i, ""),
        estimate: input.estimate,
        actuals: input.actuals ?? null,
        failure: null,
      },
    ];
    sourceName = input.estimate.fileName;
  }

  const db = getDb();
  const batch = await db.importBatch.create({ data: { sourceName, notes, createdById: actor.id } });
  for (const [position, project] of collected.entries()) {
    await addProject(db, actor, batch.id, position, project);
  }
  return { batchId: batch.id };
}

async function addProject(
  db: Db,
  actor: CurrentUser,
  batchId: string,
  position: number,
  p: Collected,
) {
  const base = { batchId, folder: p.folder, position };
  if (p.failure || !p.estimate) {
    await db.importedProject.create({
      data: { ...base, status: "FAILED", failure: p.failure ?? "No estimate file" },
    });
    return;
  }
  const estimate = await parseForImport(p.estimate);
  if ("error" in estimate) {
    await db.importedProject.create({
      data: { ...base, status: "FAILED", failure: `${p.estimate.fileName}: ${estimate.error}` },
    });
    return;
  }
  const actuals = p.actuals ? await parseForImport(p.actuals) : null;
  if (actuals && "error" in actuals) {
    await db.importedProject.create({
      data: { ...base, status: "FAILED", failure: `${p.actuals!.fileName}: ${actuals.error}` },
    });
    return;
  }
  const store = (file: Upload, kind: "ESTIMATE" | "ACTUALS", fingerprint: string) =>
    db.uploadedFile.create({
      data: {
        fileName: file.fileName,
        bytes: Buffer.from(file.bytes),
        fingerprint,
        kind,
        uploadedById: actor.id,
      },
    });
  const estimateFile = await store(p.estimate, "ESTIMATE", estimate.fingerprint);
  const actualsFile =
    p.actuals && actuals ? await store(p.actuals, "ACTUALS", actuals.fingerprint) : null;
  const duplicate = await findDuplicate(
    db,
    estimate.fingerprint,
    estimate.summary.projectName ?? "",
    estimate.summary.clientName ?? "",
  );
  await db.importedProject.create({
    data: {
      ...base,
      status: "READY",
      estimateFileId: estimateFile.id,
      actualsFileId: actualsFile?.id,
      parsed: estimate as unknown as Prisma.InputJsonValue,
      actualsParsed: (actuals ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
      duplicate: (duplicate ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
    },
  });
}

// ---------- reading ----------

type ProjectRow = Awaited<ReturnType<typeof loadProject>>;

async function loadProject(db: Db, projectId: string) {
  const project = await db.importedProject.findUnique({
    where: { id: projectId },
    include: {
      batch: { include: { createdBy: { select: { name: true } } } },
      estimateFile: { select: { id: true, fileName: true } },
      actualsFile: { select: { id: true, fileName: true } },
      request: { select: { id: true, projectName: true } },
      decidedBy: { select: { name: true } },
    },
  });
  if (!project) throw new ServiceError("Imported project not found", 404);
  return project;
}

/** The estimate and actuals parses, after an optional swap of the two files. */
function effective(
  project: Pick<ProjectRow, "parsed" | "actualsParsed" | "estimateFileId" | "actualsFileId">,
  decisions: ImportDecisions,
) {
  const parsed = project.parsed as unknown as StoredParse | null;
  const actuals = project.actualsParsed as unknown as StoredParse | null;
  if (decisions.swapFiles && actuals && parsed) {
    return {
      estimate: actuals,
      actuals: parsed,
      estimateFileId: project.actualsFileId,
      actualsFileId: project.estimateFileId,
    };
  }
  return {
    estimate: parsed,
    actuals,
    estimateFileId: project.estimateFileId,
    actualsFileId: project.actualsFileId,
  };
}

/** The estimate parts as the actuals matcher sees them, with Sub task ids from the preview keys. */
function previewParts(preview: ImportPreview): EstimatePart[] {
  const parts = new Map<Part, EstimatePart>();
  for (const sheet of preview.sheets) {
    if (sheet.skipped || !sheet.part) continue;
    const part = parts.get(sheet.part) ?? {
      partId: sheet.part,
      kind: sheet.part,
      label: sheet.label ?? sheet.part,
      tasks: [],
    };
    for (const t of sheet.tasks.filter((t) => !t.excluded)) {
      part.tasks.push({
        title: t.title,
        subTasks: t.subTasks
          .filter((s) => !s.excluded)
          .map((s) => ({
            id: s.key,
            title: s.title,
            minTenths: Math.round(s.min * 10),
            maxTenths: Math.round(s.max * 10),
          })),
      });
    }
    parts.set(sheet.part, part);
  }
  return [...parts.values()];
}

function actualsSheets(actuals: StoredParse): FileSheet[] {
  return actuals.sheets
    .filter((s) => s.status === "ok")
    .map((s) => ({
      name: s.name,
      kind: s.kind,
      tasks: s.tasks.map((t) => ({ title: t.title, subTasks: t.subTasks })),
    }));
}

/** Actual sheets inherit the part chosen for the estimate sheet of the same name, else their kind. */
function actualsSheetParts(
  actuals: StoredParse,
  preview: ImportPreview,
  partIdOf: (p: Part) => string | undefined,
) {
  const out: Record<string, string> = {};
  for (const s of actuals.sheets) {
    const same = preview.sheets.find((p) => p.name === s.name);
    const part =
      same?.part ?? (preview.sheets.some((p) => p.part === s.kind) ? (s.kind as Part) : null);
    const id = part ? partIdOf(part) : undefined;
    out[s.name] = id ?? "skip";
  }
  return out;
}

export async function getImportedProject(actor: CurrentUser | null, projectId: string) {
  assertAdmin(actor);
  const project = await loadProject(getDb(), projectId);
  const decisions = (project.decisions ?? {}) as ImportDecisions;
  const files = effective(project, decisions);
  const preview = files.estimate ? buildPreview(files.estimate, decisions) : null;
  const comparison =
    preview && files.actuals
      ? matchActuals(previewParts(preview), actualsSheets(files.actuals), {
          sheetParts: actualsSheetParts(files.actuals, preview, (p) => p),
        })
      : null;
  return {
    id: project.id,
    batchId: project.batchId,
    folder: project.folder,
    status: project.status,
    failure: project.failure,
    uploadedBy: project.batch.createdBy.name,
    uploadedAt: project.batch.createdAt,
    estimateFile: project.estimateFile,
    actualsFile: project.actualsFile,
    decisions,
    duplicate: project.duplicate as Duplicate | null,
    preview,
    templateVersion: files.estimate?.templateVersion ?? null,
    warnings: files.estimate?.warnings ?? [],
    comparison,
    request: project.request,
    decidedBy: project.decidedBy?.name ?? null,
    decidedAt: project.decidedAt,
  };
}

export async function listBatches(actor: CurrentUser | null) {
  assertAdmin(actor);
  const batches = await getDb().importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { createdBy: { select: { name: true } }, projects: { select: { status: true } } },
  });
  return batches.map((b) => ({
    id: b.id,
    sourceName: b.sourceName,
    createdBy: b.createdBy.name,
    createdAt: b.createdAt,
    counts: countStatuses(b.projects),
  }));
}

function countStatuses(projects: { status: string }[]) {
  const n = (s: string) => projects.filter((p) => p.status === s).length;
  return {
    imported: n("APPROVED"),
    skipped: n("SKIPPED"),
    rejected: n("REJECTED"),
    failed: n("FAILED"),
    waiting: n("READY"),
    total: projects.length,
  };
}

export async function getBatch(actor: CurrentUser | null, batchId: string) {
  assertAdmin(actor);
  const batch = await getDb().importBatch.findUnique({
    where: { id: batchId },
    include: {
      createdBy: { select: { name: true } },
      projects: {
        orderBy: { position: "asc" },
        include: { request: { select: { id: true } }, actualsFile: { select: { id: true } } },
      },
    },
  });
  if (!batch) throw new ServiceError("Import batch not found", 404);
  return {
    id: batch.id,
    sourceName: batch.sourceName,
    createdBy: batch.createdBy.name,
    createdAt: batch.createdAt,
    notes: batch.notes,
    counts: countStatuses(batch.projects),
    projects: batch.projects.map((p) => {
      const decisions = (p.decisions ?? {}) as ImportDecisions;
      const files = effective(p, decisions);
      const preview = files.estimate ? buildPreview(files.estimate, decisions) : null;
      return {
        id: p.id,
        folder: p.folder,
        status: p.status,
        failure: p.failure,
        projectName: preview?.projectName ?? "",
        clientName: preview?.clientName ?? "",
        hasActuals: !!p.actualsFile,
        subTasks: preview?.counts.subTasks ?? 0,
        warnings: files.estimate?.warnings.length ?? 0,
        duplicate: p.duplicate as Duplicate | null,
        duplicateChoice: decisions.duplicate ?? null,
        unassigned: preview?.unassigned.length ?? 0,
        requestId: p.request?.id ?? null,
      };
    }),
  };
}

// ---------- decisions ----------

export async function saveDecisions(
  actor: CurrentUser | null,
  projectId: string,
  decisions: ImportDecisions,
) {
  assertAdmin(actor);
  const db = getDb();
  const project = await loadProject(db, projectId);
  if (project.status !== "READY")
    throw new ServiceError("This project has already been decided", 409);
  if (decisions.swapFiles && !project.actualsFileId)
    throw new ServiceError("There's no actuals file to swap", 400);
  await db.importedProject.update({
    where: { id: projectId },
    data: { decisions: decisions as unknown as Prisma.InputJsonValue },
  });
}

export async function rejectProject(
  actor: CurrentUser | null,
  projectId: string,
  status: "REJECTED" | "SKIPPED" = "REJECTED",
) {
  assertAdmin(actor);
  const db = getDb();
  const project = await loadProject(db, projectId);
  if (project.status !== "READY")
    throw new ServiceError("This project has already been decided", 409);
  await db.importedProject.update({
    where: { id: projectId },
    data: { status, decidedById: actor.id, decidedAt: new Date() },
  });
}

/** Approves a project into a read-only historical request (specs/historical-import). */
export async function approveProject(actor: CurrentUser | null, projectId: string) {
  assertAdmin(actor);
  const result = await getDb().$transaction(
    async (tx) => {
      const project = await loadProject(tx, projectId);
      if (project.status !== "READY")
        throw new ServiceError("This project has already been decided", 409);
      const decisions = (project.decisions ?? {}) as ImportDecisions;
      const files = effective(project, decisions);
      if (!files.estimate || !files.estimateFileId)
        throw new ServiceError("This project has no readable estimate", 400);
      const preview = buildPreview(files.estimate, decisions);

      const duplicate = await findDuplicate(
        tx,
        files.estimate.fingerprint,
        preview.projectName,
        preview.clientName,
        projectId,
      );
      if (duplicate && !decisions.duplicate) throw new ServiceError(DUPLICATE_CHOICE_MESSAGE, 400);
      if (decisions.duplicate === "skip") {
        await tx.importedProject.update({
          where: { id: projectId },
          data: { status: "SKIPPED", decidedById: actor.id, decidedAt: new Date() },
        });
        return { status: "SKIPPED" as const, requestId: null };
      }
      if (preview.unassigned.length) {
        throw new ServiceError(
          `Choose a part (or Skip) for: ${preview.unassigned.join(", ")}`,
          400,
        );
      }
      if (preview.counts.subTasks === 0)
        throw new ServiceError("Nothing to import: every row is excluded or empty", 400);
      if (!preview.projectName) throw new ServiceError("Enter the project name", 400);

      const defaults = await readDefaults(tx);
      const clientId = preview.clientName
        ? (
            await tx.client.upsert({
              where: { nameKey: nameKey(preview.clientName) },
              create: { name: preview.clientName.trim(), nameKey: nameKey(preview.clientName) },
              update: {},
            })
          ).id
        : null;
      const bugFix = preview.sheets.find(
        (s) => !s.skipped && s.part && s.bugFixPercent !== null,
      )?.bugFixPercent;
      const request = await tx.estimationRequest.create({
        data: {
          projectName: preview.projectName,
          clientId,
          projectManager: preview.projectManager,
          projectDate: preview.dateIso ? new Date(preview.dateIso) : new Date(),
          ownerId: actor.id,
          status: "APPROVED",
          origin: "IMPORTED",
          baseline: "PRE_AI",
          lastStep: 4,
          qaEnabled: preview.qaPercent !== null,
          qaPercent:
            preview.qaPercent !== null ? Math.round(preview.qaPercent) : defaults.qaPercent,
          pmEnabled: preview.pmPercent !== null,
          pmPercent:
            preview.pmPercent !== null ? Math.round(preview.pmPercent) : defaults.pmPercent,
          bugFixPercent:
            bugFix !== undefined && bugFix !== null ? Math.round(bugFix) : defaults.bugFixPercent,
          rateConfirmed: false,
          outcome: files.actuals ? "DELIVERED" : "NONE",
          outcomeChangedAt: files.actuals ? new Date() : null,
          outcomeChangedById: files.actuals ? actor.id : null,
        },
      });

      // Parts, features (one per Task) and Sub tasks with their sources.
      const partIds = new Map<Part, string>();
      const subTaskIds = new Map<string, string>(); // preview key → SubTask id
      let featurePosition = 0;
      for (const sheet of preview.sheets) {
        if (sheet.skipped || !sheet.part) continue;
        let partId = partIds.get(sheet.part);
        if (!partId) {
          partId = (
            await tx.requestPart.create({ data: { requestId: request.id, part: sheet.part } })
          ).id;
          partIds.set(sheet.part, partId);
        }
        for (const task of sheet.tasks) {
          const subTasks = task.subTasks.filter((s) => !s.excluded);
          if (task.excluded || subTasks.length === 0) continue;
          const feature = await tx.feature.create({
            data: {
              requestId: request.id,
              name: task.title,
              parts: [sheet.part],
              position: featurePosition++,
            },
          });
          const estimateTask = await tx.estimateTask.create({
            data: { featureId: feature.id, requestPartId: partId },
          });
          for (const [position, s] of subTasks.entries()) {
            const created = await tx.subTask.create({
              data: {
                taskId: estimateTask.id,
                title: s.title,
                minTenths: Math.round(s.min * 10),
                maxTenths: Math.round(s.max * 10),
                comment: s.comment,
                position,
                sourceFileId: files.estimateFileId,
                sourceSheet: sheet.name,
                sourceRow: s.row,
              },
            });
            subTaskIds.set(s.key, created.id);
          }
        }
      }

      // Delivered projects: actual hours as version 1, matched like an actuals upload.
      if (files.actuals && files.actualsFileId) {
        const parts = previewParts(preview).map((p) => ({
          ...p,
          partId: partIds.get(p.kind as Part)!,
          tasks: p.tasks.map((t) => ({
            ...t,
            subTasks: t.subTasks
              .filter((s) => subTaskIds.has(s.id))
              .map((s) => ({ ...s, id: subTaskIds.get(s.id)! })),
          })),
        }));
        const match = matchActuals(parts, actualsSheets(files.actuals), {
          sheetParts: actualsSheetParts(files.actuals, preview, (p) => partIds.get(p)),
        });
        const actualsFile = await tx.uploadedFile.findUniqueOrThrow({
          where: { id: files.actualsFileId },
        });
        await tx.actualsVersion.create({
          data: {
            requestId: request.id,
            number: 1,
            source: "FILE",
            fileName: actualsFile.fileName,
            fileBytes: actualsFile.bytes,
            fingerprint: actualsFile.fingerprint,
            createdById: actor.id,
            rows: {
              create: match.rows.map((r, position) => ({
                subTaskId: r.subTaskId,
                requestPartId: r.partId,
                partLabel: r.partLabel,
                taskTitle: r.taskTitle,
                title: r.title,
                estMinTenths: r.estMinTenths,
                estMaxTenths: r.estMaxTenths,
                actualTenths: r.actual === null ? null : Math.round(r.actual * 10),
                status: r.status,
                similarity: r.similarity,
                flags: r.needsConfirmation
                  ? [...r.flags, "Matched by similarity at import"]
                  : r.flags,
                sourceSheet: r.sourceSheet,
                sourceRow: r.sourceRow,
                position,
              })),
            },
          },
        });
      }

      await tx.importedProject.update({
        where: { id: projectId },
        data: {
          status: "APPROVED",
          requestId: request.id,
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      // Its approved version 1 is the knowledge-base source (specs/estimate-review).
      await storeApprovedVersion(tx, request.id, actor.id, {
        fromStatus: null,
        comment: "Approved (imported)",
      });
      return { status: "APPROVED" as const, requestId: request.id };
    },
    { timeout: 60_000 },
  );
  if (result.requestId) await reindexRequestSoftly(result.requestId);
  return result;
}

// ---------- files ----------

/** Admins can download any imported file; anyone with a role can download a historical project's files. */
export async function getUploadedFile(actor: CurrentUser | null, fileId: string) {
  assertAccess(actor);
  const file = await getDb().uploadedFile.findUnique({
    where: { id: fileId },
    include: {
      estimateFor: { select: { requestId: true } },
      actualsFor: { select: { requestId: true } },
    },
  });
  if (!file) throw new ServiceError("File not found", 404);
  const historical = [...file.estimateFor, ...file.actualsFor].some((p) => p.requestId);
  if (!historical) assertAdmin(actor);
  return { fileName: file.fileName, bytes: file.bytes };
}
