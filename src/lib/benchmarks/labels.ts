// Benchmark wording (specs/feature-benchmarks, specs/feature-matching). Pure.

export const STATUS_LABELS = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  RETIRED: "Retired",
} as const;
export const LEVEL_LABELS = {
  EXPERIENCED: "Experienced",
  JUNIOR: "Junior",
  MIXED: "Mixed",
} as const;
export const SOURCE_LABELS = {
  MANUAL: "Manual",
  SURVEY: "Survey",
  ACTUALS: "Actual hours",
} as const;
export const CHANGE_LABELS = {
  IMPORT: "Imported",
  EDIT: "Edited",
  RECALCULATED: "Recalculated",
  PROPOSED: "Proposed",
  PROPOSAL_ACCEPTED: "Proposal accepted",
  PROPOSAL_REJECTED: "Proposal rejected",
  CONFIRMED: "Confirmed",
  RETIRED: "Retired",
  REFERENCE: "Reference hours from an Architect",
} as const;

export const hours = (tenths: number | null | undefined) =>
  tenths === null || tenths === undefined ? "–" : String(tenths / 10);

export const range = (min: number | null | undefined, max: number | null | undefined) =>
  min === null || min === undefined ? "–" : `${hours(min)}–${hours(max ?? min)} h`;

/** "Benchmark FB-012, confirmed by Ahmed, based on 4 projects, updated 2026-09". */
export function benchmarkSource(b: {
  code: string;
  status: "DRAFT" | "CONFIRMED" | "RETIRED";
  confirmedByName: string | null;
  projectsCount: number;
  updatedAt: string; // ISO date
}): string {
  if (b.status !== "CONFIRMED") return `Draft benchmark ${b.code}, not confirmed yet`;
  const projects = `${b.projectsCount} ${b.projectsCount === 1 ? "project" : "projects"}`;
  return `Benchmark ${b.code}, confirmed by ${b.confirmedByName ?? "a reviewer"}, based on ${projects}, updated ${b.updatedAt.slice(0, 7)}`;
}

/** "Recalculated 4 → 3.5 h from 3 observations" for the change log. */
export function changeLine(c: {
  kind: keyof typeof CHANGE_LABELS;
  fromExperienced: number | null;
  toExperienced: number | null;
  fromJunior: number | null;
  toJunior: number | null;
  observationCount: number;
}): string {
  const moved =
    c.toExperienced !== null || c.toJunior !== null
      ? ` ${range(c.fromExperienced, c.fromJunior)} → ${range(c.toExperienced, c.toJunior)}`
      : "";
  const from = c.observationCount
    ? ` from ${c.observationCount} ${c.observationCount === 1 ? "observation" : "observations"}`
    : "";
  return `${CHANGE_LABELS[c.kind]}${moved}${from}`;
}
