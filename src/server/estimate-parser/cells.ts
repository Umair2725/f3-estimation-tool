// Small, pure helpers for reading cells (specs/estimate-file-parsing).
import type ExcelJS from "exceljs";

/** Cell text with rich text, hyperlinks and formula results flattened; "" when empty. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value)
      return value.richText
        .map((r) => r.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result !== undefined && value.result !== null) {
      return cellText(value.result as ExcelJS.CellValue);
    }
  }
  return "";
}

export type HoursRead = {
  hours: number;
  formula?: string;
  missingResult?: boolean;
  invalid?: boolean;
};

/** Hours from a number, a numeric string or a formula's saved result; rounded to 0.1. */
export function readHours(value: ExcelJS.CellValue): HoursRead {
  const round = (n: number) => Math.round(n * 10) / 10;
  if (value === null || value === undefined || value === "") return { hours: 0 };
  if (typeof value === "number")
    return value < 0 ? { hours: 0, invalid: true } : { hours: round(value) };
  if (typeof value === "string") {
    const n = Number(value.replace(/[^\d.-]/g, ""));
    if (value.trim() === "") return { hours: 0 };
    return Number.isFinite(n) && n >= 0 && /\d/.test(value)
      ? { hours: round(n) }
      : { hours: 0, invalid: true };
  }
  if (typeof value === "object") {
    const formula =
      "formula" in value && value.formula
        ? String(value.formula)
        : "sharedFormula" in value && value.sharedFormula
          ? String(value.sharedFormula)
          : undefined;
    if (formula !== undefined || "result" in value) {
      const result = (value as { result?: unknown }).result;
      if (typeof result === "number") {
        return result < 0
          ? { hours: 0, formula, invalid: true }
          : { hours: round(result), formula };
      }
      if (result && typeof result === "object" && "error" in result)
        return { hours: 0, formula, invalid: true };
      return { hours: 0, formula, missingResult: true };
    }
  }
  return { hours: 0, invalid: true };
}

export function hasHoursValue(value: ExcelJS.CellValue): boolean {
  return value !== null && value !== undefined && value !== "";
}

/** The percentage in a formula like `D31*0.25`, `D31*25%`, `SUM(C11:C12)*0.3` or `D31*25/100`. */
export function percentFromFormula(formula: string | undefined): number | null {
  if (!formula) return null;
  const f = formula.replace(/\s+/g, "");
  let m = f.match(/\*(\d+(?:\.\d+)?)%$/);
  if (m) return round1(Number(m[1]));
  m = f.match(/\*(\d+(?:\.\d+)?)\/100$/);
  if (m) return round1(Number(m[1]));
  m = f.match(/\*(0?\.\d+|1(?:\.0+)?)$/);
  if (m) return round1(Number(m[1]) * 100);
  m = f.match(/^(0?\.\d+)\*/);
  if (m) return round1(Number(m[1]) * 100);
  return null;
}
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Template placeholders: "Task -1", "Sub task -3", "<Research Task …1>", "<List down …>". */
export function isPlaceholder(text: string): boolean {
  const t = text.trim();
  return /^(sub\s*)?task\s*-\s*\d+$/i.test(t) || /^<.*>$/.test(t) || /^…?n$/i.test(t);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A date as written, plus ISO when it can be read ("5th May 2025", "08/05/2025", "2025-05-08"). */
export function readDate(value: ExcelJS.CellValue): { raw: string; iso?: string } | null {
  if (value instanceof Date)
    return { raw: value.toISOString().slice(0, 10), iso: value.toISOString().slice(0, 10) };
  const raw = cellText(value);
  if (!raw || /dd\/mm\/yyyy/i.test(raw)) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const valid = (y: number, m: number, d: number) =>
    y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31
      ? `${y}-${pad(m)}-${pad(d)}`
      : undefined;
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { raw, iso: valid(+m[1], +m[2], +m[3]) };
  m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return { raw, iso: valid(+m[3], +m[2], +m[1]) }; // Folio3 writes day first
  m = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*,?\s+(\d{4})$/i);
  if (m) return { raw, iso: valid(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]) };
  m = raw.match(/^([a-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
  if (m) return { raw, iso: valid(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]) };
  return { raw };
}

/** "By: Ali / Reviewed by: Sara" → estimator and reviewer. */
export function readPeople(text: string): { estimator?: string; reviewer?: string } {
  const out: { estimator?: string; reviewer?: string } = {};
  const reviewed = text.match(/reviewed\s*by\s*:?\s*([^/|,]+)/i);
  if (reviewed) out.reviewer = reviewed[1].trim() || undefined;
  const by = text
    .replace(/reviewed\s*by\s*:?\s*[^/|,]+/i, "")
    .match(/(?:^|[\s/|,])by\s*:?\s*([^/|,]+)/i);
  if (by && !/^<.*>$/.test(by[1].trim())) out.estimator = by[1].trim() || undefined;
  return out;
}

/** The last bracketed text: "Patient Portal (React Native)" → "React Native". */
export function readStack(text: string): string | undefined {
  const all = [...text.matchAll(/\(([^()]+)\)/g)];
  const last = all.at(-1)?.[1].trim();
  return last && !/^<.*>$/.test(last) ? last : undefined;
}
