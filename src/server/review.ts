import "server-only";
import type { CurrentUser } from "@/server/auth/access";
import { can, ROLE_LABELS, type Role } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { RequestStatus } from "@/lib/estimation/options";
import { attentionGroups, minOverMaxMessage, type AttentionGroup } from "@/lib/review/attention";
import { readSnapshot, type ApprovedSnapshot } from "@/lib/review/snapshot";
import {
  canAct,
  canComment,
  isEligibleReviewer,
  OWN_REVIEW,
  STATUS_REFUSAL,
  TRANSITIONS,
  type ReviewAction,
  type ReviewSubject,
} from "@/lib/review/transitions";
import type { Totals } from "@/lib/estimation/totals";
import { estimateChecklist, estimateTotals, getEstimate, type EstimateView } from "./estimates";
import { getRequest } from "./estimation-requests";
import { storeApprovedVersion } from "./review/snapshot-source";
import { assertAccess, ServiceError } from "./service-error";

// Review and approval (specs/estimate-review). Every function checks the caller itself; status
// changes are conditional updates, so two people acting at once can't both succeed.

type Tx = Prisma.TransactionClient;
type NotificationKind = "SUBMITTED" | "CHANGES_REQUESTED" | "APPROVED";

export const CHANGES_COMMENT_REQUIRED = "Add a comment saying what to change";
export const CHOOSE_APPROVER = "Choose a Tech Lead or Architect";
const COMMENT_REFUSED = "You can't comment on this request";
const MAX_COMMENT = 2000;

async function loadSubject(db: Tx | ReturnType<typeof getDb>, id: string) {
  const request = await db.estimationRequest.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      status: true,
      reviewerId: true,
      origin: true,
      version: true,
    },
  });
  if (!request) throw new ServiceError("Request not found", 404);
  return request;
}

function check(action: ReviewAction, actor: CurrentUser, subject: ReviewSubject) {
  const result = canAct(action, actor, subject);
  if (!result.ok) throw new ServiceError(result.message, result.status);
}

/** Applies a status change only if the request is still where the action needs it to be. */
async function move(
  tx: Tx,
  action: ReviewAction,
  id: string,
  where: Prisma.EstimationRequestWhereInput,
  data: Prisma.EstimationRequestUncheckedUpdateManyInput,
) {
  const { count } = await tx.estimationRequest.updateMany({
    where: { id, status: { in: TRANSITIONS[action].from }, ...where },
    data: { status: TRANSITIONS[action].to, ...data },
  });
  if (count === 0) throw new ServiceError(STATUS_REFUSAL[action], 409);
}

async function record(
  tx: Tx,
  input: {
    requestId: string;
    from: RequestStatus;
    to: RequestStatus;
    version: number;
    actorId: string;
    comment?: string;
  },
) {
  await tx.statusChange.create({
    data: {
      requestId: input.requestId,
      fromStatus: input.from,
      toStatus: input.to,
      version: input.version,
      actorId: input.actorId,
      comment: input.comment ?? null,
    },
  });
}

/** The one place a review notification is created (email can be added here later). */
async function notify(
  tx: Tx,
  input: { userId: string; requestId: string; kind: NotificationKind; actorId: string },
) {
  if (input.userId === input.actorId) return;
  await tx.notification.create({ data: input });
}

// ---------- actions ----------

export async function submitForReview(
  actor: CurrentUser | null,
  id: string,
  input: { reviewerId?: unknown },
) {
  assertAccess(actor, "estimate.edit");
  const db = getDb();
  const subject = await loadSubject(db, id);
  check("submit", actor, subject);

  const reviewerId = typeof input.reviewerId === "string" ? input.reviewerId : "";
  if (reviewerId === subject.ownerId) throw new ServiceError(OWN_REVIEW, 400);
  const reviewer = reviewerId ? await db.user.findUnique({ where: { id: reviewerId } }) : null;
  if (!reviewer || !isEligibleReviewer(reviewer, subject.ownerId)) {
    throw new ServiceError(CHOOSE_APPROVER, 400);
  }

  const { missing } = await getRequest(actor, id);
  if (missing.length) {
    throw new ServiceError(
      `Finish the request before submitting: ${missing.map((m) => m.message).join("; ")}`,
      400,
    );
  }
  const blocking = minOverMaxMessage(estimateChecklist(await getEstimate(actor, id)));
  if (blocking) throw new ServiceError(blocking, 400);

  await db.$transaction(async (tx) => {
    await move(tx, "submit", id, {}, { reviewerId, submittedAt: new Date() });
    await record(tx, {
      requestId: id,
      from: subject.status,
      to: "IN_REVIEW",
      version: subject.version,
      actorId: actor.id,
    });
    await notify(tx, { userId: reviewerId, requestId: id, kind: "SUBMITTED", actorId: actor.id });
  });
  return { reviewerName: reviewer.name };
}

