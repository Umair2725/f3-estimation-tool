import "server-only";
import type { CurrentUser } from "@/server/auth/access";
import { can } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { Prisma } from "@/generated/prisma/client";
import { PART_VALUES, type Part } from "@/lib/estimation/options";
import { readConsiderations } from "@/lib/estimation/schemas";
import {
  AI_GUESS_NOTE,
  chooseSuggestion,
  queryText,
  type Match,
  type SuggestedSubTask,
  type SuggestionMethod,
} from "@/lib/matching/suggest";
import { guessToSubTasks } from "@/lib/matching/ai-prompt";
import { canEditRequest, loadForEdit } from "../estimation-requests";
import { notify } from "../notify";
import { partLabel } from "../review/snapshot-source";
import { assertAccess, ServiceError } from "../service-error";
import { aiGuessesEnabled, guess, GUESS_FAILED } from "./ai-guess";
import { embedderFor } from "./embedder";
import { createReferenceBenchmark } from "../benchmarks/benchmarks";
import { indexBenchmark, searchKnowledge } from "./knowledge";

// Matching (specs/feature-matching): find matches, decide on suggestions, ask an Architect for
// reference hours, and the optional AI guess. Every function checks the caller itself.

type Tx = Prisma.TransactionClient;

export const ADJUST_REASON_REQUIRED = "Say why you're adjusting this suggestion";
export const CHOOSE_ARCHITECT = "Choose an Architect";
export const DECLINE_REASON_REQUIRED = "Say why you're declining";
const NOTHING_TO_ACCEPT = "There are no suggested hours to accept for this Task";

export function getEmbedder() {
  return embedderFor(getEnv());
}

// ---------- tasks ----------

type TaskContext = {
  taskId: string;
  requestId: string;
  part: Part;
  partLabel: string;
  stack: string[];
  featureName: string;
  featureDescription: string;
};

async function loadTasks(db: Tx | ReturnType<typeof getDb>, requestId: string, taskIds?: string[]) {
  const tasks = await db.estimateTask.findMany({
    where: { requestPart: { requestId }, ...(taskIds ? { id: { in: taskIds } } : {}) },
    include: {
      feature: true,
      requestPart: { include: { technologies: { include: { technology: true } } } },
    },
  });
  return tasks
    .map((t): TaskContext & { position: number } => {
      const stack = t.requestPart.technologies
        .map((x) => x.technology.name)
        .sort((a, b) => a.localeCompare(b));
      return {
        taskId: t.id,
        requestId,
        part: t.requestPart.part,
        partLabel: partLabel(t.requestPart.part, stack),
        stack,
        featureName: t.feature.name,
        featureDescription: t.feature.description ?? "",
        position: PART_VALUES.indexOf(t.requestPart.part) * 10_000 + t.feature.position,
      };
    })
    .sort((a, b) => a.position - b.position);
}

