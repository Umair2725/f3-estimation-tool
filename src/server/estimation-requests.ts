import "server-only";
import type { z } from "zod";
import type { CurrentUser } from "@/server/auth/access";
import { can } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { checkCompleteness, type MissingItem } from "@/lib/estimation/completeness";
import { computeTotals, formatRange } from "@/lib/estimation/totals";
import { PAGE_SIZE, type RequestFilters } from "@/lib/estimation/filters";
import {
  nameKey,
  PART_LABELS,
  PART_VALUES,
  type Part,
  type RequestStatus,
  type Step,
} from "@/lib/estimation/options";
import {
  fieldErrors,
  readConsiderations,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  type Considerations,
} from "@/lib/estimation/schemas";
import { readDefaults } from "./estimate-defaults";
import { assertAccess, ServiceError } from "./service-error";

// Estimation requests (specs/estimation-requests, specs/home-screen). Every function checks the
// caller itself: anyone with a role may view; the owner or an Admin may edit while the request
// is a Draft or Changes requested, and delete while it is a Draft.

export const EDIT_REFUSED = "Only the owner or an Admin can edit this request";
const EDITABLE: RequestStatus[] = ["DRAFT", "CHANGES_REQUESTED"];

type Tx = Prisma.TransactionClient;
type RequestOwnership = { ownerId: string; status: RequestStatus };

export function canEditRequest(actor: CurrentUser, request: RequestOwnership): boolean {
  const ownerOrAdmin = request.ownerId === actor.id || can(actor.role, "estimate.edit-any");
  return can(actor.role, "estimate.edit") && ownerOrAdmin && EDITABLE.includes(request.status);
}

export function canDeleteRequest(actor: CurrentUser, request: RequestOwnership): boolean {
  return canEditRequest(actor, request) && request.status === "DRAFT";
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    throw new ServiceError(Object.values(fields)[0] ?? "Check the form", 400, fields);
  }
  return parsed.data;
}

async function upsertClient(tx: Tx, name: string): Promise<string | null> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  const client = await tx.client.upsert({
    where: { nameKey: nameKey(trimmed) },
    create: { name: trimmed, nameKey: nameKey(trimmed) },
    update: {},
  });
  return client.id;
}

/** Loads a request for a change, refusing (404/403) before anything is written. */
export async function loadForEdit(tx: Tx, actor: CurrentUser, id: string) {
  const request = await tx.estimationRequest.findUnique({
    where: { id },
    include: { parts: { include: { technologies: true } }, features: true },
  });
  if (!request) throw new ServiceError("Request not found", 404);
  if (!canEditRequest(actor, request)) {
    const editable = EDITABLE.includes(request.status);
    throw new ServiceError(editable ? EDIT_REFUSED : "This request can no longer be edited", 403);
  }
  return request;
}

// ---------- create and save ----------

export async function createRequest(actor: CurrentUser | null, input: unknown) {
  assertAccess(actor, "estimate.edit");
  const step1 = parse(step1Schema, input);
  return getDb().$transaction(async (tx) => {
    const defaults = await readDefaults(tx);
    const request = await tx.estimationRequest.create({
      data: {
        projectName: step1.projectName,
        clientId: await upsertClient(tx, step1.clientName),
        projectManager: step1.projectManager || actor.name,
        projectDate: new Date(step1.projectDate),
        ownerId: actor.id,
        lastStep: 1,
        qaPercent: defaults.qaPercent,
        pmPercent: defaults.pmPercent,
        bugFixPercent: defaults.bugFixPercent,
        hourlyRate: defaults.defaultRate,
      },
    });
    return { id: request.id, savedAt: request.updatedAt };
  });
}

export async function saveStep(actor: CurrentUser | null, id: string, step: Step, input: unknown) {
  assertAccess(actor, "estimate.edit");
  return getDb().$transaction(async (tx) => {
    const request = await loadForEdit(tx, actor, id);
    if (step === 1) await saveProject(tx, id, input, actor);
    else if (step === 2) await savePlatforms(tx, request, input);
    else if (step === 3) {
      await tx.estimationRequest.update({
        where: { id },
        data: { considerations: parse(step3Schema, input) },
      });
    } else await saveFeatures(tx, request, input);
    if (step === 2 || step === 4) await syncTasks(tx, id);

    const saved = await tx.estimationRequest.update({ where: { id }, data: { lastStep: step } });
    return { savedAt: saved.updatedAt };
  });
}

