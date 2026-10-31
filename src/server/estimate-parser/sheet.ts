// Reads one development sheet by labels (specs/estimate-file-parsing; design decision 3).
import type ExcelJS from "exceljs";
import {
  cellText,
  hasHoursValue,
  isPlaceholder,
  percentFromFormula,
  readDate,
  readHours,
  readPeople,
  readStack,
} from "./cells";
import type { MinMax, ParsedSheet, ParsedTask, ParseWarning, SheetKind } from "./types";

type Columns = { sno: number; task: number; min: number; max: number; comments: number | null };
type Section = "tasks" | "other" | "research" | "assumptions" | "risks" | "notes";

const MAX_HEADER_ROW = 30;
const TOLERANCE = 0.05;

const colLetter = (n: number) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26))
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

function findHeader(ws: ExcelJS.Worksheet): { row: number; cols: Columns } | null {
  for (let r = 1; r <= Math.min(MAX_HEADER_ROW, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const cols: Partial<Columns> = {};
    for (let c = 1; c <= Math.min(30, ws.columnCount || 30); c++) {
      const t = cellText(row.getCell(c).value)
        .toLowerCase()
        .replace(/[^a-z]/g, "");
      if (!t) continue;
      if (
        cols.sno === undefined &&
        (t === "sno" || t === "srno" || t === "sr" || t === "no" || t === "serialno")
      )
        cols.sno = c;
      else if (
        cols.task === undefined &&
        (t === "task" || t === "tasks" || t === "feature" || t === "taskname")
      )
        cols.task = c;
      else if (cols.min === undefined && t.startsWith("min")) cols.min = c;
      else if (cols.max === undefined && t.startsWith("max")) cols.max = c;
      else if (
        cols.comments === undefined &&
        (t.startsWith("comment") || t === "notes" || t === "remarks")
      )
        cols.comments = c;
    }
    if (cols.sno && cols.task && cols.min && cols.max) {
      return {
        row: r,
        cols: {
          sno: cols.sno,
          task: cols.task,
          min: cols.min,
          max: cols.max,
          comments: cols.comments ?? null,
        },
      };
    }
  }
  return null;
}

function sectionOf(label: string): Section | "devTotal" | "postTotal" | "grandTotal" | null {
  const l = label.toLowerCase();
  if (/^development total|^total development/.test(l)) return "devTotal";
  if (/^post development.*total/.test(l)) return "postTotal";
  if (/^grand total/.test(l)) return "grandTotal";
  if (/^other development activit/.test(l)) return "other";
  if (/^research task/.test(l) && !l.startsWith("<")) return "research";
  if (/^research total/.test(l)) return "research";
  if (/^assumptions?\b/.test(l)) return "assumptions";
  if (/^risks?\b/.test(l)) return "risks";
  if (/^notes?\b/.test(l)) return "notes";
  return null;
}

function isNumberedSno(value: ExcelJS.CellValue): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  return /^\s*\d+\s*[.)]?\s*$/.test(cellText(value));
}

const ENV_WORDS =
  /^(staging|production|app ?store|play ?store|google play|uat|qa environment|testing environment)\b/i;

