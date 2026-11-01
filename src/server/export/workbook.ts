import "server-only";
import path from "node:path";
import ExcelJS from "exceljs";
import { computeTotals, toTenths, type Totals } from "@/lib/estimation/totals";

// Builds the internal Excel export from Folio3's template (specs/excel-export; design
// decision 5). Development sheets are written row by row from prototype rows of the template's
// development sheet (found by their labels), so any number of Tasks fits and every total is a
// formula over exactly the rows used. The Summary is rewritten in place. The template's own
// sheets (three development sheets, QA, GD, PM and Questions) are then removed.

export const TEMPLATE_PATH = path.join(
  process.cwd(),
  "docs",
  "templates",
  "Empty_Estimation_Sheet.xlsx",
);
const PROTOTYPE_SHEET = "Dev Mobile Estimates";
const TEMPLATE_SHEETS = [
  "Dev Backend Estimates",
  "Dev Admin Estimates",
  "Dev Mobile Estimates",
  "QA Estimates",
  "GD Estimates",
  "PM Estimates",
  "Questions",
];
const COLUMNS = 8; // A–H carry the template's styles on the development sheets

export type ExportData = {
  projectName: string;
  clientName: string | null;
  projectManager: string;
  projectDate: string; // YYYY-MM-DD
  applicationTypes: string[];
  operatingSystems: string[];
  browsers: string[];
  hosting: string[];
  environments: string[]; // environments and app stores, for Deployment
  nfr: { performance?: Nfr; security?: Nfr; documentation?: Nfr; accessibility?: Nfr };
  compliance: string[];
  otherConsiderations: string;
  parts: {
    sheetLabel: string; // "Backend (Node.js)"
    tasks: {
      name: string;
      description: string;
      subTasks: { title: string; min: number; max: number; comment: string }[];
    }[];
    deploymentMin: number;
    deploymentMax: number;
    assumptions: string[];
    risks: string[];
  }[];
  qa: { enabled: boolean; percent: number };
  pm: { enabled: boolean; percent: number };
  bugFixPercent: number;
  rate: number;
  /** Not Approved: the Summary is marked "DRAFT – not approved" (specs/estimate-review). */
  draft?: boolean;
};
type Nfr = { enabled: boolean; note: string };

// ---------- prototypes ----------

type CellProto = { value: ExcelJS.CellValue; style: Partial<ExcelJS.Style> };
type RowProto = { height?: number; cells: CellProto[] }; // index 0 = column A

function copyStyle(style: Partial<ExcelJS.Style>): Partial<ExcelJS.Style> {
  return JSON.parse(JSON.stringify(style ?? {}));
}

function readRow(ws: ExcelJS.Worksheet, n: number): RowProto {
  const row = ws.getRow(n);
  const cells: CellProto[] = [];
  for (let c = 1; c <= COLUMNS; c++) {
    const cell = row.getCell(c);
    cells.push({ value: cell.value, style: copyStyle(cell.style) });
  }
  return { height: row.height, cells };
}

const text = (v: ExcelJS.CellValue) => (typeof v === "string" ? v.trim() : "");

/** The first row whose column C (or B) starts with `label`; throws if the template changed. */
function findRow(ws: ExcelJS.Worksheet, label: string, from = 1): number {
  for (let n = from; n <= 200; n++) {
    const row = ws.getRow(n);
    if (
      text(row.getCell(3).value).startsWith(label) ||
      text(row.getCell(2).value).startsWith(label)
    )
      return n;
  }
  throw new Error(`Template changed: no row "${label}" on ${ws.name}`);
}

function lastUsedRow(ws: ExcelJS.Worksheet): number {
  let last = 0;
  ws.eachRow((row, n) => {
    if (
      (row.values as ExcelJS.CellValue[]).some(
        (v) => v !== null && v !== undefined && String(v).trim() !== "",
      )
    )
      last = n;
  });
  return last;
}