async function saveProject(tx: Tx, id: string, input: unknown, actor: CurrentUser) {
  const step1 = parse(step1Schema, input);
  await tx.estimationRequest.update({
    where: { id },
    data: {
      projectName: step1.projectName,
      clientId: await upsertClient(tx, step1.clientName),
      projectManager: step1.projectManager || actor.name,
      projectDate: new Date(step1.projectDate),
    },
  });
}

type LoadedRequest = Awaited<ReturnType<typeof loadForEdit>>;

async function savePlatforms(tx: Tx, request: LoadedRequest, input: unknown) {
  const step2 = parse(step2Schema, input);
  const chosenIds = [...new Set(step2.parts.flatMap((p) => p.technologyIds))];
  const technologies = await tx.technology.findMany({ where: { id: { in: chosenIds } } });
  const byId = new Map(technologies.map((t) => [t.id, t]));

  // Active technologies for the part, or ones this part already had (retired ones stay).
  for (const choice of step2.parts) {
    const had = new Set(
      request.parts.find((p) => p.part === choice.part)?.technologies.map((t) => t.technologyId) ??
        [],
    );
    for (const techId of choice.technologyIds) {
      const tech = byId.get(techId);
      const available = tech && tech.parts.includes(choice.part) && !tech.retiredAt;
      if (!available && !had.has(techId)) {
        throw new ServiceError(
          `${tech?.name ?? "That technology"} isn't available for ${PART_LABELS[choice.part]}`,
          400,
        );
      }
    }
  }

  const keep = step2.parts.map((p) => p.part);
  await tx.requestPart.deleteMany({ where: { requestId: request.id, part: { notIn: keep } } });
  for (const choice of step2.parts) {
    const part = await tx.requestPart.upsert({
      where: { requestId_part: { requestId: request.id, part: choice.part } },
      create: { requestId: request.id, part: choice.part },
      update: {},
    });
    await tx.requestPartTechnology.deleteMany({ where: { requestPartId: part.id } });
    if (choice.technologyIds.length) {
      await tx.requestPartTechnology.createMany({
        data: choice.technologyIds.map((technologyId) => ({
          requestPartId: part.id,
          technologyId,
        })),
      });
    }
  }

  // Features lose the parts that were removed (the wizard warns before saving).
  for (const feature of request.features) {
    const parts = feature.parts.filter((p) => keep.includes(p));
    if (parts.length !== feature.parts.length) {
      await tx.feature.update({ where: { id: feature.id }, data: { parts } });
    }
  }

  await tx.estimationRequest.update({
    where: { id: request.id },
    data: {
      applicationTypes: step2.applicationTypes,
      operatingSystems: step2.operatingSystems,
      browsers: step2.browsers,
    },
  });
}

async function saveFeatures(tx: Tx, request: LoadedRequest, input: unknown) {
  const { features } = parse(step4Schema, input);
  const allowed = new Set<Part>(request.parts.map((p) => p.part));
  features.forEach((feature, i) => {
    if (feature.parts.some((p) => !allowed.has(p))) {
      throw new ServiceError("Choose parts from this request", 400, {
        [`features.${i}.parts`]: "Choose parts from this request",
      });
    }
  });
  // Update features by id, so their estimate Tasks and Sub tasks survive renames and reorders.
  const existing = new Set(request.features.map((f) => f.id));
  const kept = new Set<string>();
  for (const [position, f] of features.entries()) {
    const data = { name: f.name, description: f.description || null, parts: f.parts, position };
    if (f.key && existing.has(f.key) && !kept.has(f.key)) {
      kept.add(f.key);
      await tx.feature.update({ where: { id: f.key }, data });
    } else {
      const created = await tx.feature.create({ data: { ...data, requestId: request.id } });
      kept.add(created.id);
    }
  }
  await tx.feature.deleteMany({ where: { requestId: request.id, id: { notIn: [...kept] } } });
}

/**
 * Makes the estimate Tasks match the scope (specs/estimate-hours): one Task per feature and
 * part. Tasks whose feature lost that part go (with their Sub tasks); missing ones are added.
 */
export async function syncTasks(tx: Tx, requestId: string) {
  // Sequential: queries inside an interactive transaction share one connection.
  const features = await tx.feature.findMany({ where: { requestId } });
  const parts = await tx.requestPart.findMany({ where: { requestId } });
  const tasks = await tx.estimateTask.findMany({ where: { feature: { requestId } } });
  const partId = new Map(parts.map((p) => [p.part, p.id]));
  const wanted = new Set(
    features.flatMap((f) =>
      f.parts.filter((p) => partId.has(p)).map((p) => `${f.id}:${partId.get(p)}`),
    ),
  );
  const stale = tasks.filter((t) => !wanted.has(`${t.featureId}:${t.requestPartId}`));
  if (stale.length)
    await tx.estimateTask.deleteMany({ where: { id: { in: stale.map((t) => t.id) } } });
  const have = new Set(tasks.map((t) => `${t.featureId}:${t.requestPartId}`));
  const missing = [...wanted].filter((k) => !have.has(k));
  if (missing.length) {
    await tx.estimateTask.createMany({
      data: missing.map((k) => {
        const [featureId, requestPartId] = k.split(":");
        return { featureId, requestPartId };
      }),
    });
  }
}

