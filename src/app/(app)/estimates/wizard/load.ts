import "server-only";
import type { CurrentUser } from "@/server/auth/access";
import { listClientNames, type RequestDetail } from "@/server/estimation-requests";
import { listTechnologies } from "@/server/tech-stack";
import type { Step } from "@/lib/estimation/options";
import type { TechnologyOption, WizardProps, WizardState } from "./types";

// Builds the wizard's starting state on the server, for a new or an existing request.

export function emptyState(actor: CurrentUser, today: string): WizardState {
  return {
    1: { projectName: "", clientName: "", projectManager: actor.name, projectDate: today },
    2: { applicationTypes: [], operatingSystems: [], browsers: [], parts: [] },
    3: { hosting: [], environments: [], appStores: [], compliance: [], nfr: {}, other: "" },
    4: { features: [] },
  };
}

export function stateFrom(request: RequestDetail): WizardState {
  const c = request.considerations;
  return {
    1: {
      projectName: request.projectName,
      clientName: request.clientName ?? "",
      projectManager: request.projectManager,
      projectDate: request.projectDate,
    },
    2: {
      applicationTypes: request.applicationTypes,
      operatingSystems: request.operatingSystems,
      browsers: request.browsers,
      parts: request.parts.map((p) => ({
        part: p.part,
        technologyIds: p.technologies.map((t) => t.id),
      })),
    },
    3: {
      hosting: c.hosting,
      environments: c.environments,
      appStores: c.appStores,
      compliance: c.compliance,
      nfr: c.nfr,
      other: c.other,
    },
    4: {
      features: request.features.map((f) => ({
        key: f.id,
        name: f.name,
        description: f.description,
        parts: f.parts,
      })),
    },
  };
}

/** Active catalog entries plus any retired ones this request already uses. */
async function technologyOptions(
  actor: CurrentUser,
  request?: RequestDetail,
): Promise<TechnologyOption[]> {
  const all = await listTechnologies(actor, { includeRetired: true });
  const used = new Set(request?.parts.flatMap((p) => p.technologies.map((t) => t.id)) ?? []);
  return all.filter((t) => !t.retired || used.has(t.id));
}

export async function wizardProps(
  actor: CurrentUser,
  request: RequestDetail | null,
  step: Step,
): Promise<WizardProps> {
  const [technologies, clientNames] = await Promise.all([
    technologyOptions(actor, request ?? undefined),
    listClientNames(actor),
  ]);
  if (!request) {
    const today = new Date().toISOString().slice(0, 10);
    return {
      id: null,
      initialStep: 1,
      lastStep: 1,
      savedAt: null,
      version: null,
      initial: emptyState(actor, today),
      technologies,
      clientNames,
    };
  }
  return {
    id: request.id,
    initialStep: step,
    lastStep: request.lastStep,
    savedAt: request.updatedAt.toISOString(),
    version: request.updatedAt.toISOString(),
    initial: stateFrom(request),
    technologies,
    clientNames,
  };
}
