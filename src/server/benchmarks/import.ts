import "server-only";
import ExcelJS from "exceljs";
import type { CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { readCsv, readRows, type BenchmarkRow, type RowProblem } from "@/lib/benchmarks/rows";
import { reindexBenchmarkSoftly } from "../matching/hooks";
import { assertAccess, ServiceError } from "../service-error";
import { recalculate } from "./benchmarks";

// Importing the seed CSV or the survey workbook (specs/feature-benchmarks "Import from the seed
// list or the survey"). Stateless: the preview parses the file, and applying parses it again.

// Server actions accept 1 MB; the seed CSV and the survey are about 25 KB.
const MAX_BYTES = 1024 * 1024;
type File = { fileName: string; bytes: Uint8Array };

async function readFile(file: File): Promise<{ rows: BenchmarkRow[]; problems: RowProblem[] }> {
  if (file.bytes.byteLength > MAX_BYTES)
    throw new ServiceError("The file is larger than 1 MB", 400);
  const name = file.fileName.toLowerCase();
  if (name.endsWith(".csv")) return readCsv(new TextDecoder().decode(file.bytes));
  if (!name.endsWith(".xlsx"))
    throw new ServiceError("Choose the .csv seed file or the .xlsx survey", 400);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file.bytes as unknown as ArrayBuffer);
  } catch {
    throw new ServiceError("This file isn't a readable Excel workbook", 400);
  }
  const ws = wb.getWorksheet("Features");
  if (!ws) throw new ServiceError('The workbook has no "Features" sheet', 400);
  const cell = (v: ExcelJS.CellValue): string | number | Date | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "object" && !(v instanceof Date)) {
      if ("result" in v) return (v.result as string | number) ?? null;
      if ("richText" in v) return v.richText.map((t) => t.text).join("");
      if ("text" in v) return String(v.text);
      return null;
    }
    return v as string | number | Date;
  };
  const rows: (string | number | Date | null)[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const values = row.values as ExcelJS.CellValue[];
    rows[n - 1] = values.map(cell);
  });
  const [header = [], ...data] = rows.map((r) => r ?? []);
  return readRows(header, data, 2);
}

type Existing = Awaited<ReturnType<typeof loadExisting>>;
const loadExisting = (codes: string[]) =>
  getDb().featureBenchmark.findMany({ where: { code: { in: codes } } });

const FIELDS = [
  "module",
  "feature",
  "part",
  "stack",
  "included",
  "preAiMinTenths",
  "preAiMaxTenths",
  "preAiSource",
] as const;

function diff(row: BenchmarkRow, existing: Existing[number] | undefined) {
  if (!existing) return "new" as const;
  const changed =
    FIELDS.some((f) => (existing[f] ?? "") !== ((row[f] as unknown) ?? "")) ||
    (row.experiencedTenths !== null && row.experiencedTenths !== existing.experiencedTenths) ||
    (row.juniorTenths !== null && row.juniorTenths !== existing.juniorTenths);
  return changed ? ("changed" as const) : ("unchanged" as const);
}

export type ImportPreview = {
  fileName: string;
  counts: { new: number; changed: number; unchanged: number; problems: number; withHours: number };
  rows: {
    row: number;
    code: string;
    feature: string;
    status: "new" | "changed" | "unchanged";
    hours: string;
  }[];
  problems: RowProblem[];
};

export async function previewImport(actor: CurrentUser | null, file: File): Promise<ImportPreview> {
  assertAccess(actor, "settings.manage");
  const { rows, problems } = await readFile(file);
  const existing = new Map((await loadExisting(rows.map((r) => r.code))).map((b) => [b.code, b]));
  const out = rows.map((r) => ({
    row: r.row,
    code: r.code,
    feature: r.feature,
    status: diff(r, existing.get(r.code)),
    hours:
      r.experiencedTenths === null
        ? ""
        : `${r.experiencedTenths / 10}–${(r.juniorTenths ?? r.experiencedTenths) / 10} h`,
  }));
  return {
    fileName: file.fileName,
    counts: {
      new: out.filter((r) => r.status === "new").length,
      changed: out.filter((r) => r.status === "changed").length,
      unchanged: out.filter((r) => r.status === "unchanged").length,
      problems: problems.length,
      withHours: rows.filter((r) => r.experiencedTenths !== null).length,
    },
    rows: out,
    problems,
  };
}

/** Applies every good row; rows with problems are skipped (they were listed in the preview). */
export async function applyImport(actor: CurrentUser | null, file: File) {
  assertAccess(actor, "settings.manage");
  const { rows, problems } = await readFile(file);
  if (rows.length === 0) throw new ServiceError("There are no rows to import", 400);
  const touched: string[] = [];
  await getDb().$transaction(
    async (tx) => {
      for (const r of rows) {
        const confirmedNote = r.confirmedBy ? `Confirmed in survey by ${r.confirmedBy}` : "";
        const notes = [r.notes, confirmedNote].filter(Boolean).join(" · ");
        const data = {
          module: r.module,
          feature: r.feature,
          part: r.part,
          stack: r.stack,
          included: r.included,
          preAiMinTenths: r.preAiMinTenths,
          preAiMaxTenths: r.preAiMaxTenths,
          preAiSource: r.preAiSource || null,
          ...(r.aiTools ? { aiTools: r.aiTools } : {}),
          ...(notes ? { notes } : {}),
        };
        const existing = await tx.featureBenchmark.findUnique({ where: { code: r.code } });
        const b = existing
          ? await tx.featureBenchmark.update({ where: { id: existing.id }, data })
          : await tx.featureBenchmark.create({
              data: { ...data, code: r.code, createdById: actor.id },
            });
        if (!existing) {
          await tx.benchmarkChange.create({
            data: {
              benchmarkId: b.id,
              kind: "IMPORT",
              note: `Imported from ${file.fileName}`,
              actorId: actor.id,
            },
          });
        }
        // AI-era hours in the file are Survey observations; the same value is not added twice.
        if (r.experiencedTenths !== null) {
          const observedOn = new Date(
            `${r.date ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`,
          );
          const note = [`Imported from ${file.fileName}`, r.filledBy && `filled by ${r.filledBy}`]
            .filter(Boolean)
            .join(", ");
          for (const [level, hoursTenths] of [
            ["EXPERIENCED", r.experiencedTenths],
            ["JUNIOR", r.juniorTenths],
          ] as const) {
            if (hoursTenths === null) continue;
            const same = await tx.benchmarkObservation.count({
              where: { benchmarkId: b.id, source: "SURVEY", level, hoursTenths, observedOn },
            });
            if (same) continue;
            await tx.benchmarkObservation.create({
              data: {
                benchmarkId: b.id,
                level,
                hoursTenths,
                observedOn,
                source: "SURVEY",
                aiTools: r.aiTools,
                note,
                createdById: actor.id,
              },
            });
          }
          await recalculate(tx, b.id);
          if (r.projectsCount !== null) {
            await tx.featureBenchmark.update({
              where: { id: b.id },
              data: { projectsCount: r.projectsCount },
            });
          }
        }
        // Only rows with AI-era hours can be indexed; the rest never had an entry to update.
        if (r.experiencedTenths !== null || existing?.experiencedTenths != null) touched.push(b.id);
      }
    },
    { timeout: 120_000 },
  );
  for (const id of touched) await reindexBenchmarkSoftly(id);
  return { applied: rows.length, skipped: problems.length };
}