/** Searches and stores the suggestion of each Task; no permission check (callers check). */
export async function computeSuggestions(requestId: string, taskIds?: string[]) {
  const db = getDb();
  const tasks = await loadTasks(db, requestId, taskIds);
  if (tasks.length === 0) return 0;
  const embedder = getEmbedder();
  const vectors = await embedder.embed(tasks.map((t) => queryText(t)));
  for (const [i, task] of tasks.entries()) {
    const matches = await searchKnowledge(db, {
      vector: vectors[i],
      model: embedder.name,
      part: task.part,
      excludeRequestId: requestId,
    });
    const suggestion = chooseSuggestion(matches, embedder.threshold);
    const data = {
      method: suggestion.method,
      matches: matches as unknown as Prisma.InputJsonValue,
      suggested: suggestion.subTasks
        ? (suggestion.subTasks as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      suggestedMinTenths: suggestion.minTenths,
      suggestedMaxTenths: suggestion.maxTenths,
      decision: "PENDING" as const,
      reason: null,
      decidedById: null,
      decidedAt: null,
    };
    await db.taskSuggestion.upsert({
      where: { taskId: task.taskId },
      create: { taskId: task.taskId, ...data },
      update: data,
    });
  }
  return tasks.length;
}

/** Finds matches for one Task, or every Task of the request; needs edit rights. */
export async function findMatches(actor: CurrentUser | null, requestId: string, taskId?: string) {
  assertAccess(actor, "estimate.edit");
  await getDb().$transaction((tx) => loadForEdit(tx, actor, requestId));
  return { tasks: await computeSuggestions(requestId, taskId ? [taskId] : undefined) };
}

// ---------- reads ----------

export type SuggestionView = {
  method: SuggestionMethod;
  matches: Match[];
  suggested: SuggestedSubTask[] | null;
  minTenths: number | null;
  maxTenths: number | null;
  decision: "PENDING" | "ACCEPTED" | "ADJUSTED" | "REJECTED";
  reason: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
};

export type ReferenceAsk = {
  id: string;
  status: "OPEN" | "ANSWERED" | "DECLINED";
  architectName: string;
  declineReason: string | null;
  createdAt: Date;
};

export type MatchingView = {
  canEdit: boolean;
  aiGuesses: boolean;
  architects: { id: string; name: string }[];
  byTask: Record<string, { suggestion: SuggestionView | null; ask: ReferenceAsk | null }>;
};

/** Everything the estimate page shows about matching; anyone with a role can read it. */
export async function getMatching(
  actor: CurrentUser | null,
  requestId: string,
): Promise<MatchingView> {
  assertAccess(actor);
  const db = getDb();
  const request = await db.estimationRequest.findUnique({
    where: { id: requestId },
    select: { ownerId: true, status: true },
  });
  if (!request) throw new ServiceError("Request not found", 404);
  const [suggestions, asks] = await Promise.all([
    db.taskSuggestion.findMany({
      where: { task: { requestPart: { requestId } } },
      include: { decidedBy: { select: { name: true } } },
    }),
    db.referenceRequest.findMany({
      where: { requestId, taskId: { not: null } },
      orderBy: { createdAt: "asc" },
      include: { architect: { select: { name: true } } },
    }),
  ]);
  const canEdit = canEditRequest(actor, request);
  const byTask: MatchingView["byTask"] = {};
  for (const s of suggestions) {
    byTask[s.taskId] = {
      ask: null,
      suggestion: {
        method: s.method,
        matches: s.matches as unknown as Match[],
        suggested: (s.suggested as unknown as SuggestedSubTask[] | null) ?? null,
        minTenths: s.suggestedMinTenths,
        maxTenths: s.suggestedMaxTenths,
        decision: s.decision,
        reason: s.reason,
        decidedByName: s.decidedBy?.name ?? null,
        decidedAt: s.decidedAt,
      },
    };
  }
  // The latest request for reference per Task (later ones replace earlier ones).
  for (const a of asks) {
    const entry = (byTask[a.taskId!] ??= { suggestion: null, ask: null });
    entry.ask = {
      id: a.id,
      status: a.status,
      architectName: a.architect.name,
      declineReason: a.declineReason,
      createdAt: a.createdAt,
    };
  }
  return {
    canEdit,
    aiGuesses: aiGuessesEnabled(),
    architects: canEdit ? await architectChoices() : [],
    byTask,
  };
}

async function architectChoices() {
  return getDb().user.findMany({
    where: { status: "ACTIVE", role: "ARCHITECT" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

// ---------- decisions ----------

/** Replaces a Task's Sub tasks with a suggestion's, each keeping its source comment. */
async function replaceSubTasks(tx: Tx, taskId: string, suggested: SuggestedSubTask[]) {
  await tx.subTask.deleteMany({ where: { taskId } });
  await tx.subTask.createMany({
    data: suggested.map((s, position) => ({
      taskId,
      title: s.title.slice(0, 200),
      minTenths: s.minTenths,
      maxTenths: s.maxTenths,
      comment: s.comment.slice(0, 1000),
      // Kept so actual hours can flow back to the benchmark (specs/feature-matching).
      benchmarkId: s.benchmarkId ?? null,
      position,
    })),
  });
}

export async function decideSuggestion(
  actor: CurrentUser | null,
  requestId: string,
  taskId: string,
  input: { decision?: unknown; reason?: unknown },
) {
  assertAccess(actor, "estimate.edit");
  const decision = input.decision;
  if (decision !== "ACCEPTED" && decision !== "ADJUSTED" && decision !== "REJECTED") {
    throw new ServiceError("Choose Accept, Adjust or Reject", 400);
  }
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : "";
  if (decision === "ADJUSTED" && !reason) throw new ServiceError(ADJUST_REASON_REQUIRED, 400);

  await getDb().$transaction(async (tx) => {
    await loadForEdit(tx, actor, requestId);
    const suggestion = await tx.taskSuggestion.findFirst({
      where: { taskId, task: { requestPart: { requestId } } },
    });
    if (!suggestion) throw new ServiceError("Find matches for this Task first", 400);
    const suggested = suggestion.suggested as unknown as SuggestedSubTask[] | null;
    if (decision !== "REJECTED") {
      if (!suggested?.length) throw new ServiceError(NOTHING_TO_ACCEPT, 400);
      await replaceSubTasks(tx, taskId, suggested);
    }
    await tx.taskSuggestion.update({
      where: { id: suggestion.id },
      data: { decision, reason: reason || null, decidedById: actor.id, decidedAt: new Date() },
    });
  });
}

// ---------- AI guess ----------

export async function requestAiGuess(actor: CurrentUser | null, requestId: string, taskId: string) {
  assertAccess(actor, "estimate.edit");
  if (!aiGuessesEnabled()) throw new ServiceError("AI guesses aren't set up", 400);
  const db = getDb();
  const request = await db.$transaction((tx) => loadForEdit(tx, actor, requestId));
  const [task] = await loadTasks(db, requestId, [taskId]);
  if (!task) throw new ServiceError("Task not found", 404);
  const current = await db.taskSuggestion.findUnique({ where: { taskId } });
  if (!current || (current.method !== "NO_MATCH" && current.method !== "AI_GUESS")) {
    throw new ServiceError("AI guesses are only for Tasks with no reliable match", 400);
  }
  let subTasks: SuggestedSubTask[];
  try {
    subTasks = await guessSubTasks(request, task);
  } catch (err) {
    logger.warn("AI guess failed", { requestId, taskId, err });
    throw new ServiceError(GUESS_FAILED, 400);
  }
  await db.taskSuggestion.update({ where: { taskId }, data: aiGuessData(subTasks) });
}

type GuessRequest = { applicationTypes: string[]; considerations: Prisma.JsonValue };

/** The AI-only guess for one Task; only this request's own details are sent. */
async function guessSubTasks(request: GuessRequest, task: TaskContext) {
  const result = await guess({
    applicationTypes: request.applicationTypes,
    partLabel: task.partLabel,
    featureName: task.featureName,
    featureDescription: task.featureDescription,
    compliance: readConsiderations(request.considerations).compliance,
  });
  return guessToSubTasks(result, AI_GUESS_NOTE);
}

function aiGuessData(subTasks: SuggestedSubTask[]) {
  return {
    method: "AI_GUESS" as const,
    suggested: subTasks as unknown as Prisma.InputJsonValue,
    suggestedMinTenths: subTasks.reduce((n, s) => n + s.minTenths, 0),
    suggestedMaxTenths: subTasks.reduce((n, s) => n + s.maxTenths, 0),
    decision: "PENDING" as const,
    reason: null,
    decidedById: null,
    decidedAt: null,
  };
}

// ---------- hours filled in at once ----------

/** How many AI guesses run at the same time when filling hours. */
const GUESS_CONCURRENCY = 4;

export type FilledHours = { matched: number; guessed: number; empty: number };

/**
 * Fills the hours of new Tasks at once (specs/requirement-documents "Hours filled in"): the
 * suggestion's Sub tasks when there is a reliable match, otherwise an AI guess when AI guesses
 * are set up. Each fill is recorded as accepted by `actorId`, and stays open to Adjust or
 * Reject. Tasks that already have Sub tasks are left alone. Run after computeSuggestions; no
 * permission check (callers check). A failed guess leaves the Task empty, as "No reliable match".
 */
export async function fillHours(
  actorId: string,
  requestId: string,
  taskIds: string[],
): Promise<FilledHours> {
  const db = getDb();
  const filled: FilledHours = { matched: 0, guessed: 0, empty: 0 };
  if (taskIds.length === 0) return filled;
  const [request, suggestions, withSubTasks] = await Promise.all([
    db.estimationRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { applicationTypes: true, considerations: true },
    }),
    db.taskSuggestion.findMany({ where: { taskId: { in: taskIds } } }),
    db.subTask.findMany({
      where: { taskId: { in: taskIds } },
      select: { taskId: true },
      distinct: ["taskId"],
    }),
  ]);
  const hasHours = new Set(withSubTasks.map((s) => s.taskId));
  const byTask = new Map(suggestions.map((s) => [s.taskId, s]));
  const open = taskIds.filter((id) => !hasHours.has(id));

  const accept = async (taskId: string, subTasks: SuggestedSubTask[], data = {}) => {
    await db.$transaction(async (tx) => {
      await replaceSubTasks(tx, taskId, subTasks);
      await tx.taskSuggestion.update({
        where: { taskId },
        data: { ...data, decision: "ACCEPTED", decidedById: actorId, decidedAt: new Date() },
      });
    });
  };

  const toGuess: string[] = [];
  for (const taskId of open) {
    const suggestion = byTask.get(taskId);
    const suggested = suggestion?.suggested as unknown as SuggestedSubTask[] | null | undefined;
    if (suggested?.length) {
      await accept(taskId, suggested);
      filled.matched++;
    } else if (suggestion && aiGuessesEnabled()) toGuess.push(taskId);
    else filled.empty++;
  }

  if (toGuess.length) {
    const tasks = new Map((await loadTasks(db, requestId, toGuess)).map((t) => [t.taskId, t]));
    const queue = [...toGuess];
    const worker = async () => {
      for (let taskId = queue.shift(); taskId; taskId = queue.shift()) {
        const task = tasks.get(taskId);
        try {
          if (!task) throw new Error("Task not found");
          const subTasks = await guessSubTasks(request, task);
          await accept(taskId, subTasks, aiGuessData(subTasks));
          filled.guessed++;
        } catch (err) {
          logger.warn("AI guess while filling hours failed", { requestId, taskId, err });
          filled.empty++;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(GUESS_CONCURRENCY, toGuess.length) }, worker));
  }
  return filled;
}

// ---------- Architect references ----------

export async function askArchitect(
  actor: CurrentUser | null,
  requestId: string,
  taskId: string,
  input: { architectId?: unknown; note?: unknown },
) {
  assertAccess(actor, "estimate.edit");
  const architectId = typeof input.architectId === "string" ? input.architectId : "";
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 1000) : "";
  const db = getDb();
  const architect = architectId ? await db.user.findUnique({ where: { id: architectId } }) : null;
  if (!architect || architect.status !== "ACTIVE" || !can(architect.role, "reference.provide")) {
    throw new ServiceError(CHOOSE_ARCHITECT, 400);
  }
  return db.$transaction(async (tx) => {
    await loadForEdit(tx, actor, requestId);
    // Lock the Task so two people can't open two requests for it at once.
    await tx.$queryRaw`SELECT id FROM estimate_task WHERE id = ${taskId} FOR UPDATE`;
    const [task] = await loadTasks(tx, requestId, [taskId]);
    if (!task) throw new ServiceError("Task not found", 404);
    const suggestion = await tx.taskSuggestion.findUnique({ where: { taskId } });
    if (!suggestion || (suggestion.method !== "NO_MATCH" && suggestion.method !== "AI_GUESS")) {
      throw new ServiceError("Ask an Architect only when there is no reliable match", 400);
    }
    if (await tx.referenceRequest.count({ where: { taskId, status: "OPEN" } })) {
      throw new ServiceError("An Architect has already been asked for this Task", 409);
    }
    const ask = await tx.referenceRequest.create({
      data: {
        requestId,
        taskId,
        featureName: task.featureName,
        featureDescription: task.featureDescription,
        part: task.part,
        partLabel: task.partLabel,
        stack: task.stack,
        note,
        askedById: actor.id,
        architectId: architect.id,
      },
    });
    await notify(tx, {
      userId: architect.id,
      requestId,
      kind: "REFERENCE_REQUESTED",
      actorId: actor.id,
    });
    return { id: ask.id, architectName: architect.name };
  });
}

export type ReferenceRequestView = {
  id: string;
  status: "OPEN" | "ANSWERED" | "DECLINED";
  requestId: string;
  projectName: string;
  clientName: string | null;
  featureName: string;
  featureDescription: string;
  part: Part;
  partLabel: string;
  stack: string[];
  note: string;
  askedByName: string;
  architectId: string;
  architectName: string;
  declineReason: string | null;
  createdAt: Date;
  answeredAt: Date | null;
  canAnswer: boolean;
};

function viewOf(
  actor: CurrentUser,
  r: Prisma.ReferenceRequestGetPayload<{
    include: {
      request: { select: { projectName: true; client: { select: { name: true } } } };
      askedBy: { select: { name: true } };
      architect: { select: { name: true } };
    };
  }>,
): ReferenceRequestView {
  return {
    id: r.id,
    status: r.status,
    requestId: r.requestId,
    projectName: r.request.projectName,
    clientName: r.request.client?.name ?? null,
    featureName: r.featureName,
    featureDescription: r.featureDescription,
    part: r.part,
    partLabel: r.partLabel,
    stack: r.stack,
    note: r.note,
    askedByName: r.askedBy.name,
    architectId: r.architectId,
    architectName: r.architect.name,
    declineReason: r.declineReason,
    createdAt: r.createdAt,
    answeredAt: r.answeredAt,
    canAnswer:
      r.status === "OPEN" && r.architectId === actor.id && can(actor.role, "reference.provide"),
  };
}

const VIEW_INCLUDE = {
  request: { select: { projectName: true, client: { select: { name: true } } } },
  askedBy: { select: { name: true } },
  architect: { select: { name: true } },
} as const;

export async function getReferenceRequest(actor: CurrentUser | null, id: string) {
  assertAccess(actor);
  const r = await getDb().referenceRequest.findUnique({ where: { id }, include: VIEW_INCLUDE });
  if (!r) throw new ServiceError("Request for reference not found", 404);
  return viewOf(actor, r);
}

/** The Architect's list: open requests (oldest first) and those answered in the last 30 days. */
export async function listReferenceRequests(actor: CurrentUser | null, now = new Date()) {
  assertAccess(actor, "reference.provide");
  const db = getDb();
  const [open, recent] = await Promise.all([
    db.referenceRequest.findMany({
      where: { architectId: actor.id, status: "OPEN" },
      orderBy: { createdAt: "asc" },
      include: VIEW_INCLUDE,
    }),
    db.referenceRequest.findMany({
      where: {
        architectId: actor.id,
        status: { not: "OPEN" },
        answeredAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
      },
      orderBy: { answeredAt: "desc" },
      include: VIEW_INCLUDE,
    }),
  ]);
  return { open: open.map((r) => viewOf(actor, r)), recent: recent.map((r) => viewOf(actor, r)) };
}

async function loadOpenForArchitect(tx: Tx, actor: CurrentUser, id: string) {
  const r = await tx.referenceRequest.findUnique({ where: { id } });
  if (!r) throw new ServiceError("Request for reference not found", 404);
  if (r.architectId !== actor.id || !can(actor.role, "reference.provide")) {
    throw new ServiceError("Only the Architect who was asked can answer this", 403);
  }
  if (r.status !== "OPEN") throw new ServiceError("This request has already been answered", 409);
  return r;
}

type ReferenceInput = {
  title?: unknown;
  description?: unknown;
  subTasks?: unknown;
};

function parseReference(input: ReferenceInput) {
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 200) : "";
  if (!title) throw new ServiceError("Enter the feature title", 400);
  const description =
    typeof input.description === "string" ? input.description.trim().slice(0, 1000) : "";
  const rows = Array.isArray(input.subTasks) ? input.subTasks : [];
  const subTasks = rows
    .map((row) => {
      const r = (row ?? {}) as { title?: unknown; min?: unknown; max?: unknown };
      return {
        title: typeof r.title === "string" ? r.title.trim().slice(0, 200) : "",
        min: Number(r.min),
        max: Number(r.max),
      };
    })
    .filter((r) => r.title);
  if (subTasks.length === 0) throw new ServiceError("Add at least one Sub task with hours", 400);
  if (subTasks.length > 50) throw new ServiceError("Use at most 50 Sub tasks", 400);
  for (const s of subTasks) {
    const ok = (n: number) => Number.isFinite(n) && n >= 0 && n <= 9999;
    if (!ok(s.min) || !ok(s.max)) throw new ServiceError(`Check the hours of "${s.title}"`, 400);
    if (s.min > s.max) throw new ServiceError(`Min is more than Max for "${s.title}"`, 400);
  }
  return {
    title,
    description,
    subTasks: subTasks.map((s) => ({
      title: s.title,
      minTenths: Math.round(s.min * 10),
      maxTenths: Math.round(s.max * 10),
    })),
  };
}

export async function answerReference(
  actor: CurrentUser | null,
  id: string,
  input: ReferenceInput,
) {
  assertAccess(actor, "reference.provide");
  const reference = parseReference(input);
  const db = getDb();
  const result = await db.$transaction(async (tx) => {
    const r = await loadOpenForArchitect(tx, actor, id);
    // Stored as a Draft benchmark (specs/feature-matching "Architect adds reference hours").
    const created = await createReferenceBenchmark(tx, {
      title: reference.title,
      description: reference.description,
      part: r.part,
      stack: r.stack,
      subTasks: reference.subTasks,
      authorId: actor.id,
    });
    await tx.referenceRequest.update({
      where: { id },
      data: { status: "ANSWERED", benchmarkId: created.id, answeredAt: new Date() },
    });
    await notify(tx, {
      userId: r.askedById,
      requestId: r.requestId,
      kind: "REFERENCE_ADDED",
      actorId: actor.id,
    });
    return {
      benchmarkId: created.id,
      code: created.code,
      requestId: r.requestId,
      taskId: r.taskId,
    };
  });
  // Indexed at once for all future matching, then this Task's suggestion is refreshed.
  try {
    await indexBenchmark(db, getEmbedder(), result.benchmarkId);
    if (result.taskId) await computeSuggestions(result.requestId, [result.taskId]);
  } catch (err) {
    logger.error("indexing the reference benchmark failed; run npm run reindex-knowledge", {
      benchmarkId: result.benchmarkId,
      err,
    });
  }
  return result;
}

export async function declineReference(
  actor: CurrentUser | null,
  id: string,
  input: { reason?: unknown },
) {
  assertAccess(actor, "reference.provide");
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : "";
  if (!reason) throw new ServiceError(DECLINE_REASON_REQUIRED, 400);
  await getDb().$transaction(async (tx) => {
    const r = await loadOpenForArchitect(tx, actor, id);
    await tx.referenceRequest.update({
      where: { id },
      data: { status: "DECLINED", declineReason: reason, answeredAt: new Date() },
    });
    await notify(tx, {
      userId: r.askedById,
      requestId: r.requestId,
      kind: "REFERENCE_DECLINED",
      actorId: actor.id,
      detail: reason,
    });
  });
}

// ---------- review attention ----------

/** Counts for the review page (specs/feature-matching "Review attention for suggestions"). */
export async function matchingAttention(requestId: string) {
  const db = getDb();
  const [suggestions, waiting] = await Promise.all([
    db.taskSuggestion.findMany({
      where: { task: { requestPart: { requestId } } },
      include: { task: { include: { feature: true, subTasks: true } } },
    }),
    db.referenceRequest.findMany({ where: { requestId, status: "OPEN", taskId: { not: null } } }),
  ]);
  const hasHours = (subs: { minTenths: number; maxTenths: number }[]) =>
    subs.some((s) => s.minTenths > 0 || s.maxTenths > 0);
  return {
    aiGuess: suggestions
      .filter(
        (s) => s.method === "AI_GUESS" && (s.decision === "ACCEPTED" || s.decision === "ADJUSTED"),
      )
      .map((s) => ({ taskId: s.taskId, name: s.task.feature.name })),
    noMatch: suggestions
      .filter((s) => s.method === "NO_MATCH" && !hasHours(s.task.subTasks))
      .map((s) => ({ taskId: s.taskId, name: s.task.feature.name })),
    waitingReference: waiting.map((w) => ({ taskId: w.taskId!, name: w.featureName })),
  };
}
