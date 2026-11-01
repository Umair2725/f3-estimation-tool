// The frozen estimate stored when a request is approved (specs/estimate-review "Approve"). It is
// the request's knowledge-base source, so it keeps hours in tenths as stored, plus the totals
// the review page showed. `snapshotVersion` lets later shapes read older snapshots.
import { computeTotals, toTenths, type Totals } from "@/lib/estimation/totals";
import type { Part } from "@/lib/estimation/options";

export type ApprovedSnapshot = {
  snapshotVersion: 1;
  version: number;
  projectName: string;
  clientName: string | null;
  overheads: {
    qaEnabled: boolean;
    qaPercent: number;
    pmEnabled: boolean;
    pmPercent: number;
    bugFixPercent: number;
    hourlyRate: number;
  };
  parts: {
    part: Part;
    label: string;
    deploymentMinTenths: number;
    deploymentMaxTenths: number;
    tasks: {
      title: string;
      subTasks: {
        title: string;
        minTenths: number;
        maxTenths: number;
        comment: string;
        source?: string;
      }[];
    }[];
  }[];
  totals: Totals;
};

/** The estimate as the estimate page shows it (hours, not tenths). */
export type SnapshotSource = {
  projectName: string;
  clientName: string | null;
  overheads: ApprovedSnapshot["overheads"];
  parts: {
    part: Part;
    label: string;
    deploymentMin: number;
    deploymentMax: number;
    tasks: {
      featureName: string;
      subTasks: { title: string; min: number; max: number; comment: string; source?: string }[];
    }[];
  }[];
};

export function buildSnapshot(version: number, source: SnapshotSource): ApprovedSnapshot {
  const parts = source.parts.map((p) => ({
    part: p.part,
    label: p.label,
    deploymentMinTenths: toTenths(p.deploymentMin),
    deploymentMaxTenths: toTenths(p.deploymentMax),
    tasks: p.tasks.map((t) => ({
      title: t.featureName,
      subTasks: t.subTasks.map((s) => ({
        title: s.title,
        minTenths: toTenths(s.min),
        maxTenths: toTenths(s.max),
        comment: s.comment,
        ...(s.source ? { source: s.source } : {}),
      })),
    })),
  }));
  const o = source.overheads;
  const totals = computeTotals({
    parts,
    qa: { enabled: o.qaEnabled, percent: o.qaPercent },
    pm: { enabled: o.pmEnabled, percent: o.pmPercent },
    bugFixPercent: o.bugFixPercent,
    rate: o.hourlyRate,
  });
  return {
    snapshotVersion: 1,
    version,
    projectName: source.projectName,
    clientName: source.clientName,
    overheads: { ...o },
    parts,
    totals,
  };
}

export function readSnapshot(json: unknown): ApprovedSnapshot {
  const value = json as Partial<ApprovedSnapshot> | null;
  if (!value || value.snapshotVersion !== 1) throw new Error("Unknown approved snapshot format");
  return value as ApprovedSnapshot;
}
