import type { Metadata } from "next";
import Link from "next/link";
import { ui } from "@/components/ui";
import { lastActiveLabel } from "@/lib/relative-time";
import { can } from "@/server/auth/permissions";
import { requireRole } from "@/server/auth/session";
import { listReviews } from "@/server/review";

export const metadata: Metadata = { title: "Reviews · F3 Estimation Tool" };

// The Reviews page (specs/estimate-review "Reviews page"): Tech Leads and Architects only.
export default async function ReviewsPage() {
  const user = await requireRole("/reviews");
  if (!user) return null; // the layout shows the waiting page
  if (!can(user.role, "estimate.approve")) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <h1 className="text-2xl font-bold tracking-tight">
          You don&apos;t have access to this page
        </h1>
        <p className="mt-2 text-foreground-2">Only Tech Leads and Architects review estimates.</p>
      </div>
    );
  }
  const { waiting, recent } = await listReviews(user);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/" className="hover:underline">
            Home
          </Link>{" "}
          <span aria-hidden="true">/</span> Reviews
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Reviews</h1>
        <p className="mt-1.5 text-foreground-2">
          Estimates submitted to you. Approve them, or send them back with a comment.
        </p>
      </div>

      <section aria-labelledby="waiting-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="waiting-title" className="text-lg font-bold">
            Waiting for my review
          </h2>
          <span className="text-sm text-muted">{waiting.length}</span>
        </div>
        {waiting.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Nothing is waiting for you.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="waiting-reviews">
            {waiting.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold break-words">{r.projectName}</div>
                  <div className="text-sm text-muted">
                    {r.clientName ?? "No client"} · v{r.version} · submitted by {r.ownerName}
                    {r.submittedAt && ` ${lastActiveLabel(r.submittedAt, now).toLowerCase()}`}
                  </div>
                </div>
                <Link href={`/estimates/${r.id}/review`} className={ui.smallButton}>
                  Review
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="recent-title" className="text-lg font-bold">
            Recently reviewed
          </h2>
          <span className="text-sm text-muted">Last 30 days</span>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No reviews in the last 30 days.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <Link href={`/estimates/${r.id}`} className="font-semibold hover:underline">
                    {r.projectName}
                  </Link>
                  <div className="text-sm text-muted">
                    {r.clientName ?? "No client"} · v{r.version} ·{" "}
                    {r.outcome === "APPROVED" ? "Approved" : "Changes requested"}{" "}
                    {lastActiveLabel(r.at, now).toLowerCase()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
