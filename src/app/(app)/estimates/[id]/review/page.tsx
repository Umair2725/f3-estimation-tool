import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { ui } from "@/components/ui";
import { formatRange, formatUsd } from "@/lib/estimation/totals";
import { lastActiveLabel } from "@/lib/relative-time";
import { reviewStatusLine } from "@/lib/review/labels";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { requireRole } from "@/server/auth/session";
import { getReview, markRequestRead, type ReviewComment } from "@/server/review";
import { ServiceError } from "@/server/service-error";
import { CommentBox } from "./comment-box";
import { DecisionPanel } from "./decision-panel";

export const metadata: Metadata = { title: "Review · F3 Estimation Tool" };

// The review page (specs/estimate-review "Review page"): everyone with a role can read it; only
// the assigned Approver gets Approve and Request changes.
export default async function ReviewPage({ params }: PageProps<"/estimates/[id]/review">) {
  const { id } = await params;
  const user = await requireRole(`/estimates/${id}/review`);
  if (!user) return null;
  const review = await getReview(user, id).catch((err) => {
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  });
  await markRequestRead(user, id);
  const { estimate, panel, totals, attention, comments } = review;
  const now = new Date();
  const forTarget = (key: "taskId" | "subTaskId", target: string) =>
    comments.filter((c) => c[key] === target);
  const liveTargets = new Set(
    estimate.parts.flatMap((p) =>
      p.tasks.flatMap((t) => [t.taskId, ...t.subTasks.map((s) => s.id ?? "")]),
    ),
  );
  const general = comments.filter(
    (c) =>
      (!c.taskId && !c.subTaskId) ||
      // Kept with its title when the Task or Sub task was removed.
      ![c.taskId, c.subTaskId].some((t) => t && liveTargets.has(t)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <Link href="/" className="hover:underline">
              Home
            </Link>{" "}
            <span aria-hidden="true">/</span>{" "}
            <Link href={`/estimates/${id}`} className="hover:underline">
              {estimate.request.projectName}
            </Link>{" "}
            <span aria-hidden="true">/</span> Review
          </nav>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight break-words">
            Review: {estimate.request.projectName}
            <StatusBadge status={panel.status} />
          </h1>
          <p className="mt-1.5 text-sm text-foreground-2">
            {estimate.request.clientName ?? "No client"} · Owner: {review.ownerName}
            {panel.submittedAt &&
              ` · submitted ${lastActiveLabel(panel.submittedAt, now).toLowerCase()}`}{" "}
            · {reviewStatusLine(panel)}
          </p>
          {panel.can.approve && user.role && (
            <p className="mt-1 text-sm text-foreground-2">
              You&apos;re reviewing as <strong>{ROLE_LABELS[user.role]}</strong>. Only Tech Leads
              and Architects can approve.
            </p>
          )}
        </div>
        {(panel.can.approve || panel.can.requestChanges) && <DecisionPanel id={id} />}
      </div>

      <section
        aria-label="Totals"
        className={`${ui.card} flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4`}
      >
        <div>
          <div className="text-sm text-muted">Total hours (min–max)</div>
          <div className="text-2xl font-bold tabular-nums" data-testid="review-total">
            {formatRange(totals.total, totals.hasHours)}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted">Cost</div>
          <div className="text-lg font-semibold tabular-nums">
            {totals.hasHours ? `${formatUsd(totals.cost.min)}–${formatUsd(totals.cost.max)}` : "–"}
          </div>
        </div>
        <div className="text-sm">
          <div className="text-muted">Parts</div>
          <ul>
            {estimate.parts.map((p, i) => (
              <li key={p.part}>
                {p.label}: {formatRange(totals.parts[i].total, totals.hasHours)} h
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="attention-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="attention-title" className="text-lg font-bold">
            Needs your attention
          </h2>
        </div>
        <div className="px-5 py-4 text-sm" data-testid="attention">
          {attention.length === 0 ? (
            <p className="text-muted">Nothing flagged.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {attention.map((group) => (
                <li key={group.code}>
                  <span className="font-semibold text-warn">{group.summary}</span>
                  {group.items.some((i) => i.taskId) && (
                    <ul className="mt-1 flex flex-col gap-0.5 pl-4">
                      {group.items.map((item, n) => (
                        <li key={n}>
                          {item.taskId ? (
                            <a className="underline" href={`#task-${item.taskId}`}>
                              {item.message}
                            </a>
                          ) : (
                            item.message
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="tasks-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="tasks-title" className="text-lg font-bold">
            Tasks and Sub tasks
          </h2>
        </div>
        <div className="flex flex-col gap-6 px-5 py-4">
          {estimate.parts.map((part) => (
            <div key={part.part} className="flex flex-col gap-3">
              <h3 className="font-bold">{part.label}</h3>
              {part.tasks.length === 0 && <p className="text-sm text-muted">No Tasks.</p>}
              {part.tasks.map((task) => (
                <div
                  key={task.taskId}
                  id={`task-${task.taskId}`}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="font-semibold">{task.featureName}</div>
                  <Thread comments={forTarget("taskId", task.taskId)} now={now} />
                  {panel.can.comment && (
                    <CommentBox
                      id={id}
                      taskId={task.taskId}
                      label={`Comment on ${task.featureName}`}
                    />
                  )}
                  <ul className="mt-2 flex flex-col divide-y divide-border">
                    {task.subTasks.map((sub) => (
                      <li key={sub.id} className="py-2" data-testid="review-subtask">
                        <div className="flex flex-wrap justify-between gap-2 text-sm">
                          <span>{sub.title}</span>
                          <span className="tabular-nums">
                            {sub.min}–{sub.max} h
                          </span>
                        </div>
                        {sub.comment && <p className="text-sm text-muted">{sub.comment}</p>}
                        <Thread comments={forTarget("subTaskId", sub.id ?? "")} now={now} />
                        {panel.can.comment && sub.id && (
                          <CommentBox
                            id={id}
                            subTaskId={sub.id}
                            label={`Comment on ${sub.title}`}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="comments-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="comments-title" className="text-lg font-bold">
            Comments
          </h2>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          {general.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
          <Thread comments={general} now={now} showTarget />
          {panel.can.comment && <CommentBox id={id} label="Add a comment" />}
        </div>
      </section>
    </div>
  );
}

function Thread(props: { comments: ReviewComment[]; now: Date; showTarget?: boolean }) {
  if (props.comments.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-2" data-testid="comment-thread">
      {props.comments.map((c) => (
        <li key={c.id} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <div className="text-muted">
            <span className="font-semibold text-foreground">{c.authorName}</span> ·{" "}
            {lastActiveLabel(c.createdAt, props.now).toLowerCase()} · v{c.version}
            {props.showTarget && c.targetTitle && ` · on “${c.targetTitle}”`}
          </div>
          <p className="whitespace-pre-wrap">{c.body}</p>
        </li>
      ))}
    </ul>
  );
}
