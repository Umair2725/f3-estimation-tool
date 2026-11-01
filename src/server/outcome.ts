import "server-only";
import type { CurrentUser } from "@/server/auth/access";
import { can } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { assertAccess, ServiceError } from "./service-error";

// A request's outcome after the estimate (specs/project-outcome): none, In delivery (won),
// Lost or Delivered. Separate from the review status. Delivered locks the actual hours.

export type Outcome = "NONE" | "IN_DELIVERY" | "LOST" | "DELIVERED";

export const OUTCOME_LABELS: Record<Outcome, string> = {
  NONE: "No outcome",
  IN_DELIVERY: "In delivery",
  LOST: "Lost",
  DELIVERED: "Delivered",
};

const ALLOWED: Record<Outcome, Outcome[]> = {
  NONE: ["IN_DELIVERY", "LOST"],
  IN_DELIVERY: ["DELIVERED", "LOST", "NONE"],
  LOST: ["IN_DELIVERY", "NONE"],
  DELIVERED: ["IN_DELIVERY"], // reopen, Admins only
};

export const NO_HOURS_MESSAGE = "Estimate hours before recording an outcome";
export const REOPEN_MESSAGE = "Only an Admin can reopen a delivered project";

type OutcomeRequest = { ownerId: string; outcome: Outcome };

/** The outcomes this person may move the request to (for showing buttons). */
export function outcomeChoices(actor: CurrentUser, request: OutcomeRequest): Outcome[] {
  const mayChange = request.ownerId === actor.id || can(actor.role, "outcome.set");
  if (!mayChange) return [];
  if (request.outcome === "DELIVERED" && !can(actor.role, "settings.manage")) return [];
  return ALLOWED[request.outcome];
}

export async function setOutcome(
  actor: CurrentUser | null,
  id: string,
  input: { outcome: Outcome; reason?: string },
) {
  assertAccess(actor);
  const db = getDb();
  const request = await db.estimationRequest.findUnique({
    where: { id },
    select: { id: true, ownerId: true, outcome: true },
  });
  if (!request) throw new ServiceError("Request not found", 404);

  const mayChange = request.ownerId === actor.id || can(actor.role, "outcome.set");
  if (!mayChange)
    throw new ServiceError(
      "Only the owner, a Tech Lead, an Architect or an Admin can change the outcome",
      403,
    );
  if (request.outcome === "DELIVERED" && !can(actor.role, "settings.manage")) {
    throw new ServiceError(REOPEN_MESSAGE, 403);
  }
  if (!ALLOWED[request.outcome].includes(input.outcome)) {
    throw new ServiceError(
      `A request can't go from ${label(request.outcome)} to ${label(input.outcome)}`,
      400,
    );
  }

  const withHours = await db.subTask.count({
    where: {
      task: { requestPart: { requestId: id } },
      OR: [{ minTenths: { gt: 0 } }, { maxTenths: { gt: 0 } }],
    },
  });
  if (withHours === 0) throw new ServiceError(NO_HOURS_MESSAGE, 400);

  const reason =
    input.outcome === "LOST" ? (input.reason ?? "").trim().slice(0, 500) || null : null;
  return db.estimationRequest.update({
    where: { id },
    data: {
      outcome: input.outcome,
      outcomeReason: reason,
      outcomeChangedAt: new Date(),
      outcomeChangedById: actor.id,
    },
  });
}

const label = (o: Outcome) => OUTCOME_LABELS[o].toLowerCase();
