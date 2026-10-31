import { STATUS_LABELS, type RequestStatus } from "@/lib/estimation/options";

// Status colours from the approved design: never colour alone, the label is always shown.
const STYLES: Record<RequestStatus, string> = {
  DRAFT: "bg-surface-2 text-foreground-2",
  IN_REVIEW: "bg-info-bg text-info",
  CHANGES_REQUESTED: "bg-warn-bg text-warn",
  APPROVED: "bg-ok-bg text-ok",
  EXPORTED: "bg-ok-bg text-ok",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status]}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}
