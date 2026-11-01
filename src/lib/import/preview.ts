// The per-project import preview (specs/historical-import "Preview before approval",
// "Corrections on the preview"). Pure: the page and the approval both use it, so what is
// approved is exactly what was shown.
import { PART_LABELS, PART_VALUES, type Part } from "@/lib/estimation/options";

/** The parts of a parse result the import keeps (stored as JSON on the imported project). */
export type StoredParse = {
  fingerprint: string;
  templateVersion: string | null;
  summary: {
    projectName: string | null;
    clientName: string | null;
    projectManager: string | null;
    date: { raw: string; iso?: string } | null;
    qaPercent: number | null;
    pmPercent: number | null;
  };
  sheets: {
    name: string;
    kind: string;
    status: "ok" | "no-data" | "no-table" | "skipped";
    stack?: string;
    bugFixPercent: number | null;
    tasks: {
      title: string;
      row: number;
      research: boolean;
      subTasks: {
        title: string;
        min: number;
        max: number;
        comment: string;
        row: number;
        actual?: number;
      }[];
    }[];
  }[];
  warnings: { sheet?: string; row?: number; cell?: string; message: string }[];
};

export type DuplicateChoice = "skip" | "keep" | "new-version" | "different";

export type ImportDecisions = {
  projectName?: string;
  clientName?: string;
  sheetParts?: Record<string, Part | "skip">;
  renames?: Record<string, string>; // "sheet!row" → new title
  excluded?: string[]; // "sheet!row"
  swapFiles?: boolean;
  duplicate?: DuplicateChoice;
};

export type PreviewSubTask = {
  key: string;
  title: string;
  originalTitle: string;
  min: number;
  max: number;
  comment: string;
  row: number;
  excluded: boolean;
};

export type PreviewSheet = {
  name: string;
  kind: string;
  status: StoredParse["sheets"][number]["status"];
  part: Part | null; // null = needs a part
  skipped: boolean;
  label: string | null; // "Backend (Node)"
  bugFixPercent: number | null;
  tasks: {
    key: string;
    title: string;
    originalTitle: string;
    row: number;
    research: boolean;
    excluded: boolean;
    subTasks: PreviewSubTask[];
  }[];
};

export type ImportPreview = {
  projectName: string;
  clientName: string;
  projectManager: string;
  dateIso: string | null;
  qaPercent: number | null;
  pmPercent: number | null;
  sheets: PreviewSheet[];
  /** Development sheets that still need a part (approval is blocked until there are none). */
  unassigned: string[];
  counts: { tasks: number; subTasks: number };
};

const isPart = (kind: string): kind is Part => (PART_VALUES as readonly string[]).includes(kind);

export function buildPreview(parsed: StoredParse, decisions: ImportDecisions = {}): ImportPreview {
  const excluded = new Set(decisions.excluded ?? []);
  const renames = decisions.renames ?? {};
  const sheets: PreviewSheet[] = parsed.sheets
    .filter((s) => s.status === "ok")
    .map((s) => {
      const chosen = decisions.sheetParts?.[s.name];
      const skipped = chosen === "skip";
      const part = skipped
        ? null
        : ((chosen as Part | undefined) ?? (isPart(s.kind) ? s.kind : null));
      return {
        name: s.name,
        kind: s.kind,
        status: s.status,
        part,
        skipped,
        label: part ? (s.stack ? `${PART_LABELS[part]} (${s.stack})` : PART_LABELS[part]) : null,
        bugFixPercent: s.bugFixPercent,
        tasks: s.tasks.map((t) => {
          const taskKey = `${s.name}!${t.row}`;
          const taskExcluded = excluded.has(taskKey);
          return {
            key: taskKey,
            title: renames[taskKey]?.trim() || t.title,
            originalTitle: t.title,
            row: t.row,
            research: t.research,
            excluded: taskExcluded,
            subTasks: t.subTasks.map((st) => {
              const key = `${s.name}!${st.row}`;
              return {
                key,
                title: renames[key]?.trim() || st.title,
                originalTitle: st.title,
                min: st.min,
                max: st.max,
                comment: st.comment,
                row: st.row,
                excluded: taskExcluded || excluded.has(key),
              };
            }),
          };
        }),
      };
    });

  const included = sheets.filter((s) => !s.skipped && s.part);
  const keptTasks = included.flatMap((s) => s.tasks.filter((t) => !t.excluded));
  return {
    projectName: decisions.projectName?.trim() || parsed.summary.projectName || "",
    clientName: decisions.clientName?.trim() || parsed.summary.clientName || "",
    projectManager: parsed.summary.projectManager ?? "",
    dateIso: parsed.summary.date?.iso ?? null,
    qaPercent: parsed.summary.qaPercent,
    pmPercent: parsed.summary.pmPercent,
    sheets,
    unassigned: sheets.filter((s) => !s.skipped && !s.part).map((s) => s.name),
    counts: {
      tasks: keptTasks.length,
      subTasks: keptTasks.reduce((n, t) => n + t.subTasks.filter((st) => !st.excluded).length, 0),
    },
  };
}
