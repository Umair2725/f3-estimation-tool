// Estimate totals (specs/estimate-hours "Totals"). One function used by the estimate page, the
// home list and the Excel export, in the same order as the exported formulas:
//   part development = Σ Sub tasks; bug fixing = development × bug %; part total = development
//   + bug fixing + deployment; development = Σ part totals; QA and PM = development × %;
//   total = development + QA + PM; cost = total × rate.
// Hours come in as tenths (exact integers); percentages make them fractional, so results are
// plain numbers in hours, not rounded.

export type MinMax = { min: number; max: number };

export type TotalsInput = {
  parts: {
    part: string;
    tasks: { subTasks: { minTenths: number; maxTenths: number }[] }[];
    deploymentMinTenths: number;
    deploymentMaxTenths: number;
  }[];
  qa: { enabled: boolean; percent: number };
  pm: { enabled: boolean; percent: number };
  bugFixPercent: number;
  rate: number;
};

export type PartTotals = {
  part: string;
  tasks: MinMax[];
  development: MinMax;
  bugFixing: MinMax;
  deployment: MinMax;
  total: MinMax;
};

export type Totals = {
  parts: PartTotals[];
  development: MinMax;
  qa: MinMax | null;
  pm: MinMax | null;
  total: MinMax;
  cost: MinMax;
  hasHours: boolean;
};

const pct = (value: number, percent: number) => (value * percent) / 100;
const both = (f: (k: "min" | "max") => number): MinMax => ({ min: f("min"), max: f("max") });

export function computeTotals(input: TotalsInput): Totals {
  let hasHours = false;
  const parts = input.parts.map((p): PartTotals => {
    const tasks = p.tasks.map((t) => {
      const tenths = both((k) =>
        t.subTasks.reduce((sum, s) => sum + (k === "min" ? s.minTenths : s.maxTenths), 0),
      );
      if (tenths.min > 0 || tenths.max > 0) hasHours = true;
      return tenths;
    });
    const developmentTenths = both((k) => tasks.reduce((sum, t) => sum + t[k], 0));
    const development = both((k) => developmentTenths[k] / 10);
    const bugFixing = both((k) => pct(development[k], input.bugFixPercent));
    const deployment = { min: p.deploymentMinTenths / 10, max: p.deploymentMaxTenths / 10 };
    return {
      part: p.part,
      tasks: tasks.map((t) => ({ min: t.min / 10, max: t.max / 10 })),
      development,
      bugFixing,
      deployment,
      total: both((k) => development[k] + bugFixing[k] + deployment[k]),
    };
  });

  const development = both((k) => parts.reduce((sum, p) => sum + p.total[k], 0));
  const qa = input.qa.enabled ? both((k) => pct(development[k], input.qa.percent)) : null;
  const pm = input.pm.enabled ? both((k) => pct(development[k], input.pm.percent)) : null;
  const total = both((k) => development[k] + (qa?.[k] ?? 0) + (pm?.[k] ?? 0));
  return {
    parts,
    development,
    qa,
    pm,
    total,
    cost: both((k) => total[k] * input.rate),
    hasHours,
  };
}

/** Hours for display: at most one decimal, no trailing ".0" ("12", "12.5", "31.5"). */
export function formatHours(hours: number): string {
  return String(Math.round(hours * 10) / 10);
}

/** "195–276" for lists, or "–" when there are no hours yet. */
export function formatRange(range: MinMax, hasHours = true): string {
  if (!hasHours) return "–";
  return `${Math.round(range.min)}–${Math.round(range.max)}`;
}

export function formatUsd(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/** Hours (a number with at most one decimal) to stored tenths. */
export function toTenths(hours: number): number {
  return Math.round(hours * 10);
}
