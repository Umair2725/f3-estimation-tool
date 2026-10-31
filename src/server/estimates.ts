import "server-only";
import type { CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { PART_LABELS, PART_VALUES, type Part, type RequestStatus } from "@/lib/estimation/options";
import { estimateSchema, fieldErrors, readConsiderations } from "@/lib/estimation/schemas";
import { buildChecklist } from "@/lib/estimation/checklist";
import { computeTotals, toTenths, type Totals, type TotalsInput } from "@/lib/estimation/totals";
import { readDefaults } from "./estimate-defaults";
import { canEditRequest, loadForEdit, syncTasks } from "./estimation-requests";
import { assertAccess, ServiceError } from "./service-error";

// Hours, part extras and overheads of a request (specs/estimate-hours). Everyone with a role can
// read them; only people who may edit the request can save, checked here on the server.

export const RATE_MESSAGE = "Choose one of the approved rates";

export type EstimateView = {
  request: {
    id: string;
    projectName: string;
    clientName: string | null;
    status: RequestStatus;
    ownerName: string;
    canEdit: boolean;
  };
  environments: string[];
  approvedRates: number[];
  overheads: {
    qaEnabled: boolean;
    qaPercent: number;
    pmEnabled: boolean;
    pmPercent: number;
    bugFixPercent: number;
    hourlyRate: number;
    rateConfirmed: boolean;
  };
  parts: {
    part: Part;
    label: string; // "Backend (Node.js)"
    deploymentMin: number;
    deploymentMax: number;
    assumptions: string[];
    risks: string[];
    tasks: {
      taskId: string;
      featureId: string;
      featureName: string;
      featureDescription: string;
      subTasks: { title: string; min: number; max: number; comment: string }[];
    }[];
  }[];
  features: { id: string; name: string; description: string; parts: Part[] }[];
  otherConsiderations: string;
  // Every other client in the tool, for the "names another client" warning.
  otherClients: string[];
  lastExport: { userName: string; createdAt: Date; fileName: string } | null;
};

/** "Backend (Node.js, Python)": the development sheet's name before Excel's limits. */
export function partLabel(part: Part, technologies: string[]): string {
  return technologies.length
    ? `${PART_LABELS[part]} (${technologies.join(", ")})`
    : PART_LABELS[part];
}

export async function getEstimate(actor: CurrentUser | null, id: string): Promise<EstimateView> {
  assertAccess(actor);
  const db = getDb();
  const exists = await db.estimationRequest.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new ServiceError("Request not found", 404);
  // Tasks are derived from scope; create any that are missing (e.g. requests made before hours).
  await db.$transaction((tx) => syncTasks(tx, id));

  const request = await db.estimationRequest.findUniqueOrThrow({
    where: { id },
    include: {
      client: true,
      owner: { select: { name: true } },
      features: { orderBy: { position: "asc" } },
      parts: {
        include: {
          technologies: { include: { technology: true } },
          tasks: { include: { subTasks: { orderBy: { position: "asc" } } } },
        },
      },
      exports: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { user: { select: { name: true } } },
      },
    },
  });
  const defaults = await readDefaults();
  const considerations = readConsiderations(request.considerations);
  const featureOrder = new Map(request.features.map((f, i) => [f.id, i]));
  const featureById = new Map(request.features.map((f) => [f.id, f]));
  const hours = (tenths: number) => tenths / 10;

  const parts = [...request.parts]
    .sort((a, b) => PART_VALUES.indexOf(a.part) - PART_VALUES.indexOf(b.part))
    .map((p) => ({
      part: p.part,
      label: partLabel(
        p.part,
        p.technologies.map((t) => t.technology.name).sort((a, b) => a.localeCompare(b)),
      ),
      deploymentMin: hours(p.deploymentMinTenths),
      deploymentMax: hours(p.deploymentMaxTenths),
      assumptions: p.assumptions,
      risks: p.risks,
      tasks: [...p.tasks]
        .sort((a, b) => (featureOrder.get(a.featureId) ?? 0) - (featureOrder.get(b.featureId) ?? 0))
        .map((t) => {
          const feature = featureById.get(t.featureId)!;
          return {
            taskId: t.id,
            featureId: t.featureId,
            featureName: feature.name,
            featureDescription: feature.description ?? "",
            subTasks: t.subTasks.map((s) => ({
              title: s.title,
              min: hours(s.minTenths),
              max: hours(s.maxTenths),
              comment: s.comment,
            })),
          };
        }),
    }));

  const last = request.exports[0];
  return {
    request: {
      id: request.id,
      projectName: request.projectName,
      clientName: request.client?.name ?? null,
      status: request.status,
      ownerName: request.owner.name,
      canEdit: canEditRequest(actor, request),
    },
    environments: [...considerations.environments, ...considerations.appStores],
    approvedRates: defaults.approvedRates,
    overheads: {
      qaEnabled: request.qaEnabled,
      qaPercent: request.qaPercent,
      pmEnabled: request.pmEnabled,
      pmPercent: request.pmPercent,
      bugFixPercent: request.bugFixPercent,
      hourlyRate: request.hourlyRate,
      rateConfirmed: request.rateConfirmed,
    },
    parts,
    features: request.features.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description ?? "",
      parts: f.parts,
    })),
    otherConsiderations: considerations.other,
    otherClients: (
      await db.client.findMany({ where: request.clientId ? { id: { not: request.clientId } } : {} })
    ).map((c) => c.name),
    lastExport: last
      ? { userName: last.user.name, createdAt: last.createdAt, fileName: last.fileName }
      : null,
  };
}

