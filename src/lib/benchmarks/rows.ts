// Benchmark rows from the seed CSV or the survey workbook (specs/feature-benchmarks "Import from
// the seed list or the survey"). Pure: the import previews exactly what these functions return.

export const BENCHMARK_PARTS = [
  "WEB_FRONTEND",
  "BACKEND",
  "ADMIN_PANEL",
  "MOBILE",
  "CLOUD_INFRA",
  "DESIGN",
  "ANY",
] as const;
export type BenchmarkPart = (typeof BENCHMARK_PARTS)[number];

export const BENCHMARK_PART_LABELS: Record<BenchmarkPart, string> = {
  WEB_FRONTEND: "Web/Frontend",
  BACKEND: "Backend",
  ADMIN_PANEL: "Admin Panel",
  MOBILE: "Mobile",
  CLOUD_INFRA: "Cloud/Infrastructure",
  DESIGN: "Design",
  ANY: "Any",
};

const PART_BY_LABEL = new Map(
  Object.entries(BENCHMARK_PART_LABELS).map(([part, label]) => [
    label.toLowerCase(),
    part as BenchmarkPart,
  ]),
);

export type BenchmarkRow = {
  row: number; // 1-based line or sheet row, for messages
  code: string;
  module: string;
  feature: string;
  part: BenchmarkPart;
  stack: string;
  included: string;
  preAiMinTenths: number | null;
  preAiMaxTenths: number | null;
  preAiSource: string;
  experiencedTenths: number | null;
  juniorTenths: number | null;
  aiTools: string;
  projectsCount: number | null;
  filledBy: string;
  confirmedBy: string;
  date: string | null; // YYYY-MM-DD
  notes: string;
};

export type RowProblem = { row: number; message: string };

/** Column names: the CSV header, then the survey's display header. */
const COLUMNS: Record<keyof Omit<BenchmarkRow, "row">, string[]> = {
  code: ["feature_id", "ID"],
  module: ["module", "Module"],
  feature: ["feature", "Feature"],
  part: ["part", "Part"],
  stack: ["typical_stack", "Typical stack"],
  included: ["what_is_included", "What is included (one instance)"],
  preAiMinTenths: ["pre_ai_min_hours", "Pre-AI Min (h)"],
  preAiMaxTenths: ["pre_ai_max_hours", "Pre-AI Max (h)"],
  preAiSource: ["pre_ai_source", "Pre-AI source"],
  experiencedTenths: ["ai_hours_experienced", "AI hours - experienced dev"],
  juniorTenths: ["ai_hours_junior", "AI hours - junior dev"],
  aiTools: ["ai_tools_used", "AI tools used"],
  projectsCount: ["projects_count", "Based on # projects"],
  filledBy: ["filled_by", "Filled by (Tech Lead)"],
  confirmedBy: ["confirmed_by", "Confirmed by (Architect)"],
  date: ["confirmed_on", "Date (YYYY-MM-DD)"],
  notes: ["notes", "Notes"],
};

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

type Cell = string | number | Date | null | undefined;

const text = (value: Cell) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").trim();

/**
 * Turns a header row and data rows (from the CSV or the survey's Features sheet) into benchmark
 * rows and problems. `firstRow` is the line or sheet row number of the first data row.
 */
export function readRows(
  header: Cell[],
  data: Cell[][],
  firstRow = 2,
): { rows: BenchmarkRow[]; problems: RowProblem[] } {
  const names = header.map((h) => text(h).toLowerCase());
  const index = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, aliases]) => [
      key,
      names.findIndex((n) => aliases.some((a) => a.toLowerCase() === n)),
    ]),
  ) as Record<keyof typeof COLUMNS, number>;

  const missing = (["code", "feature", "part"] as const).filter((k) => index[k] < 0);
  if (missing.length) {
    return {
      rows: [],
      problems: [
        { row: 1, message: `Missing columns: ${missing.map((k) => COLUMNS[k][0]).join(", ")}` },
      ],
    };
  }

  const rows: BenchmarkRow[] = [];
  const problems: RowProblem[] = [];
  const seen = new Set<string>();
  data.forEach((cells, i) => {
    const rowNo = firstRow + i;
    const get = (key: keyof typeof COLUMNS) => (index[key] >= 0 ? cells[index[key]] : undefined);
    if (Object.keys(COLUMNS).every((k) => text(get(k as keyof typeof COLUMNS)) === "")) return;
    const errors: string[] = [];

    const hours = (key: keyof typeof COLUMNS, label: string) => {
      const raw = text(get(key));
      if (raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 9999) {
        errors.push(`${label} isn't a number of hours: ${raw}`);
        return null;
      }
      return Math.round(n * 10);
    };

    const code = text(get("code")).toUpperCase();
    const feature = text(get("feature"));
    if (!/^FB-\d{1,5}$/.test(code))
      errors.push(`ID must look like FB-012${code ? `, not ${code}` : ""}`);
    else if (seen.has(code)) errors.push(`${code} appears twice`);
    if (!feature) errors.push("Feature is empty");
    const partText = text(get("part"));
    const part = PART_BY_LABEL.get(partText.toLowerCase());
    if (!part) errors.push(`unknown part ${partText || "(empty)"}`);

    const preAiMinTenths = hours("preAiMinTenths", "Pre-AI Min");
    const preAiMaxTenths = hours("preAiMaxTenths", "Pre-AI Max");
    const experiencedTenths = hours("experiencedTenths", "AI hours (experienced)");
    const juniorTenths = hours("juniorTenths", "AI hours (junior)");
    if (preAiMinTenths !== null && preAiMaxTenths !== null && preAiMinTenths > preAiMaxTenths) {
      errors.push("Pre-AI Min is more than Max");
    }
    if (experiencedTenths !== null && juniorTenths !== null && experiencedTenths > juniorTenths) {
      errors.push("experienced hours are more than junior hours");
    }
    if (experiencedTenths === null && juniorTenths !== null) {
      errors.push("junior hours need experienced hours too");
    }
    const projectsText = text(get("projectsCount"));
    const projectsCount = projectsText === "" ? null : Number(projectsText);
    if (projectsCount !== null && (!Number.isInteger(projectsCount) || projectsCount < 0)) {
      errors.push(`Based on # projects isn't a whole number: ${projectsText}`);
    }
    const dateText = text(get("date"));
    const date = /^\d{4}-\d{2}-\d{2}/.test(dateText) ? dateText.slice(0, 10) : null;
    if (dateText && !date) errors.push(`Date must be YYYY-MM-DD, not ${dateText}`);

    if (errors.length) {
      problems.push({ row: rowNo, message: `Row ${rowNo}: ${errors.join("; ")}` });
      return;
    }
    seen.add(code);
    rows.push({
      row: rowNo,
      code,
      module: text(get("module")),
      feature,
      part: part!,
      stack: text(get("stack")) || "Any",
      included: text(get("included")),
      preAiMinTenths,
      preAiMaxTenths,
      preAiSource: text(get("preAiSource")),
      experiencedTenths,
      juniorTenths,
      aiTools: text(get("aiTools")),
      projectsCount: projectsCount === null ? null : projectsCount,
      filledBy: text(get("filledBy")),
      confirmedBy: text(get("confirmedBy")),
      date,
      notes: text(get("notes")),
    });
  });
  return { rows, problems };
}

/** The CSV file as rows. */
export function readCsv(textContent: string) {
  const [header = [], ...data] = parseCsv(textContent);
  return readRows(header, data, 2);
}
