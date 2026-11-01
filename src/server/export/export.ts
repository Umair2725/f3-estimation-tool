import "server-only";
import type { CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { exportFileName } from "@/lib/estimation/export-name";
import { readConsiderations } from "@/lib/estimation/schemas";
import { getEstimate } from "../estimates";
import { getRequest } from "../estimation-requests";
import { assertAccess } from "../service-error";
import { isApproved } from "@/lib/review/transitions";
import { buildWorkbook, type ExportData } from "./workbook";

// The internal export (specs/excel-export): anyone with a role who can view the request.
// Exporting never changes the request's status; each export is recorded.

export async function exportInternal(actor: CurrentUser | null, id: string, now = new Date()) {
  assertAccess(actor);
  const [request, estimate] = await Promise.all([getRequest(actor, id), getEstimate(actor, id)]);
  const considerations = request.considerations ?? readConsiderations({});
  const data: ExportData = {
    projectName: request.projectName,
    clientName: request.clientName,
    projectManager: request.projectManager,
    projectDate: request.projectDate,
    applicationTypes: request.applicationTypes,
    operatingSystems: request.operatingSystems,
    browsers: request.browsers,
    hosting: considerations.hosting,
    environments: estimate.environments,
    nfr: considerations.nfr,
    compliance: considerations.compliance,
    otherConsiderations: considerations.other,
    parts: estimate.parts.map((p) => ({
      sheetLabel: p.label,
      tasks: p.tasks.map((t) => ({
        name: t.featureName,
        description: t.featureDescription,
        subTasks: t.subTasks,
      })),
      deploymentMin: p.deploymentMin,
      deploymentMax: p.deploymentMax,
      assumptions: p.assumptions,
      risks: p.risks,
    })),
    qa: { enabled: estimate.overheads.qaEnabled, percent: estimate.overheads.qaPercent },
    pm: { enabled: estimate.overheads.pmEnabled, percent: estimate.overheads.pmPercent },
    bugFixPercent: estimate.overheads.bugFixPercent,
    rate: estimate.overheads.hourlyRate,
    draft: !isApproved(request.status),
  };
  const { buffer } = await buildWorkbook(data);
  const fileName = exportFileName(request.projectName, now.toISOString().slice(0, 10));
  await getDb().exportRecord.create({
    data: { requestId: id, userId: actor.id, kind: "INTERNAL", fileName, createdAt: now },
  });
  return { buffer, fileName };
}
