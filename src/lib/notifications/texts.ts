// What a review or reference-hours update says and where it leads (specs/estimate-review,
// specs/feature-matching, specs/email-notifications). Shared by Home and the emails. Pure.

export type UpdateKind =
  | "SUBMITTED"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "REFERENCE_REQUESTED"
  | "REFERENCE_ADDED"
  | "REFERENCE_DECLINED";

export function updateText(n: { kind: string; projectName: string; actorName: string }): string {
  switch (n.kind) {
    case "SUBMITTED":
      return `${n.actorName} submitted ${n.projectName} for your review`;
    case "CHANGES_REQUESTED":
      return `Changes requested on ${n.projectName} by ${n.actorName}`;
    case "REFERENCE_REQUESTED":
      return `${n.actorName} asked you for reference hours on ${n.projectName}`;
    case "REFERENCE_ADDED":
      return `${n.actorName} added reference hours for ${n.projectName}`;
    case "REFERENCE_DECLINED":
      return `${n.actorName} declined a request for reference hours on ${n.projectName}`;
    default:
      return `${n.projectName} approved by ${n.actorName}`;
  }
}

/** The app path an update opens. */
export function updateLink(n: { kind: string; requestId: string }): string {
  if (n.kind === "SUBMITTED") return `/estimates/${n.requestId}/review`;
  if (n.kind === "REFERENCE_REQUESTED") return "/reviews";
  if (n.kind.startsWith("REFERENCE_")) return `/estimates/${n.requestId}/estimate`;
  return `/estimates/${n.requestId}`;
}
