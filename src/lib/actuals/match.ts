// Matches an actuals file to the estimate (specs/actual-hours "Match file rows to the
// estimate"; design decision 5). Pure: the preview and the save both call it, so what is saved
// is exactly what was previewed, with the person's decisions applied.
import { normalizeTitle, PROPOSE_AT, similarity } from "./similarity";

export type EstimatePart = {
  partId: string;
  kind: string; // the part's enum value, e.g. "BACKEND"
  label: string; // "Backend (Node.js)"
  tasks: {
    title: string;
    subTasks: { id: string; title: string; minTenths: number; maxTenths: number }[];
  }[];
};

export type FileSheet = {
  name: string;
  kind: string; // parser's sheet kind
  tasks: {
    title: string;
    subTasks: { title: string; min: number; max: number; actual?: number; row: number }[];
  }[];
};

export type MatchDecisions = {
  /** Sheet name → estimate partId, or "skip". */
  sheetParts?: Record<string, string>;
  /** Rejected proposals, as `${fileKey}>${subTaskId}`. */
  rejected?: string[];
  /** Hours typed on the preview, by row key. */
  hours?: Record<string, number>;
};

export type MatchRow = {
  key: string; // file rows: `${sheet}!${row}`; dropped rows: `est:${subTaskId}`
  status: "MATCHED" | "UNPLANNED" | "DROPPED";
  subTaskId: string | null;
  partId: string | null;
  partLabel: string;
  taskTitle: string;
  title: string;
  estMinTenths: number;
  estMaxTenths: number;
  /** Hours; null for dropped rows. */
  actual: number | null;
  similarity: number | null;
  needsConfirmation: boolean;
  flags: string[];
  sourceSheet: string | null;
  sourceRow: number | null;
};

export type SheetAssignment = {
  name: string;
  kind: string;
  partId: string | null;
  needsAssignment: boolean;
};

export type MatchResult = {
  sheets: SheetAssignment[];
  rows: MatchRow[];
  counts: { matched: number; unplanned: number; dropped: number; toConfirm: number };
};

export const MIN_MAX_DIFFER = "Min and Max differ; Min was used";
const PART_KINDS = new Set(["BACKEND", "WEB_FRONTEND", "ADMIN_PANEL", "MOBILE", "CLOUD_INFRA"]);

type FileSub = {
  key: string;
  sheet: string;
  taskTitle: string;
  title: string;
  min: number;
  max: number;
  actual?: number;
  row: number;
};
type EstSub = {
  id: string;
  taskTitle: string;
  title: string;
  minTenths: number;
  maxTenths: number;
};