// ---------- read ----------

export type RequestDetail = {
  id: string;
  projectName: string;
  clientName: string | null;
  projectManager: string;
  projectDate: string; // YYYY-MM-DD
  status: RequestStatus;
  owner: { id: string; name: string };
  lastStep: Step;
  applicationTypes: string[];
  operatingSystems: string[];
  browsers: string[];
  considerations: Considerations;
  parts: { part: Part; technologies: { id: string; name: string; retired: boolean }[] }[];
  features: { id: string; name: string; description: string; parts: Part[] }[];
  updatedAt: Date;
  canEdit: boolean;
  canDelete: boolean;
  /** Grand total "195–276", or "–" before any hours. */
  hours: string;
  outcome: "NONE" | "IN_DELIVERY" | "LOST" | "DELIVERED";
  outcomeReason: string | null;
  ownerId: string;
  lastExport: { userName: string; createdAt: Date } | null;
  missing: MissingItem[];
};

export async function getRequest(actor: CurrentUser | null, id: string): Promise<RequestDetail> {
  assertAccess(actor);
  const request = await getDb().estimationRequest.findUnique({
    where: { id },
    include: {
      client: true,
      owner: { select: { id: true, name: true } },
      parts: {
        include: {
          technologies: { include: { technology: true } },
          tasks: { select: { subTasks: { select: { minTenths: true, maxTenths: true } } } },
        },
      },
      exports: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { user: { select: { name: true } } },
      },
      features: { orderBy: { position: "asc" } },
    },
  });
  if (!request) throw new ServiceError("Request not found", 404);

  const order = (p: Part) => PART_VALUES.indexOf(p);
  const parts = [...request.parts]
    .sort((a, b) => order(a.part) - order(b.part))
    .map((p) => ({
      part: p.part,
      technologies: p.technologies
        .map((t) => ({
          id: t.technology.id,
          name: t.technology.name,
          retired: !!t.technology.retiredAt,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  const features = request.features.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description ?? "",
    parts: f.parts,
  }));
  return {
    id: request.id,
    projectName: request.projectName,
    clientName: request.client?.name ?? null,
    projectManager: request.projectManager,
    projectDate: request.projectDate.toISOString().slice(0, 10),
    status: request.status,
    owner: request.owner,
    lastStep: Math.min(Math.max(request.lastStep, 1), 4) as Step,
    applicationTypes: request.applicationTypes,
    operatingSystems: request.operatingSystems,
    browsers: request.browsers,
    considerations: readConsiderations(request.considerations),
    parts,
    features,
    updatedAt: request.updatedAt,
    canEdit: canEditRequest(actor, request),
    canDelete: canDeleteRequest(actor, request),
    hours: requestHours(request),
    outcome: request.outcome,
    outcomeReason: request.outcomeReason,
    ownerId: request.ownerId,
    lastExport: request.exports[0]
      ? { userName: request.exports[0].user.name, createdAt: request.exports[0].createdAt }
      : null,
    missing: checkCompleteness({
      clientName: request.client?.name ?? null,
      parts: parts.map((p) => ({ part: p.part, technologyCount: p.technologies.length })),
      features,
    }),
  };
}

export async function deleteRequest(actor: CurrentUser | null, id: string) {
  assertAccess(actor, "estimate.edit");
  const db = getDb();
  const request = await db.estimationRequest.findUnique({ where: { id } });
  if (!request) throw new ServiceError("Request not found", 404);
  if (!canDeleteRequest(actor, request)) {
    const message =
      request.status === "DRAFT"
        ? "Only the owner or an Admin can delete this request"
        : "Only drafts can be deleted";
    throw new ServiceError(message, 403);
  }
  // Features and parts cascade; the client stays for reuse.
  await db.estimationRequest.delete({ where: { id } });
}

/** Client names already used, for the step 1 suggestions. */
export async function listClientNames(actor: CurrentUser | null): Promise<string[]> {
  assertAccess(actor);
  const clients = await getDb().client.findMany({ orderBy: { name: "asc" }, take: 500 });
  return clients.map((c) => c.name);
}

// ---------- home ----------

export type RequestListRow = {
  id: string;
  projectName: string;
  clientName: string | null;
  status: RequestStatus;
  ownerName: string;
  outcome: "NONE" | "IN_DELIVERY" | "LOST" | "DELIVERED";
  parts: Part[];
  /** Grand total "195–276", or "–" before any Sub task hours (specs/estimate-hours). */
  hours: string;
  updatedAt: Date;
};

export async function listRequests(actor: CurrentUser | null, filters: RequestFilters) {
  assertAccess(actor);
  const and: Prisma.EstimationRequestWhereInput[] = [];
  if (filters.view === "mine") and.push({ ownerId: actor.id });
  if (filters.view === "in-review") and.push({ status: "IN_REVIEW" });
  if (filters.view === "approved") and.push({ status: "APPROVED" });
  if (filters.status) and.push({ status: filters.status });
  if (filters.owner) and.push({ ownerId: filters.owner });
  if (filters.client) and.push({ clientId: filters.client });
  if (filters.tech) {
    and.push({ parts: { some: { technologies: { some: { technologyId: filters.tech } } } } });
  }
  if (filters.q) {
    and.push({
      OR: [
        { projectName: { contains: filters.q, mode: "insensitive" } },
        { client: { name: { contains: filters.q, mode: "insensitive" } } },
      ],
    });
  }
  const where: Prisma.EstimationRequestWhereInput = and.length ? { AND: and } : {};

  const db = getDb();
  const [total, rows] = await Promise.all([
    db.estimationRequest.count({ where }),
    db.estimationRequest.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        client: { select: { name: true } },
        owner: { select: { name: true } },
        parts: {
          select: {
            part: true,
            deploymentMinTenths: true,
            deploymentMaxTenths: true,
            tasks: { select: { subTasks: { select: { minTenths: true, maxTenths: true } } } },
          },
        },
      },
    }),
  ]);
  return {
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    rows: rows.map((r): RequestListRow => ({
      id: r.id,
      projectName: r.projectName,
      clientName: r.client?.name ?? null,
      status: r.status,
      ownerName: r.owner.name,
      parts: r.parts
        .map((p) => p.part)
        .sort((a, b) => PART_VALUES.indexOf(a) - PART_VALUES.indexOf(b)),
      hours: requestHours(r),
      outcome: r.outcome,
      updatedAt: r.updatedAt,
    })),
  };
}

