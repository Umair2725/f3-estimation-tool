import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { ui } from "@/components/ui";
import { filtersToSearch, hasActiveFilters, parseFilters } from "@/lib/estimation/filters";
import { PART_LABELS, STEPS } from "@/lib/estimation/options";
import { lastActiveLabel } from "@/lib/relative-time";
import { requireRole } from "@/server/auth/session";
import { listFilterOptions, listRequests, myDrafts } from "@/server/estimation-requests";
import { formatHours } from "@/lib/estimation/totals";
import { latestActualTotals } from "@/server/actuals";
import { OUTCOME_LABELS } from "@/server/outcome";
import { reviewCount, unreadNotifications } from "@/server/review";
import { RequestFilters } from "./request-filters";

// Home (specs/home-screen, approved design screen 2).
export const instant = false;

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireRole("/");
  if (!user) return null; // the layout shows the waiting page
  const filters = parseFilters(await searchParams);
  const [drafts, list, options, waiting, updates] = await Promise.all([
    myDrafts(user),
    listRequests(user, filters),
    listFilterOptions(user),
    reviewCount(user),
    unreadNotifications(user),
  ]);
  const actuals = await latestActualTotals(list.rows.map((r) => r.id));
  const now = new Date();
  const firstName = user.name.split(" ")[0] || user.name;
  const filtered = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting(now)}, {firstName}
          </h1>
          <p className="mt-1.5 text-foreground-2">
            Pick up where you left off or start a new estimation request.
          </p>
        </div>
        <Link href="/estimates/new" className={`${ui.primaryButton} min-h-12 px-6`}>
          New estimation request
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className={`${ui.card} p-5`} data-testid="my-drafts">
          <div className="text-sm font-semibold text-muted">My drafts</div>
          <div className="mt-1 text-3xl font-bold tabular-nums">{drafts.count}</div>
        </div>
        {waiting > 0 && (
          <Link
            href="/reviews"
            className={`${ui.card} p-5 hover:bg-surface-2`}
            data-testid="awaiting-review"
          >
            <div className="text-sm font-semibold text-muted">Awaiting my review</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">{waiting}</div>
          </Link>
        )}
        {drafts.latest && (
          <section aria-labelledby="continue-title" className={`${ui.card} p-5 lg:col-span-2`}>
            <h2 id="continue-title" className="text-sm font-semibold text-muted">
              Continue where you left off
            </h2>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold break-words">
                  {drafts.latest.clientName ? `${drafts.latest.clientName} · ` : ""}
                  {drafts.latest.projectName}
                </div>
                <div className="text-sm text-muted">
                  Step {drafts.latest.lastStep} of 4: {STEPS[drafts.latest.lastStep - 1].label} ·
                  saved {lastActiveLabel(drafts.latest.updatedAt, now).toLowerCase()}
                </div>
              </div>
              <Link
                href={`/estimates/${drafts.latest.id}/edit?step=${drafts.latest.lastStep}`}
                className={ui.secondaryButton}
              >
                Continue
              </Link>
            </div>
          </section>
        )}
      </div>

      {updates.length > 0 && (
        <section aria-labelledby="updates-title" className={`${ui.card} p-5`}>
          <h2 id="updates-title" className="text-sm font-semibold text-muted">
            Updates
          </h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm" data-testid="updates">
            {updates.map((n) => (
              <li key={n.id}>
                <Link href={updateLink(n)} className="font-semibold hover:underline">
                  {updateText(n)}
                </Link>
                <span className="text-muted">
                  {" "}
                  · {lastActiveLabel(n.createdAt, now).toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="requests" aria-labelledby="requests-title" className={ui.card}>
        <div className={`${ui.cardHead} items-start`}>
          <h2 id="requests-title" className="text-lg font-bold">
            Estimation requests
          </h2>
          <span className="text-sm text-muted">{list.total} found</span>
        </div>
        <RequestFilters filters={filters} options={options} />

        {list.rows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            {filtered ? (
              <>
                <p className="font-semibold">No requests match these filters.</p>
                <Link href="/#requests" className={`${ui.secondaryButton} mt-3`}>
                  Clear filters
                </Link>
              </>
            ) : (
              <>
                <p className="font-semibold">There are no estimation requests yet.</p>
                <Link href="/estimates/new" className={`${ui.primaryButton} mt-3`}>
                  New estimation request
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="whitespace-nowrap text-xs uppercase tracking-wide text-muted">
                <tr className="border-y border-border">
                  <th className="px-5 py-2.5 font-semibold">Project</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Owner</th>
                  <th className="px-3 py-2.5 font-semibold">Parts</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Hours (min–max)</th>
                  <th className="px-3 py-2.5 font-semibold">Updated</th>
                  <th className="px-5 py-2.5 font-semibold">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0"
                    data-testid="request-row"
                  >
                    <td className="min-w-52 px-5 py-3">
                      <div className="font-semibold">{row.projectName}</div>
                      <div className="text-muted">{row.clientName ?? "No client yet"}</div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={row.status} />
                      {row.outcome !== "NONE" && (
                        <span
                          className="mt-1 block text-xs font-semibold text-foreground-2"
                          data-testid="row-outcome"
                        >
                          {OUTCOME_LABELS[row.outcome]}
                        </span>
                      )}
                      {row.origin === "IMPORTED" && (
                        <span
                          className="mt-1 block text-xs font-semibold text-info"
                          data-testid="row-imported"
                        >
                          Imported
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{row.ownerName}</td>
                    <td className="px-3 py-3">
                      {row.parts.map((p) => PART_LABELS[p]).join(" · ") || "–"}
                    </td>
                    <td
                      className="px-3 py-3 text-right whitespace-nowrap tabular-nums"
                      data-testid="request-hours"
                    >
                      {row.hours}
                      {actuals.has(row.id) && (
                        <span className="text-muted">
                          {" "}
                          · actual {formatHours(actuals.get(row.id)!)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted">
                      {lastActiveLabel(row.updatedAt, now)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/estimates/${row.id}`}
                        className="font-semibold text-brand-strong hover:underline"
                        aria-label={`Open ${row.projectName}`}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {list.pageCount > 1 && (
          <nav
            aria-label="Pages"
            className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm"
          >
            <span className="text-muted">
              Page {list.page} of {list.pageCount}
            </span>
            <span className="flex gap-2">
              {list.page > 1 && (
                <Link
                  className={ui.smallButton}
                  href={`/${filtersToSearch({ ...filters, page: list.page - 1 })}#requests`}
                >
                  Previous
                </Link>
              )}
              {list.page < list.pageCount && (
                <Link
                  className={ui.smallButton}
                  href={`/${filtersToSearch({ ...filters, page: list.page + 1 })}#requests`}
                >
                  Next
                </Link>
              )}
            </span>
          </nav>
        )}
      </section>
    </div>
  );
}

function greeting(now: Date): string {
  // Folio3 is in Pakistan (UTC+5); the server may run in UTC.
  const hour = (now.getUTCHours() + 5) % 24;
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Notifications on Home (specs/estimate-review, specs/feature-matching). */
function updateText(n: { kind: string; projectName: string; actorName: string }): string {
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

function updateLink(n: { kind: string; requestId: string }): string {
  if (n.kind === "SUBMITTED") return `/estimates/${n.requestId}/review`;
  if (n.kind === "REFERENCE_REQUESTED") return "/reviews";
  if (n.kind.startsWith("REFERENCE_")) return `/estimates/${n.requestId}/estimate`;
  return `/estimates/${n.requestId}`;
}
