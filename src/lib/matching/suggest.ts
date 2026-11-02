// Matching (specs/feature-matching). Pure: the texts that are embedded, and how a suggestion is
// chosen from the matches, so the order and every label are tested without a database.

export type KnowledgeKind =
  "APPROVED_PRE_AI" | "APPROVED_AI_ERA" | "BENCHMARK_CONFIRMED" | "BENCHMARK_DRAFT";
export type SuggestionMethod =
  | "BENCHMARK_CONFIRMED"
  | "BENCHMARK_DRAFT"
  | "AI_ERA_ACTUALS"
  | "AI_ERA_ESTIMATE"
  | "PRE_AI_MATCH"
  | "AI_GUESS"
  | "NO_MATCH";

/** Sub tasks are compared by their first few titles; more only dilutes the text. */
const SUB_TASKS_IN_TEXT = 6;

export function entryText(entry: {
  partLabel: string;
  title: string;
  description?: string;
  subTaskTitles: string[];
}): string {
  const parts = [`${entry.partLabel}: ${entry.title}.`];
  if (entry.description?.trim()) parts.push(`${entry.description.trim()}.`);
  const subs = entry.subTaskTitles.slice(0, SUB_TASKS_IN_TEXT).filter(Boolean);
  if (subs.length) parts.push(`Sub tasks: ${subs.join("; ")}.`);
  return parts.join(" ");
}

export function queryText(task: {
  partLabel: string;
  featureName: string;
  featureDescription?: string;
}): string {
  return entryText({
    partLabel: task.partLabel,
    title: task.featureName,
    description: task.featureDescription,
    subTaskTitles: [],
  });
}

export type MatchSubTask = {
  title: string;
  minTenths: number;
  maxTenths: number;
  actualTenths?: number | null;
};

/** One search result, as stored on the suggestion and shown on the page. */
export type Match = {
  id: string;
  kind: KnowledgeKind;
  similarity: number; // 0–1
  requestId: string | null;
  version: number | null;
  projectName: string | null;
  clientName: string | null;
  authorName: string | null;
  partLabel: string;
  title: string;
  subTasks: MatchSubTask[];
  minTenths: number;
  maxTenths: number;
  actualTenths: number | null;
  sourceDate: string; // ISO date
  /** Set for benchmark entries (specs/feature-benchmarks). */
  benchmark?: {
    id: string;
    code: string;
    status: "DRAFT" | "CONFIRMED" | "RETIRED";
    confirmedByName: string | null;
    projectsCount: number;
    updatedAt: string; // ISO date
  } | null;
};

export type SuggestedSubTask = {
  title: string;
  minTenths: number;
  maxTenths: number;
  comment: string;
  /** Sub tasks taken from a benchmark stay linked to it, so actuals can feed it. */
  benchmarkId?: string;
};

export type Suggestion = {
  method: SuggestionMethod;
  source: Match | null;
  subTasks: SuggestedSubTask[] | null;
  minTenths: number | null;
  maxTenths: number | null;
};

export const METHOD_LABELS: Record<SuggestionMethod, string> = {
  BENCHMARK_CONFIRMED: "Confirmed benchmark",
  BENCHMARK_DRAFT: "Draft benchmark, not confirmed yet",
  AI_ERA_ACTUALS: "Based on actual hours (AI era)",
  AI_ERA_ESTIMATE: "Approved AI-era estimate",
  PRE_AI_MATCH: "Pre-AI hours: the AI reduction isn't applied yet",
  AI_GUESS: "AI-generated, no historical reference",
  NO_MATCH: "No reliable match",
};

export const AI_GUESS_NOTE = "AI-generated, no historical reference";

const isBenchmark = (kind: KnowledgeKind) =>
  kind === "BENCHMARK_CONFIRMED" || kind === "BENCHMARK_DRAFT";

/** "Patient portal MVP v1, Backend (Node.js)" or "benchmark FB-012". */
export function sourceName(
  match: Pick<Match, "kind" | "projectName" | "version" | "partLabel" | "benchmark">,
) {
  if (isBenchmark(match.kind)) return `benchmark ${match.benchmark?.code ?? "(unknown)"}`;
  return `${match.projectName ?? "Unknown project"} v${match.version ?? 1}, ${match.partLabel}`;
}

const sum = (subTasks: { minTenths: number; maxTenths: number }[]) => ({
  min: subTasks.reduce((n, s) => n + s.minTenths, 0),
  max: subTasks.reduce((n, s) => n + s.maxTenths, 0),
});

function fromMatch(method: SuggestionMethod, match: Match): Suggestion {
  const note = `From ${sourceName(match)}${method === "AI_ERA_ACTUALS" ? " (actual hours)" : ""}`;
  const subTasks = match.subTasks.map((s) => {
    // AI-era actuals: the hours really spent are both Min and Max where recorded.
    const actual = method === "AI_ERA_ACTUALS" ? s.actualTenths : null;
    return {
      title: s.title,
      minTenths: actual ?? s.minTenths,
      maxTenths: actual ?? s.maxTenths,
      comment: note,
      ...(match.benchmark ? { benchmarkId: match.benchmark.id } : {}),
    };
  });
  const total = sum(subTasks);
  return { method, source: match, subTasks, minTenths: total.min, maxTenths: total.max };
}

/**
 * The suggestion order (specs/feature-matching "Suggestion order and labels"): among matches at
 * or above the threshold, a Confirmed benchmark, then a Draft benchmark, then AI-era actual
 * hours, then an approved AI-era estimate, then the most similar pre-AI match; otherwise "No
 * reliable match". Matches arrive most similar first.
 */
export function chooseSuggestion(matches: Match[], threshold: number): Suggestion {
  const reliable = matches.filter((m) => m.similarity >= threshold);
  for (const kind of ["BENCHMARK_CONFIRMED", "BENCHMARK_DRAFT"] as const) {
    const benchmark = reliable.find((m) => m.kind === kind);
    if (benchmark) return fromMatch(kind, benchmark);
  }
  const actuals = reliable.find((m) => m.kind === "APPROVED_AI_ERA" && m.actualTenths !== null);
  if (actuals) return fromMatch("AI_ERA_ACTUALS", actuals);
  const aiEra = reliable.find((m) => m.kind === "APPROVED_AI_ERA");
  if (aiEra) return fromMatch("AI_ERA_ESTIMATE", aiEra);
  const preAi = reliable.find((m) => m.kind === "APPROVED_PRE_AI");
  if (preAi) return fromMatch("PRE_AI_MATCH", preAi);
  return { method: "NO_MATCH", source: null, subTasks: null, minTenths: null, maxTenths: null };
}