function devPrototypes(ws: ExcelJS.Worksheet) {
  const header = findRow(ws, "Task");
  const notes = findRow(ws, "Notes");
  return {
    blank: readRow(ws, 1),
    title: readRow(ws, findRow(ws, "Development Estimates for")),
    grand: readRow(ws, findRow(ws, "Grand Total")),
    header: readRow(ws, header),
    task: readRow(ws, findRow(ws, "Task -", header + 1)),
    subTask: readRow(ws, findRow(ws, "Sub task -", header + 1)),
    devTotal: readRow(ws, findRow(ws, "Development Total Efforts")),
    otherHeader: readRow(ws, findRow(ws, "Other Development Activities")),
    bug: readRow(ws, findRow(ws, "Bug Fixing")),
    deployment: readRow(ws, findRow(ws, "Deployment")),
    postTotal: readRow(ws, findRow(ws, "Post Development Activities Total")),
    assumptionsHeader: readRow(ws, findRow(ws, "Assumptions & Constraints")),
    assumption: readRow(ws, findRow(ws, "Assumptions & Constraints") + 1),
    risksHeader: readRow(ws, findRow(ws, "Risks", notes - 12)),
    risk: readRow(ws, findRow(ws, "Risks", notes - 12) + 1),
    notes: Array.from({ length: lastUsedRow(ws) - notes + 1 }, (_, i) => readRow(ws, notes + i)),
    notesRow: notes,
    notesMerges: (ws.model.merges ?? []).filter((m) => Number(m.match(/\d+/)![0]) >= notes),
    widths: ws.columns.map((c) => c.width),
    views: ws.views,
    pageSetup: ws.pageSetup,
  };
}
type DevPrototypes = ReturnType<typeof devPrototypes>;

// ---------- writing helpers ----------

class SheetWriter {
  row = 0;
  constructor(readonly ws: ExcelJS.Worksheet) {}

  /** Writes a row styled like `proto`, with `values` by column letter (B–F). */
  write(
    proto: RowProto,
    values: Partial<Record<"B" | "C" | "D" | "E" | "F", ExcelJS.CellValue>> = {},
    keepValues = false,
  ) {
    this.row += 1;
    const row = this.ws.getRow(this.row);
    if (proto.height) row.height = proto.height;
    proto.cells.forEach((p, i) => {
      const cell = row.getCell(i + 1);
      cell.style = copyStyle(p.style);
      if (keepValues && p.value !== null && p.value !== undefined) cell.value = p.value;
    });
    for (const [col, value] of Object.entries(values)) row.getCell(col).value = value ?? null;
    return this.row;
  }

  merge(range: string) {
    this.ws.mergeCells(range);
  }
}

const f = (formula: string, result: number): ExcelJS.CellFormulaValue => ({ formula, result });
const sumOf = (col: string, rows: number[]) =>
  rows.length === 0
    ? "0"
    : chunk(rows, 200)
        .map((c) => `SUM(${c.map((r) => `${col}${r}`).join(",")})`)
        .join("+");
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------- sheet names ----------

