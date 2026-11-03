import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Proposal } from "@/lib/documents/proposal";
import { buildReview, SelectionSchema, type Review } from "@/lib/documents/review";
import { PART_LABELS, PART_VALUES, type NfrKey, type Part } from "@/lib/estimation/options";
import { fieldErrors, readConsiderations } from "@/lib/estimation/schemas";
import { logger } from "@/lib/logger";
import type { CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { canEditRequest, loadForEdit, syncTasks, upsertClient } from "@/server/estimation-requests";
import { computeSuggestions, fillHours, type FilledHours } from "@/server/matching/matching";
import { assertAccess, ServiceError } from "@/server/service-error";
import { effectiveStatus } from "./files";

// The review of a document and "Add to request" (specs/requirement-documents "Review before
// adding", "Add to request", "After adding").

type Tx = Prisma.TransactionClient;

export type DocumentReview = {
  document: {
    id: string;
    requestId: string;
    fileName: string;
    format: "PDF" | "DOCX";
    status: "READING" | "READY" | "FAILED" | "NOT_SET_UP";
    error: string | null;
    addedAt: Date | null;
  };
  projectName: string;
  canEdit: boolean;
  review: Review | null;
};

export async function getDocumentReview(
  actor: CurrentUser | null,
  requestId: string,
  documentId: string,
): Promise<DocumentReview> {
  assertAccess(actor);
  const db = getDb();
  const doc = await db.requestDocument.findFirst({
    where: { id: documentId, requestId },
    select: {
      id: true,
      requestId: true,
      fileName: true,
      format: true,
      status: true,
      error: true,
      readStartedAt: true,
      addedAt: true,
      proposal: true,
      addedItemIds: true,
      addedFeatures: true,
    },
  });
  if (!doc) throw new ServiceError("Document not found", 404);
  const request = await db.estimationRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      client: true,
      parts: { include: { technologies: true } },
      features: { select: { id: true, name: true } },
    },
  });
  const stuck = effectiveStatus(doc);
  const status = stuck?.status ?? doc.status;
  let review: Review | null = null;
  if (status === "READY" && doc.proposal) {
    const considerations = readConsiderations(request.considerations);
    const catalog = await db.technology.findMany({
      where: { retiredAt: null },
      select: { id: true, name: true, parts: true },
    });
    review = buildReview(
      doc.proposal as unknown as Proposal,
      {
        projectName: request.projectName,
        clientName: request.client?.name ?? null,
        lists: {
          applicationTypes: request.applicationTypes,
          operatingSystems: request.operatingSystems,
          browsers: request.browsers,
          hosting: considerations.hosting,
          environments: considerations.environments,
          appStores: considerations.appStores,
          compliance: considerations.compliance,
        },
        nfr: considerations.nfr,
        parts: request.parts.map((p) => ({
          part: p.part,
          technologyIds: p.technologies.map((t) => t.technologyId),
        })),
        featureNames: request.features.map((f) => f.name),
        featureIds: request.features.map((f) => f.id),
      },
      catalog,
      doc.addedItemIds,
      readAddedFeatures(doc.addedFeatures),
    );
  }
  return {
    document: {
      id: doc.id,
      requestId: doc.requestId,
      fileName: doc.fileName,
      format: doc.format,
      status,
      error: stuck?.error ?? doc.error,
      addedAt: doc.addedAt,
    },
    projectName: request.projectName,
    canEdit: actor ? canEditRequest(actor, request) : false,
    review,
  };
}

/** The stored item -> feature map; anything unreadable counts as none. */
function readAddedFeatures(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
}

const union = <T>(a: readonly T[], b: readonly T[] | undefined) => [
  ...new Set([...a, ...(b ?? [])]),
];

async function ensurePart(tx: Tx, requestId: string, part: Part) {
  return tx.requestPart.upsert({
    where: { requestId_part: { requestId, part } },
    create: { requestId, part },
    update: {},
  });
}

/**
 * Adds the ticked items in one transaction, then matches the new Tasks. Returns how many of each
 * were added.
 */
