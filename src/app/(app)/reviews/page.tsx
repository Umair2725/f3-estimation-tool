import type { Metadata } from "next";
import Link from "next/link";
import { ui } from "@/components/ui";
import { lastActiveLabel } from "@/lib/relative-time";
import { can } from "@/server/auth/permissions";
import { requireRole } from "@/server/auth/session";
import { range } from "@/lib/benchmarks/labels";
import { listProposals } from "@/server/benchmarks/benchmarks";
import { listReferenceRequests } from "@/server/matching/matching";
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
  const references = can(user.role, "reference.provide") ? await listReferenceRequests(user) : null;
  const proposals = can(user.role, "benchmark.decide") ? await listProposals(user) : null;
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

      {references && (
        <section aria-labelledby="references-title" className={ui.card}>
          <div className={ui.cardHead}>
            <h2 id="references-title" className="text-lg font-bold">
              Reference hours requested
            </h2>
            <span className="text-sm text-muted">{references.open.length}</span>
          </div>
          {references.open.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">Nobody is waiting for reference hours.</p>
          ) : (
            <ul className="divide-y divide-border" data-testid="reference-requests">
              {references.open.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold break-words">
                      {r.featureName} · {r.partLabel}
                    </div>
                    <div className="text-sm text-muted">
                      {r.projectName} · asked by {r.askedByName}{" "}
                      {lastActiveLabel(r.createdAt, now).toLowerCase()}
                      {r.note && ` · “${r.note}”`}
                    </div>
                  </div>
                  <Link href={`/references/${r.id}`} className={ui.smallButton}>
                    Add reference hours
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {proposals && (
        <section aria-labelledby="proposals-title" className={ui.card}>
          <div className={ui.cardHead}>
            <h2 id="proposals-title" className="text-lg font-bold">
              Benchmark changes to confirm
            </h2>
            <span className="text-sm text-muted">{proposals.length}</span>
          </div>
          {proposals.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No benchmark changes are waiting.</p>
          ) : (
            <ul className="divide-y divide-border" data-testid="benchmark-proposals">
              {proposals.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold break-words">
                      {p.code} · {p.feature}
                    </div>
                    <div className="text-sm text-muted">
                      {range(p.from.experienced, p.from.junior)} →{" "}
                      {range(p.to.experienced, p.to.junior)} from {p.observations} observations ·{" "}
                      {lastActiveLabel(p.createdAt, now).toLowerCase()}
                    </div>
                  </div>
                  <Link href={`/benchmarks/${p.id}`} className={ui.smallButton}>
                    Review change
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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
