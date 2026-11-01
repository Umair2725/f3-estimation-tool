// Review status transitions (specs/estimate-review "Statuses and who may change them"). Pure: the
// request page's buttons and the server both ask `canAct`, so they never disagree.
import { can, type Role } from "@/server/auth/permissions";
import type { RequestStatus } from "@/lib/estimation/options";

export type ReviewAction = "submit" | "withdraw" | "request-changes" | "approve" | "reopen";

export const TRANSITIONS: Record<ReviewAction, { from: RequestStatus[]; to: RequestStatus }> = {
  submit: { from: ["DRAFT", "CHANGES_REQUESTED"], to: "IN_REVIEW" },
  withdraw: { from: ["IN_REVIEW"], to: "DRAFT" },
  "request-changes": { from: ["IN_REVIEW"], to: "CHANGES_REQUESTED" },
  approve: { from: ["IN_REVIEW"], to: "APPROVED" },
  reopen: { from: ["APPROVED", "EXPORTED"], to: "DRAFT" },
};

export type ReviewActor = { id: string; role: Role | null };
export type ReviewSubject = {
  ownerId: string;
  status: RequestStatus;
  reviewerId: string | null;
  origin: "NEW" | "IMPORTED";
};
export type ActCheck = { ok: true } | { ok: false; status: 403 | 409; message: string };

export const NOT_IN_REVIEW = "This request is no longer in review";
export const OWN_REVIEW = "You can't review your own request";
export const OWN_APPROVAL = "You can't approve your own request";
export const IMPORTED_LOCKED = "Imported projects can't be edited";
export const NOT_REVIEWER = "Only a Tech Lead or Architect can review estimates";

export const STATUS_REFUSAL: Record<ReviewAction, string> = {
  submit: "Only a Draft or a request with changes requested can be submitted",
  withdraw: NOT_IN_REVIEW,
  "request-changes": NOT_IN_REVIEW,
  approve: NOT_IN_REVIEW,
  reopen: "Only an approved request can be edited as a new version",
};

const refuse = (status: 403 | 409, message: string): ActCheck => ({ ok: false, status, message });

/** Approved and Exported both count as approved (Exported is for the client-facing export). */
export const isApproved = (status: RequestStatus) => status === "APPROVED" || status === "EXPORTED";

/** Whether `actor` may take `action` on `request` now; permission first, then status. */
export function canAct(action: ReviewAction, actor: ReviewActor, request: ReviewSubject): ActCheck {
  const forApprover = action === "approve" || action === "request-changes";
  if (forApprover) {
    if (!can(actor.role, "estimate.approve")) return refuse(403, NOT_REVIEWER);
  } else {
    const ownerOrAdmin = request.ownerId === actor.id || can(actor.role, "estimate.edit-any");
    if (!can(actor.role, "estimate.edit") || !ownerOrAdmin) {
      return refuse(403, "Only the owner or an Admin can do this");
    }
    if (request.origin === "IMPORTED") return refuse(403, IMPORTED_LOCKED);
  }

  if (!TRANSITIONS[action].from.includes(request.status)) {
    return refuse(409, STATUS_REFUSAL[action]);
  }

  if (forApprover) {
    if (request.ownerId === actor.id) {
      return refuse(403, action === "approve" ? OWN_APPROVAL : OWN_REVIEW);
    }
    if (request.reviewerId !== actor.id) {
      return refuse(403, "This request is assigned to another reviewer");
    }
  }
  return { ok: true };
}

/** Who may be chosen as the Approver: an active Tech Lead or Architect who isn't the owner. */
export function isEligibleReviewer(
  person: { id: string; role: Role | null; status: "ACTIVE" | "DEACTIVATED" },
  ownerId: string,
): boolean {
  return (
    person.status === "ACTIVE" && can(person.role, "estimate.approve") && person.id !== ownerId
  );
}

/** Comments: the assigned Approver, the owner or an Admin, while In review or Changes requested. */
export function canComment(actor: ReviewActor, request: ReviewSubject): boolean {
  if (request.status !== "IN_REVIEW" && request.status !== "CHANGES_REQUESTED") return false;
  return (
    request.ownerId === actor.id ||
    request.reviewerId === actor.id ||
    can(actor.role, "estimate.edit-any")
  );
}