/** Choices for the home filters: only values that appear on some request. */
export async function listFilterOptions(actor: CurrentUser | null) {
  assertAccess(actor);
  const db = getDb();
  const [clients, owners, technologies] = await Promise.all([
    db.client.findMany({ where: { requests: { some: {} } }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { requests: { some: {} } }, orderBy: { name: "asc" } }),
    db.technology.findMany({ where: { usedBy: { some: {} } }, orderBy: { name: "asc" } }),
  ]);
  return {
    clients: clients.map((c) => ({ id: c.id, name: c.name })),
    owners: owners.map((o) => ({ id: o.id, name: o.name })),
    technologies: technologies.map((t) => ({ id: t.id, name: t.name })),
  };
}

/** "My drafts" count and the latest draft to continue (specs/home-screen). */
export async function myDrafts(actor: CurrentUser | null) {
  assertAccess(actor);
  const db = getDb();
  const where = { ownerId: actor.id, status: "DRAFT" as const };
  const [count, latest] = await Promise.all([
    db.estimationRequest.count({ where }),
    db.estimationRequest.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
      include: { client: { select: { name: true } } },
    }),
  ]);
  return {
    count,
    latest: latest && {
      id: latest.id,
      projectName: latest.projectName,
      clientName: latest.client?.name ?? null,
      lastStep: Math.min(Math.max(latest.lastStep, 1), 4) as Step,
      updatedAt: latest.updatedAt,
    },
  };
}

/** The grand total of a request for lists: "195–276", or "–" without Sub task hours. */
export function requestHours(request: {
  qaEnabled: boolean;
  qaPercent: number;
  pmEnabled: boolean;
  pmPercent: number;
  bugFixPercent: number;
  hourlyRate: number;
  parts: {
    part: string;
    deploymentMinTenths: number;
    deploymentMaxTenths: number;
    tasks: { subTasks: { minTenths: number; maxTenths: number }[] }[];
  }[];
}): string {
  const totals = computeTotals({
    parts: request.parts,
    qa: { enabled: request.qaEnabled, percent: request.qaPercent },
    pm: { enabled: request.pmEnabled, percent: request.pmPercent },
    bugFixPercent: request.bugFixPercent,
    rate: request.hourlyRate,
  });
  return formatRange(totals.total, totals.hasHours);
}