export async function withdraw(actor: CurrentUser | null, id: string) {
  assertAccess(actor, "estimate.edit");
  const db = getDb();
  const subject = await loadSubject(db, id);
  check("withdraw", actor, subject);
  await db.$transaction(async (tx) => {
    await move(tx, "withdraw", id, {}, { reviewerId: null, submittedAt: null });
    await record(tx, {
      requestId: id,
      from: "IN_REVIEW",
      to: "DRAFT",
      version: subject.version,
      actorId: actor.id,
    });
    // The earlier Approver no longer has anything to do here.
    await tx.notification.updateMany({
      where: { requestId: id, kind: "SUBMITTED", readAt: null },
      data: { readAt: new Date() },
    });
  });
}

export async function requestChanges(
  actor: CurrentUser | null,
  id: string,
  input: { comment?: unknown },
) {
  assertAccess(actor);
  const comment = typeof input.comment === "string" ? input.comment.trim() : "";
  const db = getDb();
  const subject = await loadSubject(db, id);
  check("request-changes", actor, subject);
  if (!comment) throw new ServiceError(CHANGES_COMMENT_REQUIRED, 400);
  if (comment.length > MAX_COMMENT) {
    throw new ServiceError(`Keep the comment under ${MAX_COMMENT} characters`, 400);
  }
  await db.$transaction(async (tx) => {
    await move(tx, "request-changes", id, { reviewerId: actor.id }, {});
    await tx.reviewComment.create({
      data: { requestId: id, authorId: actor.id, version: subject.version, body: comment },
    });
    await record(tx, {
      requestId: id,
      from: "IN_REVIEW",
      to: "CHANGES_REQUESTED",
      version: subject.version,
      actorId: actor.id,
      comment,
    });
    await notify(tx, {
      userId: subject.ownerId,
      requestId: id,
      kind: "CHANGES_REQUESTED",
      actorId: actor.id,
    });
  });
}

export async function approve(actor: CurrentUser | null, id: string) {
  assertAccess(actor);
  const db = getDb();
  const subject = await loadSubject(db, id);
  check("approve", actor, subject);
  await db.$transaction(async (tx) => {
    await move(tx, "approve", id, { reviewerId: actor.id }, {});
    await storeApprovedVersion(tx, id, actor.id, { fromStatus: "IN_REVIEW" });
    await notify(tx, {
      userId: subject.ownerId,
      requestId: id,
      kind: "APPROVED",
      actorId: actor.id,
    });
  });
}

export async function reopen(actor: CurrentUser | null, id: string) {
  assertAccess(actor, "estimate.edit");
  const db = getDb();
  const subject = await loadSubject(db, id);
  check("reopen", actor, subject);
  await db.$transaction(async (tx) => {
    await move(
      tx,
      "reopen",
      id,
      {},
      { version: { increment: 1 }, reviewerId: null, submittedAt: null },
    );
    await record(tx, {
      requestId: id,
      from: subject.status,
      to: "DRAFT",
      version: subject.version + 1,
      actorId: actor.id,
      comment: `Editing as version ${subject.version + 1}`,
    });
  });
  return { version: subject.version + 1 };
}

// ---------- comments ----------

export async function addComment(
  actor: CurrentUser | null,
  id: string,
  input: { body?: unknown; taskId?: unknown; subTaskId?: unknown },
) {
  assertAccess(actor);
  const db = getDb();
  const subject = await loadSubject(db, id);
  if (!canComment(actor, subject)) throw new ServiceError(COMMENT_REFUSED, 403);
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) throw new ServiceError("Write a comment first", 400);
  if (body.length > MAX_COMMENT) {
    throw new ServiceError(`Keep the comment under ${MAX_COMMENT} characters`, 400);
  }

  let target: { taskId?: string; subTaskId?: string; targetTitle?: string } = {};
  if (typeof input.subTaskId === "string" && input.subTaskId) {
    const sub = await db.subTask.findUnique({
      where: { id: input.subTaskId },
      include: { task: { include: { requestPart: true } } },
    });
    if (!sub || sub.task.requestPart.requestId !== id) {
      throw new ServiceError("That Sub task isn't on this request", 400);
    }
    target = { subTaskId: sub.id, targetTitle: sub.title };
  } else if (typeof input.taskId === "string" && input.taskId) {
    const task = await db.estimateTask.findUnique({
      where: { id: input.taskId },
      include: { requestPart: true, feature: true },
    });
    if (!task || task.requestPart.requestId !== id) {
      throw new ServiceError("That Task isn't on this request", 400);
    }
    target = { taskId: task.id, targetTitle: task.feature.name };
  }

  return db.reviewComment.create({
    data: { requestId: id, authorId: actor.id, version: subject.version, body, ...target },
  });
}

