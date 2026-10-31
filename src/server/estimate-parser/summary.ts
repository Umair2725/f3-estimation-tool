// Reads the Summary sheet by labels (specs/estimate-file-parsing "Read the Summary").
import type ExcelJS from "exceljs";
import { cellText, isPlaceholder, percentFromFormula, readDate, readHours } from "./cells";
import type { ParsedSummary, ParseWarning } from "./types";

const CURRENT_TEMPLATE = "0.5";

type Cell = { row: number; col: number; text: string; value: ExcelJS.CellValue };

function cells(ws: ExcelJS.Worksheet, maxRow = 80, maxCol = 12): Cell[] {
  const out: Cell[] = [];
  for (let r = 1; r <= Math.min(maxRow, ws.rowCount); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= maxCol; c++) {
      const value = row.getCell(c).value;
      const text = cellText(value);
      if (text) out.push({ row: r, col: c, text, value });
    }
  }
  return out;
}

/** The first non-empty, non-placeholder cell to the right of a label on the same row. */
function rightOf(ws: ExcelJS.Worksheet, label: Cell): ExcelJS.CellValue | null {
  const row = ws.getRow(label.row);
  for (let c = label.col + 1; c <= label.col + 4; c++) {
    const value = row.getCell(c).value;
    const text = cellText(value);
    if (text && !isPlaceholder(text) && text !== label.text) return value;
  }
  return null;
}

export function readSummary(ws: ExcelJS.Worksheet, warnings: ParseWarning[]) {
  const all = cells(ws);
  const find = (re: RegExp, maxRow = 40) => all.find((c) => c.row <= maxRow && re.test(c.text));
  const warn = (message: string, row?: number) => warnings.push({ sheet: ws.name, row, message });

  const versionCell = all.find((c) => c.row <= 5 && /template\s*v\s*[\d.]+/i.test(c.text));
  const templateVersion = versionCell?.text.match(/template\s*v\s*([\d.]+)/i)?.[1] ?? null;
  if (templateVersion && templateVersion !== CURRENT_TEMPLATE) {
    warn(`The file uses template v${templateVersion}, not v${CURRENT_TEMPLATE}`, versionCell?.row);
  }

  const labelled = (re: RegExp) => {
    const label = find(re);
    return label ? rightOf(ws, label) : null;
  };
  const projectLabel = find(/^project\s*name\b/i);
  const titleRow = all.find(
    (c) => c.row === 2 && !isPlaceholder(c.text) && c.text !== "[Project Name]",
  );
  const projectName = projectLabel
    ? cellText(rightOf(ws, projectLabel)) || null
    : (titleRow?.text ?? null);

  const summary: ParsedSummary = {
    projectName: projectName && projectName !== "[Project Name]" ? projectName : null,
    clientName: cellText(labelled(/^client(\s*name)?$/i)) || null,
    projectManager: cellText(labelled(/^project\s*manager$/i)) || null,
    date: readDate(labelled(/^date$/i)),
    qaPercent: null,
    pmPercent: null,
    considerations: [],
  };
  if (summary.projectManager === "User name goes here") summary.projectManager = null;

  // Summary rows between the "Task Summary" header and the Total.
  const header = find(/^task summary$/i);
  const totalRow = all.find((c) => header && c.row > header.row && /^total\b/i.test(c.text));
  const known = new Set<number>();
  if (header) {
    const devMin: number[] = [];
    let qa: { formula?: string; min: number } | null = null;
    let pm: { formula?: string; min: number } | null = null;
    const end = totalRow?.row ?? header.row + 12;
    for (let r = header.row + 1; r <= end; r++) {
      known.add(r);
      const row = ws.getRow(r);
      const label = cellText(row.getCell(header.col).value);
      if (!label) continue;
      const minValue = row.getCell(header.col + 1).value;
      const min = readHours(minValue);
      if (/\bqa\b/i.test(label)) qa = { formula: min.formula, min: min.hours };
      else if (/\bpm\b|project management/i.test(label))
        pm = { formula: min.formula, min: min.hours };
      else if (!/^total|\bgd\b/i.test(label)) devMin.push(min.hours);
    }
    const dev = devMin.reduce((s, n) => s + n, 0);
    const pct = (row: { formula?: string; min: number } | null) =>
      row
        ? (percentFromFormula(row.formula) ??
          (dev > 0 && row.min > 0 ? Math.round((row.min / dev) * 100) : null))
        : null;
    summary.qaPercent = pct(qa);
    summary.pmPercent = pct(pm);
  }

  // Price rows the export writes are known, not free-form.
  for (const c of all) {
    if (/^(hourly rate|cost\b|efforts|task summary|resources|weeks|max)/i.test(c.text))
      known.add(c.row);
  }

  // Special considerations: rows after the label, as label / action / comments.
  const special = find(/special considerations/i, 60);
  if (special) {
    const headerRow = special.row + 1;
    known.add(special.row);
    known.add(headerRow);
    for (let r = headerRow + 1; r <= headerRow + 20; r++) {
      const row = ws.getRow(r);
      const label = cellText(row.getCell(special.col).value);
      if (!label) break;
      known.add(r);
      const clean = (v: ExcelJS.CellValue) => {
        const t = cellText(v);
        return isPlaceholder(t) ? "" : t;
      };
      const action = clean(row.getCell(special.col + 1).value);
      const comments =
        clean(row.getCell(special.col + 3).value) || clean(row.getCell(special.col + 2).value);
      summary.considerations.push({ label, action, comments: comments === action ? "" : comments });
    }
  }

  // Anything else that looks like a table of hours: 3+ consecutive rows with a label and a number.
  const rows = new Map<number, { label: boolean; number: boolean }>();
  for (const c of all) {
    if (c.row <= 8 || known.has(c.row)) continue;
    const entry = rows.get(c.row) ?? { label: false, number: false };
    if (typeof c.value === "number" || readHours(c.value).formula) entry.number = true;
    else if (!isPlaceholder(c.text)) entry.label = true;
    rows.set(c.row, entry);
  }
  let start = 0;
  let length = 0;
  const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i <= sorted.length; i++) {
    const [r, e] = sorted[i] ?? [Infinity, { label: false, number: false }];
    const isRow = e.label && e.number;
    if (isRow && length > 0 && r === start + length) length++;
    else {
      if (length >= 3)
        warn(
          `Free-form table on rows ${start}–${start + length - 1}; map it by hand if it holds estimates`,
          start,
        );
      start = isRow ? r : 0;
      length = isRow ? 1 : 0;
    }
  }

  return { summary, templateVersion };
}