export function readDevSheet(
  ws: ExcelJS.Worksheet,
  kind: SheetKind,
  warnings: ParseWarning[],
): ParsedSheet {
  const sheet: ParsedSheet = {
    name: ws.name,
    kind,
    status: "ok",
    tasks: [],
    activities: [],
    environments: [],
    bugFixPercent: null,
    development: { min: 0, max: 0 },
    assumptions: [],
    risks: [],
  };
  const warn = (message: string, row?: number, col?: number) =>
    warnings.push({
      sheet: ws.name,
      row,
      cell: row && col ? `${colLetter(col)}${row}` : undefined,
      message,
    });

  const header = findHeader(ws);
  readHeaderDetails(ws, header?.row ?? 8, sheet);
  if (!sheet.stack) sheet.stack = readStack(ws.name);
  if (!header) {
    sheet.status = "no-table";
    warn("No table header (S.No / Task / Minimum / Maximum) found; the sheet was skipped");
    return sheet;
  }
  const { cols } = header;

  let section: Section = "tasks";
  let current: ParsedTask | null = null;
  let skeletonRows = 0;
  let missingResults = 0;
  const seenSno = new Map<string, number>();
  let fileDevelopment: MinMax | undefined;
  let fileGrand: MinMax | undefined;
  let bugRow: { formula?: string; min: number; max: number } | null = null;
  const fileTaskTotals = new Map<ParsedTask, MinMax>();

  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = cellText(row.getCell(cols.task).value);
    const snoValue = row.getCell(cols.sno).value;
    const sno = cellText(snoValue);
    const minCell = row.getCell(cols.min).value;
    const maxCell = row.getCell(cols.max).value;
    const comment = cols.comments ? cellText(row.getCell(cols.comments).value) : "";
    const min = readHours(minCell);
    const max = readHours(maxCell);
    // Checked only on rows whose hours are used (Sub tasks and activities).
    const checkHours = () => {
      if (min.missingResult || max.missingResult) missingResults++;
      if (min.invalid) warn(`Min hours aren't a valid number`, r, cols.min);
      if (max.invalid) warn(`Max hours aren't a valid number`, r, cols.max);
    };
    const hasHours =
      (hasHoursValue(minCell) || hasHoursValue(maxCell)) && (min.hours > 0 || max.hours > 0);

    // Notes typed outside the table, for example a reviewer's question in column A.
    for (let c = 1; c < Math.min(cols.sno, cols.task); c++) {
      const outside = cellText(row.getCell(c).value);
      if (outside && section !== "notes") warn(`Note outside the table: "${outside}"`, r, c);
    }

    const next = label ? sectionOf(label) : null;
    if (next === "devTotal") {
      fileDevelopment = {
        min: min.missingResult ? NaN : min.hours,
        max: max.missingResult ? NaN : max.hours,
      };
      current = null;
      continue;
    }
    if (next === "postTotal" || next === "grandTotal") continue;
    if (next && next !== section && !(next === "research" && /^research total/i.test(label))) {
      section = next;
      current = null;
      continue;
    }
    if (next === "research" && /^research total/i.test(label)) continue;
    if (section === "notes") continue;

    if (section === "tasks" || section === "research") {
      if (!label || isPlaceholder(label)) {
        if (isNumberedSno(snoValue) && !hasHours) skeletonRows++;
        continue;
      }
      if (isNumberedSno(snoValue)) {
        const key = sno.replace(/\D/g, "");
        if (section === "tasks") {
          if (seenSno.has(key))
            warn(`Duplicate S.No ${key} (also on row ${seenSno.get(key)})`, r, cols.sno);
          else seenSno.set(key, r);
        }
        current = {
          title: label,
          row: r,
          research: section === "research",
          comment,
          subTasks: [],
          min: 0,
          max: 0,
        };
        sheet.tasks.push(current);
        if (hasHoursValue(minCell) || hasHoursValue(maxCell)) {
          fileTaskTotals.set(current, {
            min: min.missingResult ? NaN : min.hours,
            max: max.missingResult ? NaN : max.hours,
          });
        }
        continue;
      }
      if (!hasHours && !comment) continue;
      if (!current) {
        current = {
          title: ws.name,
          row: r,
          research: section === "research",
          comment: "",
          subTasks: [],
          min: 0,
          max: 0,
        };
        sheet.tasks.push(current);
        warn(`Sub task "${label}" has no Task above it; grouped under "${ws.name}"`, r, cols.task);
      }
      if (min.hours > max.hours)
        warn(`Min is more than Max (${min.hours} > ${max.hours}) for "${label}"`, r, cols.min);
      checkHours();
      current.subTasks.push({ title: label, min: min.hours, max: max.hours, comment, row: r });
      continue;
    }

    if (section === "other") {
      if (!label || isPlaceholder(label)) continue;
      if (/^bug\s*fix/i.test(label)) {
        bugRow = { formula: min.formula ?? max.formula, min: min.hours, max: max.hours };
        continue;
      }
      if (ENV_WORDS.test(label) && !hasHours) {
        sheet.environments.push(label);
        continue;
      }
      if (!hasHours) continue;
      if (min.hours > max.hours)
        warn(`Min is more than Max (${min.hours} > ${max.hours}) for "${label}"`, r, cols.min);
      checkHours();
      sheet.activities.push({ title: label, min: min.hours, max: max.hours, comment, row: r });
      continue;
    }

    if (section === "assumptions" || section === "risks") {
      // Text sits in the task column, or in the merged block that starts there.
      const text = label || cellText(row.getCell(cols.task + 1).value);
      if (!text || isPlaceholder(text) || /^s\.?\s*no$/i.test(text)) continue;
      if (/^list down assumption/i.test(text)) continue;
      (section === "assumptions" ? sheet.assumptions : sheet.risks).push(text);
    }
  }

  // A Task with its own hours but no Sub tasks keeps them as one row; one with neither (such
  // as the template's sample "Data Ingestion" block) is dropped.
  sheet.tasks = sheet.tasks.filter((task) => {
    if (task.subTasks.length > 0) return true;
    const own = fileTaskTotals.get(task);
    if (!own || !(own.min > 0 || own.max > 0)) return false;
    task.subTasks.push({
      title: task.title,
      min: own.min || 0,
      max: own.max || 0,
      comment: task.comment,
      row: task.row,
    });
    fileTaskTotals.delete(task);
    return true;
  });

  // Recalculate from Sub tasks; the file's own totals are only compared.
  for (const task of sheet.tasks) {
    task.min = round(task.subTasks.reduce((s, x) => s + x.min, 0));
    task.max = round(task.subTasks.reduce((s, x) => s + x.max, 0));
    const fileTotal = fileTaskTotals.get(task);
    if (fileTotal && task.subTasks.length && differs(fileTotal, task)) {
      warn(
        `Task "${task.title}" shows ${range(fileTotal)} h in the file, but its Sub tasks add up to ${range(task)} h`,
        task.row,
        cols.min,
      );
    }
  }
  const devTasks = sheet.tasks.filter((t) => !t.research);
  sheet.development = {
    min: round(devTasks.reduce((s, t) => s + t.min, 0)),
    max: round(devTasks.reduce((s, t) => s + t.max, 0)),
  };
  if (fileDevelopment && differs(fileDevelopment, sheet.development)) {
    warn(
      `The file's development total is ${range(fileDevelopment)} h, but its Sub tasks add up to ${range(sheet.development)} h`,
    );
  }
  if (
    fileDevelopment &&
    Number.isFinite(fileDevelopment.min) &&
    Number.isFinite(fileDevelopment.max)
  ) {
    sheet.fileDevelopment = fileDevelopment;
  }

  if (bugRow) {
    sheet.bugFixPercent =
      percentFromFormula(bugRow.formula) ??
      (sheet.development.min > 0 ? Math.round((bugRow.min / sheet.development.min) * 100) : null);
  }
  if (missingResults > 0)
    warn("Some formulas have no saved results; totals were recalculated from the Sub tasks");
  void fileGrand;

  const hasData = sheet.tasks.some((t) => t.subTasks.length > 0) || sheet.activities.length > 0;
  if (!hasData) {
    sheet.status = "no-data";
    warn(
      skeletonRows > 0
        ? "Skeleton sheet: numbered rows but no Task text or hours"
        : "No Tasks or hours on this sheet",
    );
  }
  return sheet;
}

