// Wording for the review status line and history (specs/estimate-review). Pure.
import { STATUS_LABELS, type RequestStatus } from "@/lib/estimation/options";

const day = (d: Date) => d.toISOString().slice(0, 10);

export function reviewStatusLine(review: {
  status: RequestStatus;
  version: number;
  origin: "NEW" | "IMPORTED";
  reviewer: { name: string } | null;
  latestApproval: { version: number; approvedByName: string; approvedAt: Date } | null;
}): string {
  const last = review.latestApproval;
  const approvedEarlier =
    last && last.version < review.version
      ? ` · v${last.version} approved by ${last.approvedByName} on ${day(last.approvedAt)}`
      : "";
  switch (review.status) {
    case "IN_REVIEW":
      return `Waiting for review by ${review.reviewer?.name ?? "an Approver"} · v${review.version}`;
    case "CHANGES_REQUESTED":
      return `Changes requested by ${review.reviewer?.name ?? "the Approver"} · v${review.version}`;
    case "APPROVED":
    case "EXPORTED":
      if (review.origin === "IMPORTED") return "Imported as approved · v1";
      return last
        ? `Approved by ${last.approvedByName} · v${last.version}`
        : `Approved · v${review.version}`;
    default:
      return `Draft · v${review.version}${approvedEarlier}`;
  }
}

export function historyLabel(entry: {
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  version: number;
}): string {
  if (entry.fromStatus === null && entry.toStatus === "APPROVED")
    return `Approved (v${entry.version})`;
  if (entry.fromStatus === "IN_REVIEW" && entry.toStatus === "DRAFT") {
    return `Withdrawn from review (v${entry.version})`;
  }
  if (entry.toStatus === "IN_REVIEW") return `Submitted for review (v${entry.version})`;
  if (entry.toStatus === "DRAFT") return `Editing as version ${entry.version}`;
  return `${STATUS_LABELS[entry.toStatus]} (v${entry.version})`;
}