// ---------- reads ----------

export type ReviewComment = {
  id: string;
  body: string;
  authorName: string;
  version: number;
  createdAt: Date;
  taskId: string | null;
  subTaskId: string | null;
  targetTitle: string | null;
};

export type HistoryEntry = {
  id: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  version: number;
  actorName: string;
  comment: string | null;
  createdAt: Date;
};

export type ReviewPanel = {
  status: RequestStatus;
  version: number;
  origin: "NEW" | "IMPORTED";
  ownerId: string;
  reviewer: { id: string; name: string } | null;
  submittedAt: Date | null;
  latestApproval: { version: number; approvedByName: string; approvedAt: Date } | null;
  history: HistoryEntry[];
  can: {
    submit: boolean;
    withdraw: boolean;
    reopen: boolean;
    approve: boolean;
    requestChanges: boolean;
    comment: boolean;
  };
  /** Filled only when the viewer may submit. */
  approverChoices: { id: string; name: string; roleLabel: string }[];
};

export async function getReviewPanel(actor: CurrentUser | null, id: string): Promise<ReviewPanel> {
  assertAccess(actor);
  const db = getDb();
  const request = await db.estimationRequest.findUnique({
    where: { id },
    include: {
      reviewer: { select: { id: true, name: true } },
      approved: {
        orderBy: { version: "desc" },
        take: 1,
        include: { approvedBy: { select: { name: true } } },
      },
      statusChanges: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { name: true } } },
      },
    },
  });
  if (!request) throw new ServiceError("Request not found", 404);
  const ok = (action: ReviewAction) => canAct(action, actor, request).ok;
  const maySubmit = ok("submit");
  const latest = request.approved[0];
  return {
    status: request.status,
    version: request.version,
    origin: request.origin,
    ownerId: request.ownerId,
    reviewer: request.reviewer,
    submittedAt: request.submittedAt,
    latestApproval: latest
      ? {
          version: latest.version,
          approvedByName: latest.approvedBy.name,
          approvedAt: latest.approvedAt,
        }
      : null,
    history: request.statusChanges.map((c) => ({
      id: c.id,
      fromStatus: c.fromStatus,
      toStatus: c.toStatus,
      version: c.version,
      actorName: c.actor.name,
      comment: c.comment,
      createdAt: c.createdAt,
    })),
    can: {
      submit: maySubmit,
      withdraw: ok("withdraw"),
      reopen: ok("reopen"),
      approve: ok("approve"),
      requestChanges: ok("request-changes"),
      comment: canComment(actor, request),
    },
    approverChoices: maySubmit ? await approverChoices(request.ownerId) : [],
  };
}

async function approverChoices(ownerId: string) {
  const people = await getDb().user.findMany({
    where: { status: "ACTIVE", role: { in: ["TECH_LEAD", "ARCHITECT"] }, id: { not: ownerId } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, status: true },
  });
  return people
    .filter((p) => isEligibleReviewer(p, ownerId))
    .map((p) => ({ id: p.id, name: p.name, roleLabel: ROLE_LABELS[p.role as Role] }));
}

export async function listComments(
  actor: CurrentUser | null,
  id: string,
): Promise<ReviewComment[]> {
  assertAccess(actor);
  const comments = await getDb().reviewComment.findMany({
    where: { requestId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true } } },
  });
  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    authorName: c.author.name,
    version: c.version,
    createdAt: c.createdAt,
    taskId: c.taskId,
    subTaskId: c.subTaskId,
    targetTitle: c.targetTitle,
  }));
}

export type ReviewView = {
  estimate: EstimateView;
  panel: ReviewPanel;
  ownerName: string;
  totals: Totals;
  attention: AttentionGroup[];
  comments: ReviewComment[];
};