/** Excel sheet names: no []:*?/\ characters, at most 31 characters, unique (case-insensitive). */
export function sheetNames(labels: string[]): string[] {
  const used = new Set<string>(["summary"]);
  return labels.map((label) => {
    const clean =
      label
        .replace(/[[\]:*?/\\]/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "Development";
    let name = clean.length > 31 ? `${clean.slice(0, 30).trimEnd()}…` : clean;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` ${n}`;
      name = `${clean.slice(0, 31 - suffix.length).trimEnd()}${suffix}`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

// ---------- development sheet ----------

function writeDevSheet(
  wb: ExcelJS.Workbook,
  proto: DevPrototypes,
  name: string,
  data: ExportData,
  part: ExportData["parts"][number],
  totals: Totals["parts"][number],
) {
  const ws = wb.addWorksheet(name, { views: proto.views, pageSetup: proto.pageSetup });
  proto.widths.forEach((w, i) => {
    if (w) ws.getColumn(i + 1).width = w;
  });
  const out = new SheetWriter(ws);

  out.write(proto.blank);
  const title = out.write(proto.title, { B: `Development Estimates for ${data.projectName}` });
  out.merge(`B${title}:F${title}`);
  const date = out.write(proto.title, { B: formatDate(data.projectDate) });
  out.merge(`B${date}:F${date}`);
  const by = out.write(proto.title, { B: `by ${data.projectManager}` });
  out.merge(`B${by}:F${by}`);
  out.write(proto.blank);
  const grand = out.write(proto.grand, {
    C: "Grand Total (in hours)",
    F: "Development and post-development efforts",
  });
  out.write(proto.blank);
  out.write(proto.header, { B: "S.No", C: "Task", D: "Minimum", E: "Maximum", F: "Comments" });

  const taskRows: number[] = [];
  part.tasks.forEach((task, i) => {
    const taskRow = out.write(proto.task, { B: i + 1, C: task.name, F: task.description || null });
    taskRows.push(taskRow);
    const first = out.row + 1;
    for (const sub of task.subTasks) {
      out.write(proto.subTask, { C: sub.title, D: sub.min, E: sub.max, F: sub.comment || null });
    }
    const last = out.row;
    const range = (col: string) =>
      task.subTasks.length ? `SUM(${col}${first}:${col}${last})` : "0";
    const t = totals.tasks[i];
    ws.getCell(`D${taskRow}`).value = f(range("D"), t.min);
    ws.getCell(`E${taskRow}`).value = f(range("E"), t.max);
    out.write(proto.blank);
  });

  const devTotal = out.write(proto.devTotal, {
    C: "Development Total Efforts (in hours)",
    D: f(sumOf("D", taskRows), totals.development.min),
    E: f(sumOf("E", taskRows), totals.development.max),
    F: "Sum of all development tasks",
  });
  out.write(proto.blank);
  out.write(proto.blank);
  out.write(proto.otherHeader, {
    B: "S.No",
    C: "Other Development Activities",
    D: "Minimum",
    E: "Maximum",
    F: "Comments",
  });
  const bug = out.write(proto.bug, {
    B: 1,
    C: "Bug Fixing",
    D: f(`D${devTotal}*${data.bugFixPercent}%`, totals.bugFixing.min),
    E: f(`E${devTotal}*${data.bugFixPercent}%`, totals.bugFixing.max),
    F: `${data.bugFixPercent}% of development hours`,
  });
  const deploy = out.write(proto.deployment, {
    B: 2,
    C: "Deployment",
    D: part.deploymentMin,
    E: part.deploymentMax,
    F: data.environments.join(", ") || null,
  });
  const post = out.write(proto.postTotal, {
    C: "Post Development Activities Total Efforts (in hours)",
    D: f(`D${bug}+D${deploy}`, totals.bugFixing.min + totals.deployment.min),
    E: f(`E${bug}+E${deploy}`, totals.bugFixing.max + totals.deployment.max),
  });
  ws.getCell(`D${grand}`).value = f(`D${devTotal}+D${post}`, totals.total.min);
  ws.getCell(`E${grand}`).value = f(`E${devTotal}+E${post}`, totals.total.max);

  for (const [header, item, label, lines] of [
    [proto.assumptionsHeader, proto.assumption, "Assumptions & Constraints", part.assumptions],
    [proto.risksHeader, proto.risk, "Risks", part.risks],
  ] as const) {
    out.write(proto.blank);
    out.write(proto.blank);
    const h = out.write(header, { B: "S.No", C: label });
    out.merge(`C${h}:F${h}`);
    lines.forEach((line, i) => {
      const r = out.write(item, { B: i + 1, C: line });
      out.merge(`C${r}:F${r}`);
    });
    if (lines.length === 0) {
      const r = out.write(item, { B: null, C: null });
      out.merge(`C${r}:F${r}`);
    }
  }

  // The template's reference notes, kept as they are.
  out.write(proto.blank);
  out.write(proto.blank);
  const notesStart = out.row + 1;
  for (const row of proto.notes) out.write(row, {}, true);
  for (const range of proto.notesMerges) {
    out.merge(range.replace(/\d+/g, (n) => String(Number(n) - proto.notesRow + notesStart)));
  }
  return ws;
}

// ---------- summary ----------

const yesNo = (n: Nfr | undefined) => (n?.enabled ? "Yes" : "No");
const singleMultiple = (items: string[]) =>
  items.length === 0 ? null : items.length === 1 ? "Single" : "Multiple";

export const DRAFT_WATERMARK = "DRAFT – not approved";

function writeSummary(ws: ExcelJS.Worksheet, data: ExportData, sheets: string[], totals: Totals) {
  const row11 = readRow(ws, 11);
  const row16 = readRow(ws, 16);
  const blank = readRow(ws, 15);
  // Clear rows 9–24 (values, shared formulas, Resources/Weeks columns) before rewriting.
  ws.unMergeCells("C9:D9");
  for (let r = 9; r <= 24; r++) {
    for (let c = 1; c <= 9; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.value = null;
    }
  }

  ws.getCell("B2").value = data.projectName;
  if (data.draft) {
    // B4 is empty in the template; the watermark changes no totals or formulas.
    const mark = ws.getCell("B4");
    mark.value = DRAFT_WATERMARK;
    mark.font = { bold: true, size: 14, color: { argb: "FFC00000" } };
    ws.headerFooter = {
      ...ws.headerFooter,
      oddHeader: `&C&"-,Bold"&KC00000${DRAFT_WATERMARK}`,
    };
  }
  ws.getCell("C5").value = data.clientName ?? null;
  ws.getCell("C6").value = data.projectManager || null;
  ws.getCell("C7").value = new Date(`${data.projectDate}T00:00:00Z`);

  const put = (
    r: number,
    proto: RowProto,
    values: Partial<Record<"B" | "C" | "D" | "E", ExcelJS.CellValue>>,
  ) => {
    const row = ws.getRow(r);
    if (proto.height) row.height = proto.height;
    proto.cells.slice(0, 6).forEach((p, i) => (row.getCell(i + 1).style = copyStyle(p.style)));
    for (const col of ["G", "H", "I"]) row.getCell(col).style = {};
    for (const [col, value] of Object.entries(values)) row.getCell(col).value = value ?? null;
  };

  const header = readRow(ws, 10);
  put(9, header, { C: "Efforts (in hours)" });
  ws.mergeCells("C9:D9");
  put(10, header, { B: "Task Summary", C: "Minimum", D: "Maximum", E: "Comments" });

  let r = 10;
  const devRows: number[] = [];
  sheets.forEach((sheet, i) => {
    r += 1;
    devRows.push(r);
    const quoted = `'${sheet.replace(/'/g, "''")}'`;
    put(r, row11, {
      B: sheet,
      C: f(`${quoted}!D6`, totals.parts[i].total.min),
      D: f(`${quoted}!E6`, totals.parts[i].total.max),
      E: "Development and post-development",
    });
  });
  const devRange = (col: string) =>
    devRows.length ? `SUM(${col}${devRows[0]}:${col}${devRows[devRows.length - 1]})` : "0";
  const overheadRows: number[] = [];
  for (const [label, o, value] of [
    ["QA Estimates", data.qa, totals.qa],
    ["PM Estimates", data.pm, totals.pm],
  ] as const) {
    if (!o.enabled || !value) continue;
    r += 1;
    overheadRows.push(r);
    put(r, row11, {
      B: label,
      C: f(`${devRange("C")}*${o.percent}%`, value.min),
      D: f(`${devRange("D")}*${o.percent}%`, value.max),
      E: `${o.percent}% of development`,
    });
  }
  r += 1;
  put(r, blank, {});
  const totalRow = r + 1;
  const all = [...devRows, ...overheadRows];
  put(totalRow, row16, {
    B: "Total Estimates",
    C: f(all.length ? `SUM(C${all[0]}:C${all[all.length - 1]})` : "0", totals.total.min),
    D: f(all.length ? `SUM(D${all[0]}:D${all[all.length - 1]})` : "0", totals.total.max),
  });

  // Price block: the rate cell drives both cost formulas.
  const rateRow = totalRow + 2;
  put(totalRow + 1, blank, {});
  put(rateRow, row11, {
    B: "Hourly rate (USD)",
    C: data.rate,
    E: "Change it here to update the cost",
  });
  put(rateRow + 1, row16, { B: "Cost (Min)", C: f(`C${totalRow}*C${rateRow}`, totals.cost.min) });
  put(rateRow + 2, row16, { B: "Cost (Max)", C: f(`D${totalRow}*C${rateRow}`, totals.cost.max) });
  for (const n of [rateRow, rateRow + 1, rateRow + 2]) ws.getCell(`C${n}`).numFmt = '"$"#,##0';
  if (rateRow + 2 >= 25) throw new Error("Summary rows overflow into Special Considerations");

  // Special considerations, rows 27–34 (C = action, E = comments); no placeholders left.
  const nfrNote = (n: Nfr | undefined) => (n?.enabled ? n.note || null : null);
  const extras = [
    data.compliance.length ? `Compliance: ${data.compliance.join(", ")}` : "",
    data.nfr.accessibility?.enabled
      ? `Accessibility${data.nfr.accessibility.note ? `: ${data.nfr.accessibility.note}` : ""}`
      : "",
    data.otherConsiderations,
  ].filter(Boolean);
  const special: [number, ExcelJS.CellValue, ExcelJS.CellValue][] = [
    [27, data.applicationTypes.join(", ") || null, null],
    [28, singleMultiple(data.operatingSystems), data.operatingSystems.join(", ") || null],
    [29, singleMultiple(data.browsers), data.browsers.join(", ") || null],
    [30, data.hosting.join(", ") || null, data.environments.join(", ") || null],
    [31, yesNo(data.nfr.performance), nfrNote(data.nfr.performance)],
    [32, yesNo(data.nfr.security), nfrNote(data.nfr.security)],
    [33, yesNo(data.nfr.documentation), nfrNote(data.nfr.documentation)],
    [34, extras.length ? "Yes" : "No", extras.join(". ") || null],
  ];
  for (const [n, action, comment] of special) {
    ws.getCell(`C${n}`).value = action;
    ws.getCell(`E${n}`).value = comment;
  }
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

// ---------- checks ----------

/** Text that only the template's placeholders and samples contain; never allowed in output. */
async function templateOnlyTexts(template: ExcelJS.Workbook): Promise<Set<string>> {
  const texts = new Set<string>(["[Project Name]", "dd/mm/yyyy"]);
  for (const ws of template.worksheets) {
    ws.eachRow((row) => {
      for (const v of row.values as ExcelJS.CellValue[]) {
        if (typeof v !== "string") continue;
        const t = v.trim();
        if (/^<.*>$/.test(t) || /^(Sub task|Task) -\s?\d+/.test(t)) texts.add(t);
        if (ws.name === "Questions" && t.length > 3) texts.add(t);
      }
    });
  }
  return texts;
}

/** Throws rather than return a file with broken references or template placeholders. */
export function checkWorkbook(wb: ExcelJS.Workbook, forbidden: Set<string>) {
  const names = new Set(wb.worksheets.map((ws) => ws.name));
  for (const ws of wb.worksheets) {
    ws.eachRow((row, n) => {
      row.eachCell((cell) => {
        const v = cell.value;
        if (v && typeof v === "object" && "formula" in v && v.formula) {
          for (const m of v.formula.matchAll(/'((?:[^']|'')+)'!/g)) {
            const sheet = m[1].replace(/''/g, "'");
            if (!names.has(sheet))
              throw new Error(`${ws.name}!${cell.address} refers to missing sheet ${sheet}`);
          }
        }
        if (typeof v === "string" && forbidden.has(v.trim())) {
          throw new Error(
            `${ws.name}!${cell.address} (row ${n}) still has template text "${v.trim()}"`,
          );
        }
      });
    });
  }
}

// ---------- entry point ----------

export async function buildWorkbook(
  data: ExportData,
): Promise<{ buffer: Buffer; totals: Totals; sheets: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  const forbidden = await templateOnlyTexts(wb);
  const prototypeSheet = wb.getWorksheet(PROTOTYPE_SHEET);
  const summary = wb.getWorksheet("Summary");
  if (!prototypeSheet || !summary)
    throw new Error("Template changed: missing Summary or development sheet");
  const proto = devPrototypes(prototypeSheet);

  const totals = computeTotals({
    parts: data.parts.map((p) => ({
      part: p.sheetLabel,
      tasks: p.tasks.map((t) => ({
        subTasks: t.subTasks.map((s) => ({
          minTenths: toTenths(s.min),
          maxTenths: toTenths(s.max),
        })),
      })),
      deploymentMinTenths: toTenths(p.deploymentMin),
      deploymentMaxTenths: toTenths(p.deploymentMax),
    })),
    qa: data.qa,
    pm: data.pm,
    bugFixPercent: data.bugFixPercent,
    rate: data.rate,
  });

  for (const name of TEMPLATE_SHEETS) {
    const ws = wb.getWorksheet(name);
    if (ws) wb.removeWorksheet(ws.id);
  }
  const sheets = sheetNames(data.parts.map((p) => p.sheetLabel));
  data.parts.forEach((part, i) => writeDevSheet(wb, proto, sheets[i], data, part, totals.parts[i]));
  writeSummary(summary, data, sheets, totals);

  checkWorkbook(wb, forbidden);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, totals, sheets };
}
