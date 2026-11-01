// Loads a request's estimate as an approved snapshot (specs/estimate-review "Approve"). No
// "server-only" import: the backfill script and the seed use it with their own Prisma client.
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { PART_LABELS, PART_VALUES, type Part } from "../../lib/estimation/options";
import { buildSnapshot, type ApprovedSnapshot } from "../../lib/review/snapshot";

type Db = PrismaClient | Prisma.TransactionClient;

/** "Backend (Node.js, Python)": the development sheet's name before Excel's limits. */
export function partLabel(part: Part, technologies: string[]): string {
  return technologies.length
    ? `${PART_LABELS[part]} (${technologies.join(", ")})`
    : PART_LABELS[part];
}

export async function loadSnapshot(db: Db, requestId: string): Promise<ApprovedSnapshot> {
  const request = await db.estimationRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      client: true,
      features: { orderBy: { position: "asc" } },
      parts: {
        include: {
          technologies: { include: { technology: true } },
          tasks: { include: { subTasks: { orderBy: { position: "asc" } } } },
        },
      },
    },
  });
  const featureOrder = new Map(request.features.map((f, i) => [f.id, i]));
  const featureName = new Map(request.features.map((f) => [f.id, f.name]));
  return buildSnapshot(request.version, {
    projectName: request.projectName,
    clientName: request.client?.name ?? null,
    overheads: {
      qaEnabled: request.qaEnabled,
      qaPercent: request.qaPercent,
      pmEnabled: request.pmEnabled,
      pmPercent: request.pmPercent,
      bugFixPercent: request.bugFixPercent,
      hourlyRate: request.hourlyRate,
    },
    parts: [...request.parts]
      .sort((a, b) => PART_VALUES.indexOf(a.part) - PART_VALUES.indexOf(b.part))
      .map((p) => ({
        part: p.part,
        label: partLabel(
          p.part,
          p.technologies.map((t) => t.technology.name).sort((a, b) => a.localeCompare(b)),
        ),
        deploymentMin: p.deploymentMinTenths / 10,
        deploymentMax: p.deploymentMaxTenths / 10,
        tasks: [...p.tasks]
          .sort(
            (a, b) => (featureOrder.get(a.featureId) ?? 0) - (featureOrder.get(b.featureId) ?? 0),
          )
          .map((t) => ({
            featureName: featureName.get(t.featureId) ?? "",
            subTasks: t.subTasks.map((s) => ({
              title: s.title,
              min: s.minTenths / 10,
              max: s.maxTenths / 10,
              comment: s.comment,
              ...(s.sourceSheet ? { source: `${s.sourceSheet}, row ${s.sourceRow}` } : {}),
            })),
          })),
      })),
  });
}

/**
 * Stores the approved version of a request as it is now and records the status change. Used by
 * Approve, by import approval and by the backfill, so all three store the same shape.
 */
export async function storeApprovedVersion(
  db: Db,
  requestId: string,
  approvedById: string,
  history: { fromStatus: "IN_REVIEW" | null; comment?: string; at?: Date },
) {
  const snapshot = await loadSnapshot(db, requestId);
  const at = history.at ?? new Date();
  await db.approvedVersion.create({
    data: {
      requestId,
      version: snapshot.version,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      approvedById,
      approvedAt: at,
    },
  });
  await db.statusChange.create({
    data: {
      requestId,
      fromStatus: history.fromStatus,
      toStatus: "APPROVED",
      version: snapshot.version,
      actorId: approvedById,
      comment: history.comment ?? null,
      createdAt: at,
    },
  });
  return snapshot;
}

/**
 * Approved requests from before the review workflow (imports, sample data) get their approved
 * version from their current data. Idempotent: requests that have one are left alone.
 */
export async function backfillApproved(db: PrismaClient): Promise<number> {
  const missing = await db.estimationRequest.findMany({
    where: { status: { in: ["APPROVED", "EXPORTED"] }, approved: { none: {} } },
    select: {
      id: true,
      ownerId: true,
      origin: true,
      updatedAt: true,
      importedFrom: { where: { status: "APPROVED" }, take: 1, select: { decidedById: true } },
    },
  });
  for (const request of missing) {
    await db.$transaction((tx) =>
      storeApprovedVersion(
        tx,
        request.id,
        request.importedFrom[0]?.decidedById ?? request.ownerId,
        {
          fromStatus: null,
          comment:
            request.origin === "IMPORTED"
              ? "Approved (imported)"
              : "Approved before the review workflow",
          at: request.updatedAt,
        },
      ),
    );
  }
  return missing.length;
}