export async function applyDocument(
  actor: CurrentUser | null,
  requestId: string,
  documentId: string,
  input: unknown,
) {
  assertAccess(actor, "estimate.edit");
  const parsed = SelectionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServiceError(
      parsed.error.issues[0]?.message ?? "Check the items",
      400,
      fieldErrors(parsed.error),
    );
  }
  const s = parsed.data;
  const db = getDb();

  const result = await db.$transaction(async (tx) => {
    const request = await loadForEdit(tx, actor, requestId);
    const doc = await tx.requestDocument.findFirst({
      where: { id: documentId, requestId },
      select: {
        id: true,
        status: true,
        addedItemIds: true,
        addedFeatures: true,
        fileName: true,
      },
    });
    if (!doc) throw new ServiceError("Document not found", 404);
    if (doc.status !== "READY") throw new ServiceError("This document isn't ready to review", 409);

    // Step 1
    const step1: Prisma.EstimationRequestUpdateInput = {};
    if (s.projectName) step1.projectName = s.projectName;
    if (s.client) {
      const clientId = await upsertClient(tx, s.client);
      if (clientId) step1.client = { connect: { id: clientId } };
    }

    // Step 2: lists, then parts the features and part rows need.
    const lists = s.lists;
    step1.applicationTypes = union(request.applicationTypes, lists.applicationTypes);
    step1.operatingSystems = union(request.operatingSystems, lists.operatingSystems);
    step1.browsers = union(request.browsers, lists.browsers);

    const neededParts = PART_VALUES.filter(
      (p) =>
        s.features.some((f) => f.parts.includes(p)) ||
        s.parts.some((r) => r.part === p) ||
        s.assumptions.some((a) => a.part === p) ||
        s.risks.some((r) => r.part === p),
    );
    const partRows = new Map<Part, { id: string; assumptions: string[]; risks: string[] }>();
    for (const part of neededParts) {
      const row = await ensurePart(tx, requestId, part);
      partRows.set(part, row);
    }

    // Technologies: active catalog entries for the part only.
    const notes: string[] = [];
    for (const choice of s.parts) {
      const row = partRows.get(choice.part)!;
      if (choice.technologyIds.length) {
        const offered = await tx.technology.findMany({
          where: { id: { in: choice.technologyIds }, retiredAt: null, parts: { has: choice.part } },
          select: { id: true },
        });
        await tx.requestPartTechnology.createMany({
          data: offered.map((t) => ({ requestPartId: row.id, technologyId: t.id })),
          skipDuplicates: true,
        });
      }
      if (choice.note) notes.push(`${PART_LABELS[choice.part]}: ${choice.note}`);
    }

    // Step 3
    const current = readConsiderations(request.considerations);
    const nfr = { ...current.nfr };
    for (const n of s.nfr) {
      const existingNote = nfr[n.area]?.note ?? "";
      nfr[n.area as NfrKey] = {
        enabled: true,
        note: [existingNote, n.note].filter(Boolean).join("; ").slice(0, 500),
      };
    }
    const other = [current.other, ...notes.filter((n) => !current.other.includes(n))]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000);
    step1.considerations = {
      ...current,
      hosting: union(current.hosting, lists.hosting),
      environments: union(current.environments, lists.environments),
      appStores: union(current.appStores, lists.appStores),
      compliance: union(current.compliance, lists.compliance),
      nfr,
      other,
    };
    await tx.estimationRequest.update({ where: { id: requestId }, data: step1 });

    // Assumptions and risks per part, skipping exact repeats.
    for (const part of neededParts) {
      const row = partRows.get(part)!;
      const assumptions = union(
        row.assumptions,
        s.assumptions.filter((a) => a.part === part).map((a) => a.text),
      );
      const risks = union(
        row.risks,
        s.risks.filter((r) => r.part === part).map((r) => r.text),
      );
      if (assumptions.length !== row.assumptions.length || risks.length !== row.risks.length) {
        await tx.requestPart.update({ where: { id: row.id }, data: { assumptions, risks } });
      }
    }

    // Features at the end of the list.
    const last = await tx.feature.aggregate({ where: { requestId }, _max: { position: true } });
    let position = (last._max.position ?? -1) + 1;
    const featureIds: string[] = [];
    const addedFeatures = readAddedFeatures(doc.addedFeatures);
    for (const f of s.features) {
      const created = await tx.feature.create({
        data: {
          requestId,
          name: f.name,
          description: f.description || null,
          parts: f.parts,
          position: position++,
        },
        select: { id: true },
      });
      featureIds.push(created.id);
      for (const itemId of f.itemIds) addedFeatures[itemId] = created.id;
    }

    // Client questions.
    const lastQ = await tx.clientQuestion.aggregate({
      where: { requestId },
      _max: { position: true },
    });
    let qPosition = (lastQ._max.position ?? -1) + 1;
    for (const q of s.questions) {
      await tx.clientQuestion.create({
        data: {
          requestId,
          text: q.text,
          position: qPosition++,
          source: q.source ? { documentId, fileName: doc.fileName, ...q.source } : undefined,
          createdById: actor.id,
        },
      });
    }

    await tx.requestDocument.update({
      where: { id: documentId },
      data: {
        addedItemIds: union(doc.addedItemIds, s.itemIds),
        addedFeatures,
        addedAt: new Date(),
        addedById: actor.id,
      },
    });
    await syncTasks(tx, requestId);
    const tasks = await tx.estimateTask.findMany({
      where: { featureId: { in: featureIds } },
      select: { id: true },
    });
    return {
      taskIds: tasks.map((t) => t.id),
      counts: {
        features: s.features.length,
        details:
          Number(!!s.projectName) +
          Number(!!s.client) +
          Object.values(s.lists).filter((v) => v?.length).length +
          s.parts.length +
          s.nfr.length,
        assumptions: s.assumptions.length,
        risks: s.risks.length,
        questions: s.questions.length,
      },
    };
  });

  // New features are matched and their hours filled in at once: a reliable match's hours, or
  // else an AI guess. A failure leaves them added without hours (Find matches still works).
  let hours: FilledHours = { matched: 0, guessed: 0, empty: result.taskIds.length };
  if (result.taskIds.length) {
    try {
      await computeSuggestions(requestId, result.taskIds);
      hours = await fillHours(actor.id, requestId, result.taskIds);
    } catch (err) {
      logger.error("matching after adding document items failed", { requestId, err });
    }
  }
  return { ...result.counts, hours };
}
