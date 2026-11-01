// Accuracy report (specs/actual-hours "Accuracy report"): estimated Min–Max vs actual hours by
// part and Task for matched work, variance against Min, and unplanned and dropped totals.

export type ReportRow = {
  status: "MATCHED" | "UNPLANNED" | "DROPPED";
  partLabel: string;
  taskTitle: string;
  title: string;
  estMinTenths: number;
  estMaxTenths: number;
  actualTenths: number | null;
};

export type Line = { estMin: number; estMax: number; actual: number; variance: number | null };

export type AccuracyReport = {
  parts: (Line & {
    label: string;
    tasks: (Line & { title: string; rows: (Line & { title: string })[] })[];
  })[];
  matched: Line;
  unplanned: { count: number; actual: number };
  dropped: { count: number; estMin: number; estMax: number };
  /** Matched + unplanned actual hours: the request's actual total. */
  actualTotal: number;
};

/** (actual − Min) ÷ Min as a whole percentage; null when Min is 0. */
export function variance(estMin: number, actual: number): number | null {
  if (estMin <= 0) return null;
  return Math.round(((actual - estMin) / estMin) * 100);
}

function line(rows: ReportRow[]): Line {
  const estMin = rows.reduce((s, r) => s + r.estMinTenths, 0) / 10;
  const estMax = rows.reduce((s, r) => s + r.estMaxTenths, 0) / 10;
  const actual = rows.reduce((s, r) => s + (r.actualTenths ?? 0), 0) / 10;
  return { estMin, estMax, actual, variance: variance(estMin, actual) };
}

export function buildReport(rows: ReportRow[]): AccuracyReport {
  const matched = rows.filter((r) => r.status === "MATCHED");
  const partLabels = [...new Set(matched.map((r) => r.partLabel))];
  const unplanned = rows.filter((r) => r.status === "UNPLANNED");
  const dropped = rows.filter((r) => r.status === "DROPPED");
  const unplannedActual = unplanned.reduce((s, r) => s + (r.actualTenths ?? 0), 0) / 10;
  const matchedLine = line(matched);
  return {
    parts: partLabels.map((label) => {
      const inPart = matched.filter((r) => r.partLabel === label);
      const titles = [...new Set(inPart.map((r) => r.taskTitle))];
      return {
        label,
        ...line(inPart),
        tasks: titles.map((title) => {
          const inTask = inPart.filter((r) => r.taskTitle === title);
          return {
            title,
            ...line(inTask),
            rows: inTask.map((r) => ({ title: r.title, ...line([r]) })),
          };
        }),
      };
    }),
    matched: matchedLine,
    unplanned: { count: unplanned.length, actual: unplannedActual },
    dropped: {
      count: dropped.length,
      estMin: dropped.reduce((s, r) => s + r.estMinTenths, 0) / 10,
      estMax: dropped.reduce((s, r) => s + r.estMaxTenths, 0) / 10,
    },
    actualTotal: Math.round((matchedLine.actual + unplannedActual) * 10) / 10,
  };
}