/** Greedy best pairs: exact names first, then similar ones (≥ PROPOSE_AT), each item used once. */
function pair<A, B>(
  left: A[],
  right: B[],
  name: (x: A | B) => string,
  allowed: (a: A, b: B) => boolean = () => true,
): { a: A; b: B; score: number }[] {
  const candidates: { a: A; b: B; score: number }[] = [];
  for (const a of left) {
    for (const b of right) {
      if (!allowed(a, b)) continue;
      const exact = normalizeTitle(name(a)) === normalizeTitle(name(b));
      const score = exact ? 1 : similarity(name(a), name(b));
      if (score >= PROPOSE_AT) candidates.push({ a, b, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  const usedA = new Set<A>();
  const usedB = new Set<B>();
  const out: { a: A; b: B; score: number }[] = [];
  for (const c of candidates) {
    if (usedA.has(c.a) || usedB.has(c.b)) continue;
    usedA.add(c.a);
    usedB.add(c.b);
    out.push(c);
  }
  return out;
}

export function matchActuals(
  estimate: EstimatePart[],
  file: FileSheet[],
  decisions: MatchDecisions = {},
): MatchResult {
  const rejected = new Set(decisions.rejected ?? []);
  const hours = decisions.hours ?? {};

  // 1. Sheets → parts: the person's choice, else the first sheet of the same kind.
  const claimed = new Set<string>();
  const sheets: SheetAssignment[] = file.map((sheet) => {
    const chosen = decisions.sheetParts?.[sheet.name];
    if (chosen === "skip")
      return { name: sheet.name, kind: sheet.kind, partId: null, needsAssignment: false };
    if (chosen && estimate.some((p) => p.partId === chosen)) {
      claimed.add(chosen);
      return { name: sheet.name, kind: sheet.kind, partId: chosen, needsAssignment: false };
    }
    return { name: sheet.name, kind: sheet.kind, partId: null, needsAssignment: true };
  });
  for (const s of sheets) {
    if (!s.needsAssignment) continue;
    const part = estimate.find((p) => p.kind === s.kind && !claimed.has(p.partId));
    if (part && PART_KINDS.has(s.kind)) {
      s.partId = part.partId;
      s.needsAssignment = false;
      claimed.add(part.partId);
    } else if (!PART_KINDS.has(s.kind) && s.kind !== "UNKNOWN") {
      s.needsAssignment = false; // QA, GD, PM, Questions, Summary: not development work
    }
  }

  const rows: MatchRow[] = [];
  for (const part of estimate) {
    const partSheets = sheets
      .filter((s) => s.partId === part.partId)
      .map((s) => file.find((f) => f.name === s.name)!);
    const fileSubs: FileSub[] = partSheets.flatMap((sheet) =>
      sheet.tasks.flatMap((t) =>
        t.subTasks.map((s) => ({
          key: `${sheet.name}!${s.row}`,
          sheet: sheet.name,
          taskTitle: t.title,
          ...s,
        })),
      ),
    );
    const estSubs: EstSub[] = part.tasks.flatMap((t) =>
      t.subTasks.map((s) => ({ ...s, taskTitle: t.title })),
    );
    const notRejected = (f: FileSub, e: EstSub) => !rejected.has(`${f.key}>${e.id}`);

    // 2. Tasks by name, then 3. Sub tasks inside matched Tasks.
    const fileTaskTitles = [...new Set(fileSubs.map((s) => s.taskTitle))];
    const estTaskTitles = part.tasks.map((t) => t.title);
    const taskPairs = pair(fileTaskTitles, estTaskTitles, (x) => x);
    const pairs: { a: FileSub; b: EstSub; score: number }[] = [];
    for (const tp of taskPairs) {
      pairs.push(
        ...pair(
          fileSubs.filter((s) => s.taskTitle === tp.a),
          estSubs.filter((s) => s.taskTitle === tp.b),
          (x) => x.title,
          notRejected,
        ),
      );
    }
    // Then everything left in the part (handles renamed or moved Tasks).
    const usedFile = new Set(pairs.map((p) => p.a));
    const usedEst = new Set(pairs.map((p) => p.b));
    pairs.push(
      ...pair(
        fileSubs.filter((s) => !usedFile.has(s)),
        estSubs.filter((s) => !usedEst.has(s)),
        (x) => x.title,
        notRejected,
      ),
    );

    const actualOf = (f: FileSub) => {
      const flags: string[] = [];
      let actual = f.actual ?? f.min;
      if (f.actual === undefined && f.min !== f.max) flags.push(MIN_MAX_DIFFER);
      if (hours[f.key] !== undefined) actual = hours[f.key];
      return { actual, flags };
    };

    const matchedFile = new Set<FileSub>();
    const matchedEst = new Set<EstSub>();
    for (const p of pairs) {
      matchedFile.add(p.a);
      matchedEst.add(p.b);
      const { actual, flags } = actualOf(p.a);
      const exact = normalizeTitle(p.a.title) === normalizeTitle(p.b.title);
      rows.push({
        key: p.a.key,
        status: "MATCHED",
        subTaskId: p.b.id,
        partId: part.partId,
        partLabel: part.label,
        taskTitle: p.b.taskTitle,
        title: p.b.title,
        estMinTenths: p.b.minTenths,
        estMaxTenths: p.b.maxTenths,
        actual,
        similarity: exact ? 1 : Math.round(p.score * 100) / 100,
        needsConfirmation: !exact,
        flags: exact ? flags : [...flags, `Matched "${p.a.title}" to "${p.b.title}"`],
        sourceSheet: p.a.sheet,
        sourceRow: p.a.row,
      });
    }
    for (const f of fileSubs.filter((s) => !matchedFile.has(s))) {
      const { actual, flags } = actualOf(f);
      rows.push({
        key: f.key,
        status: "UNPLANNED",
        subTaskId: null,
        partId: part.partId,
        partLabel: part.label,
        taskTitle: f.taskTitle,
        title: f.title,
        estMinTenths: 0,
        estMaxTenths: 0,
        actual,
        similarity: null,
        needsConfirmation: false,
        flags,
        sourceSheet: f.sheet,
        sourceRow: f.row,
      });
    }
    for (const e of estSubs.filter((s) => !matchedEst.has(s))) {
      rows.push({
        key: `est:${e.id}`,
        status: "DROPPED",
        subTaskId: e.id,
        partId: part.partId,
        partLabel: part.label,
        taskTitle: e.taskTitle,
        title: e.title,
        estMinTenths: e.minTenths,
        estMaxTenths: e.maxTenths,
        actual: null,
        similarity: null,
        needsConfirmation: false,
        flags: [],
        sourceSheet: null,
        sourceRow: null,
      });
    }
  }

  return {
    sheets,
    rows,
    counts: {
      matched: rows.filter((r) => r.status === "MATCHED").length,
      unplanned: rows.filter((r) => r.status === "UNPLANNED").length,
      dropped: rows.filter((r) => r.status === "DROPPED").length,
      toConfirm: rows.filter((r) => r.needsConfirmation).length,
    },
  };
}