/** Title, date, "By / Reviewed by" and stack from the rows above the table. */
function readHeaderDetails(ws: ExcelJS.Worksheet, headerRow: number, sheet: ParsedSheet) {
  for (let r = 1; r < headerRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(12, ws.columnCount || 12); c++) {
      const value = row.getCell(c).value;
      const text = cellText(value);
      if (!text) continue;
      if (/\bby\b/i.test(text) && /^(by|reviewed|.*\/\s*reviewed)/i.test(text)) {
        const people = readPeople(text);
        sheet.estimator ??= people.estimator;
        sheet.reviewer ??= people.reviewer;
        continue;
      }
      if (!sheet.date) {
        const date = value instanceof Date ? readDate(value) : null;
        const textDate = !date && /\d/.test(text) && text.length <= 30 ? readDate(value) : null;
        if (date?.iso || textDate?.iso) {
          sheet.date = (date ?? textDate)!;
          continue;
        }
      }
      if (!sheet.title && text.length > 3 && !/grand total|^\d+(\.\d+)?$/i.test(text)) {
        sheet.title = text;
        sheet.stack = readStack(text);
      }
    }
  }
}

const round = (n: number) => Math.round(n * 10) / 10;
const range = (m: MinMax) => `${fmt(m.min)}–${fmt(m.max)}`;
const fmt = (n: number) => (Number.isFinite(n) ? String(round(n)) : "?");
function differs(file: MinMax, calc: MinMax) {
  const off = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) > TOLERANCE;
  return off(file.min, calc.min) || off(file.max, calc.max);
}