export async function getReview(actor: CurrentUser | null, id: string): Promise<ReviewView> {
  const estimate = await getEstimate(actor, id);
  const [panel, comments] = await Promise.all([getReviewPanel(actor, id), listComments(actor, id)]);
  return {
    estimate,
    panel,
    ownerName: estimate.request.ownerName,
    totals: estimateTotals(estimate),
    attention: attentionGroups(estimateChecklist(estimate)),
    comments,
  };
}

const RECENT_DAYS = 30;

/** The Reviews page: waiting for me (oldest first) and what I reviewed in the last 30 days. */
export async function listReviews(actor: CurrentUser | null, now = new Date()) {
  assertAccess(actor, "estimate.approve");
  const db = getDb();
  const [waiting, recent] = await Promise.all([
    db.estimationRequest.findMany({
      where: { reviewerId: actor.id, status: "IN_REVIEW" },
      orderBy: { submittedAt: "asc" },
      include: { owner: { select: { name: true } }, client: { select: { name: true } } },
    }),
    db.statusChange.findMany({
      where: {
        actorId: actor.id,
        toStatus: { in: ["APPROVED", "CHANGES_REQUESTED"] },
        fromStatus: "IN_REVIEW",
        createdAt: { gte: new Date(now.getTime() - RECENT_DAYS * 86_400_000) },
      },
      orderBy: { createdAt: "desc" },
      include: {
        request: { select: { id: true, projectName: true, client: { select: { name: true } } } },
      },
    }),
  ]);
  const seen = new Set<string>();
  return {
    waiting: waiting.map((r) => ({
      id: r.id,
      projectName: r.projectName,
      clientName: r.client?.name ?? null,
      ownerName: r.owner.name,
      version: r.version,
      submittedAt: r.submittedAt,
    })),
    recent: recent
      .filter((c) => !seen.has(c.requestId) && seen.add(c.requestId))
      .map((c) => ({
        id: c.request.id,
        projectName: c.request.projectName,
        clientName: c.request.client?.name ?? null,
        outcome: c.toStatus,
        version: c.version,
        at: c.createdAt,
      })),
  };
}

/** How many requests wait for this person's review (the sidebar count). */
export async function reviewCount(actor: CurrentUser | null): Promise<number> {
  if (!actor || !can(actor.role, "estimate.approve")) return 0;
  return getDb().estimationRequest.count({
    where: { reviewerId: actor.id, status: "IN_REVIEW" },
  });
}

export async function unreadNotifications(actor: CurrentUser | null) {
  assertAccess(actor);
  const rows = await getDb().notification.findMany({
    where: { userId: actor.id, readAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      actor: { select: { name: true } },
      request: { select: { id: true, projectName: true } },
    },
  });
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    requestId: n.request.id,
    projectName: n.request.projectName,
    actorName: n.actor.name,
    createdAt: n.createdAt,
  }));
}

/** Opening a request marks its notifications read for this person. */
export async function markRequestRead(actor: CurrentUser | null, id: string) {
  assertAccess(actor);
  await getDb().notification.updateMany({
    where: { userId: actor.id, requestId: id, readAt: null },
    data: { readAt: new Date() },
  });
}

// ---------- knowledge base ----------

export type KnowledgeBaseSource = {
  requestId: string;
  version: number;
  origin: "NEW" | "IMPORTED";
  outcome: string;
  clientName: string | null;
  approvedAt: Date;
  snapshot: ApprovedSnapshot;
};

/**
 * The only sources matching (F-04) may use: each request's latest approved version. Drafts,
 * requests in review and later unapproved edits are never included.
 */
export async function knowledgeBaseSources(
  actor: CurrentUser | null,
): Promise<KnowledgeBaseSource[]> {
  assertAccess(actor);
  const rows = await getDb().approvedVersion.findMany({
    orderBy: [{ requestId: "asc" }, { version: "desc" }],
    distinct: ["requestId"],
    include: {
      request: { select: { origin: true, outcome: true, client: { select: { name: true } } } },
    },
  });
  return rows.map((r) => ({
    requestId: r.requestId,
    version: r.version,
    origin: r.request.origin,
    outcome: r.request.outcome,
    clientName: r.request.client?.name ?? null,
    approvedAt: r.approvedAt,
    snapshot: readSnapshot(r.snapshot),
  }));
}