/** The totals input for an estimate, in the shape computeTotals expects. */
export function totalsInput(view: Pick<EstimateView, "parts" | "overheads">): TotalsInput {
  const o = view.overheads;
  return {
    parts: view.parts.map((p) => ({
      part: p.part,
      tasks: p.tasks.map((t) => ({
        subTasks: t.subTasks.map((s) => ({
          minTenths: toTenths(s.min),
          maxTenths: toTenths(s.max),
        })),
      })),
      deploymentMinTenths: toTenths(p.deploymentMin),
      deploymentMaxTenths: toTenths(p.deploymentMax),
    })),
    qa: { enabled: o.qaEnabled, percent: o.qaPercent },
    pm: { enabled: o.pmEnabled, percent: o.pmPercent },
    bugFixPercent: o.bugFixPercent,
    rate: o.hourlyRate,
  };
}

export function estimateTotals(view: Pick<EstimateView, "parts" | "overheads">): Totals {
  return computeTotals(totalsInput(view));
}

export async function saveEstimate(actor: CurrentUser | null, id: string, input: unknown) {
  assertAccess(actor, "estimate.edit");
  const parsed = estimateSchema.safeParse(input);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    throw new ServiceError(Object.values(fields)[0] ?? "Check the form", 400, fields);
  }
  const estimate = parsed.data;
  const { approvedRates } = await readDefaults();

  return getDb().$transaction(async (tx) => {
    const request = await loadForEdit(tx, actor, id);
    // A rate removed from the approved list stays on requests that already use it.
    if (
      !approvedRates.includes(estimate.hourlyRate) &&
      estimate.hourlyRate !== request.hourlyRate
    ) {
      throw new ServiceError(RATE_MESSAGE, 400, { hourlyRate: RATE_MESSAGE });
    }

    const tasks = await tx.estimateTask.findMany({ where: { feature: { requestId: id } } });
    const taskIds = new Set(tasks.map((t) => t.id));
    for (const task of estimate.tasks) {
      if (!taskIds.has(task.taskId)) {
        throw new ServiceError("The scope changed while you were editing. Reload the page.", 409);
      }
      await tx.subTask.deleteMany({ where: { taskId: task.taskId } });
      if (task.subTasks.length) {
        await tx.subTask.createMany({
          data: task.subTasks.map((s, position) => ({
            taskId: task.taskId,
            title: s.title,
            minTenths: toTenths(s.min),
            maxTenths: toTenths(s.max),
            comment: s.comment,
            position,
          })),
        });
      }
    }

    for (const part of estimate.parts) {
      await tx.requestPart.updateMany({
        where: { requestId: id, part: part.part },
        data: {
          deploymentMinTenths: toTenths(part.deploymentMin),
          deploymentMaxTenths: toTenths(part.deploymentMax),
          assumptions: part.assumptions,
          risks: part.risks,
        },
      });
    }

    const saved = await tx.estimationRequest.update({
      where: { id },
      data: {
        qaEnabled: estimate.qaEnabled,
        qaPercent: estimate.qaPercent,
        pmEnabled: estimate.pmEnabled,
        pmPercent: estimate.pmPercent,
        bugFixPercent: estimate.bugFixPercent,
        hourlyRate: estimate.hourlyRate,
        rateConfirmed: estimate.rateConfirmed,
      },
    });
    return { savedAt: saved.updatedAt };
  });
}

/** The pre-export checklist for an estimate (specs/excel-export). */
export function estimateChecklist(view: EstimateView) {
  return buildChecklist({
    parts: view.parts,
    features: view.features,
    otherConsiderations: view.otherConsiderations,
    overheads: view.overheads,
    approvedRates: view.approvedRates,
    otherClients: view.otherClients,
  });
}
