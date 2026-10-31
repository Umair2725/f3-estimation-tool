// Parses an estimate workbook (specs/estimate-file-parsing). Never throws for bad data:
// problems become warnings, and only an unreadable file is an error. No "server-only" import
// here so the local command (scripts/parse-estimate.ts) can use it; index.ts adds the marker.
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { classifySheet } from "./classify";
import { readDevSheet } from "./sheet";
import { readSummary } from "./summary";
import { PART_KINDS, type ParsedEstimate, type ParsedSheet, type ParseWarning } from "./types";

export const NOT_A_WORKBOOK = "This file isn't a readable Excel workbook";

export async function parseEstimateFile(buffer: Buffer, fileName: string): Promise<ParsedEstimate> {
  const fingerprint = createHash("sha256").update(buffer).digest("hex");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { ok: false, error: NOT_A_WORKBOOK, fingerprint, fileName };
  }
  if (wb.worksheets.length === 0)
    return { ok: false, error: NOT_A_WORKBOOK, fingerprint, fileName };

  const warnings: ParseWarning[] = [];
  const sheets: ParsedSheet[] = [];
  let summary: ReturnType<typeof readSummary> | null = null;

  for (const ws of wb.worksheets) {
    const kind = classifySheet(ws.name);
    try {
      if (kind === "SUMMARY") {
        summary = readSummary(ws, warnings);
        sheets.push(skipped(ws.name, kind));
      } else if (PART_KINDS.includes(kind) || kind === "UNKNOWN") {
        if (kind === "UNKNOWN") {
          warnings.push({
            sheet: ws.name,
            message: `The kind of sheet "${ws.name}" is unknown; assign it a part or skip it`,
          });
        }
        sheets.push(readDevSheet(ws, kind, warnings));
      } else {
        // QA, GD, PM detail sheets and Questions are listed but not read as development work.
        sheets.push(skipped(ws.name, kind));
      }
    } catch (err) {
      warnings.push({
        sheet: ws.name,
        message: `This sheet couldn't be read (${(err as Error).message})`,
      });
      sheets.push({ ...skipped(ws.name, kind), status: "no-table" });
    }
  }

  return {
    ok: true,
    fingerprint,
    fileName,
    templateVersion: summary?.templateVersion ?? null,
    summary: summary?.summary ?? {
      projectName: null,
      clientName: null,
      projectManager: null,
      date: null,
      qaPercent: null,
      pmPercent: null,
      considerations: [],
    },
    sheets,
    warnings,
  };
}

function skipped(name: string, kind: ParsedSheet["kind"]): ParsedSheet {
  return {
    name,
    kind,
    status: "skipped",
    tasks: [],
    activities: [],
    environments: [],
    bugFixPercent: null,
    development: { min: 0, max: 0 },
    assumptions: [],
    risks: [],
  };
}
