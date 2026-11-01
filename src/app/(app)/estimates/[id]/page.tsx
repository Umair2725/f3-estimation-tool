import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { ui } from "@/components/ui";
import { NFR_AREAS, PART_LABELS, PARTS, STEPS } from "@/lib/estimation/options";
import { lastActiveLabel } from "@/lib/relative-time";
import { requireRole } from "@/server/auth/session";
import { getRequest } from "@/server/estimation-requests";
import { ServiceError } from "@/server/service-error";
import { formatHours } from "@/lib/estimation/totals";
import { latestActualTotals } from "@/server/actuals";
import { OUTCOME_LABELS, outcomeChoices } from "@/server/outcome";
import { DeleteDraft } from "./delete-draft";
import { OutcomeControls } from "./outcome-controls";
import { ReviewCard } from "./review-card";
import { historyLabel, reviewStatusLine } from "@/lib/review/labels";
import { getReviewPanel, markRequestRead } from "@/server/review";

export const metadata: Metadata = { title: "Estimation request · F3 Estimation Tool" };

export default async function RequestPage({ params, searchParams }: PageProps<"/estimates/[id]">) {
  const { id } = await params;
  const { notice } = await searchParams;
  const user = await requireRole(`/estimates/${id}`);
  if (!user) return null; // the layout shows the waiting page
  const request = await getRequest(user, id).catch((err) => {
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  });
  const [actualTotals, review] = await Promise.all([
    latestActualTotals([request.id]),
    getReviewPanel(user, id),
    markRequestRead(user, id),
  ]);
  const actualTotal = actualTotals.get(request.id);
  const reviewOpenable = review.status !== "DRAFT" && review.origin === "NEW";
  const c = request.considerations;
  const nfr = NFR_AREAS.filter((a) => c.nfr[a.key]?.enabled).map((a) => ({
    label: a.label,
    note: c.nfr[a.key]?.note ?? "",
  }));
  const list = (items: string[]) => (items.length ? items.join(", ") : "–");

  const sections: { step: number; rows: [string, React.ReactNode][] }[] = [
    {
      step: 1,
      rows: [
        ["Project", request.projectName],
        ["Client", request.clientName ?? "–"],
        ["Project manager", request.projectManager || "–"],
        ["Date", request.projectDate],
      ],
    },
    {
      step: 2,
      rows: [
        ["Application types", list(request.applicationTypes)],
        ["Operating systems", list(request.operatingSystems)],
        ["Browsers", list(request.browsers)],
        [
          "Parts and tech stack",
          request.parts.length ? (
            <ul className="flex flex-col gap-1">
              {request.parts.map((p) => (
                <li key={p.part}>
                  <span className="font-semibold">{PART_LABELS[p.part]}</span>:{" "}
                  {p.technologies
                    .map((t) => `${t.name}${t.retired ? " (retired)" : ""}`)
                    .join(", ") || "no technology yet"}
                </li>
              ))}
            </ul>
          ) : (
            "–"
          ),
        ],
      ],
    },
    {
      step: 3,
      rows: [
        ["Hosting", list(c.hosting)],
        ["Environments", list(c.environments)],
        ["App stores", list(c.appStores)],
        ["Compliance", list(c.compliance)],
        [
          "Non-functional",
          nfr.length ? (
            <ul className="flex flex-col gap-1">
              {nfr.map((n) => (
                <li key={n.label}>
                  {n.label}
                  {n.note && <span className="text-foreground-2">: {n.note}</span>}
                </li>
              ))}
            </ul>
          ) : (
            "–"
          ),
        ],
        ["Other considerations", c.other || "–"],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <Link href="/" className="hover:underline">
              Home
            </Link>{" "}
            <span aria-hidden="true">/</span> Estimation request
          </nav>
          <h1 className="mt-1 text-2xl font-bold tracking-tight break-words">
            {request.projectName}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground-2">
            <StatusBadge status={request.status} />
            {request.origin === "IMPORTED" && (
              <span
                className="rounded-full bg-info-bg px-2.5 py-0.5 text-xs font-semibold text-info"
                data-testid="imported-label"
              >
                Imported
              </span>
            )}
            <span>{request.clientName ?? "No client yet"}</span>
            <span>Owner: {request.owner.name}</span>
            <span>Updated {lastActiveLabel(request.updatedAt, new Date()).toLowerCase()}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/estimates/${request.id}/estimate`} className={ui.primaryButton}>
            {request.canEdit ? "Estimate hours" : "View hours"}
          </Link>
          {request.canEdit && (
            <Link href={`/estimates/${request.id}/edit?step=1`} className={ui.secondaryButton}>
              Edit
            </Link>
          )}
          {request.canDelete && <DeleteDraft id={request.id} name={request.projectName} />}
        </div>
      </div>

      <section
        aria-label="Estimate"
        className={`${ui.card} flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4`}
      >
        <div>
          <div className="text-sm text-muted">Total hours (min–max)</div>
          <div className="text-2xl font-bold tabular-nums" data-testid="request-total">
            {request.hours}
            {actualTotal !== undefined && (
              <span className="text-base font-semibold text-foreground-2">
                {" "}
                · actual {formatHours(actualTotal)}
              </span>
            )}
          </div>
        </div>
        <div className="text-sm text-muted">
          {request.lastExport
            ? `Last exported by ${request.lastExport.userName} · ${lastActiveLabel(request.lastExport.createdAt, new Date()).toLowerCase()}`
            : "Not exported yet"}
        </div>
        {request.importedFiles && (
          <div className="text-sm text-muted" data-testid="imported-files">
            Imported from{" "}
            {request.importedFiles.estimate && (
              <a
                className="text-brand-strong underline"
                href={`/settings/import/files/${request.importedFiles.estimate.id}`}
              >
                {request.importedFiles.estimate.fileName}
              </a>
            )}
            {request.importedFiles.actuals && (
              <>
                {" "}
                and{" "}
                <a
                  className="text-brand-strong underline"
                  href={`/settings/import/files/${request.importedFiles.actuals.id}`}
                >
                  {request.importedFiles.actuals.fileName}
                </a>
              </>
            )}{" "}
            · hours are the pre-AI baseline
          </div>
        )}
      </section>

      <section
        aria-labelledby="review-title"
        className={`${ui.card} flex flex-col gap-3 px-5 py-4`}
      >
        <h2 id="review-title" className="text-sm text-muted">
          Review
        </h2>
        <ReviewCard
          id={request.id}
          statusLine={reviewStatusLine(review)}
          can={{
            submit: review.can.submit,
            withdraw: review.can.withdraw,
            reopen: review.can.reopen,
            openReview: reviewOpenable,
          }}
          approverChoices={review.approverChoices}
          preselected={review.reviewer?.id ?? null}
          missing={request.missing.length}
        />
        {review.history.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">
              History ({review.history.length})
            </summary>
            <ol className="mt-2 flex flex-col gap-2" data-testid="review-history">
              {review.history.map((h) => (
                <li key={h.id}>
                  <span className="font-semibold">{historyLabel(h)}</span>
                  <span className="text-muted">
                    {" "}
                    · {h.actorName} · {lastActiveLabel(h.createdAt, new Date()).toLowerCase()}
                  </span>
                  {h.comment && <p className="text-foreground-2">“{h.comment}”</p>}
                </li>
              ))}
            </ol>
          </details>
        )}
      </section>

      <section
        aria-labelledby="outcome-title"
        className={`${ui.card} flex flex-col gap-3 px-5 py-4`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="outcome-title" className="text-sm text-muted">
              Outcome
            </h2>
            <div className="text-lg font-bold" data-testid="outcome">
              {OUTCOME_LABELS[request.outcome]}
              {request.outcome === "LOST" && request.outcomeReason && (
                <span className="text-base font-normal text-foreground-2">
                  {" "}
                  · {request.outcomeReason}
                </span>
              )}
            </div>
          </div>
          {request.outcome !== "NONE" && request.outcome !== "LOST" && (
            <Link href={`/estimates/${request.id}/actuals`} className={ui.secondaryButton}>
              Actual hours
            </Link>
          )}
        </div>
        <OutcomeControls
          id={request.id}
          choices={outcomeChoices(user, { ownerId: request.ownerId, outcome: request.outcome })}
          hasHours={request.hours !== "–"}
        />
      </section>

      {notice === "view-only" && (
        <p role="status" className="rounded-lg bg-info-bg px-3.5 py-3 text-sm text-info">
          Only the owner or an Admin can edit this request. You can view it here.
        </p>
      )}
      {request.canEdit && request.missing.length > 0 && (
        <div className="rounded-lg bg-warn-bg px-3.5 py-3 text-sm text-warn">
          <p className="font-semibold">Still missing:</p>
          <ul className="mt-1 list-disc pl-5">
            {request.missing.map((m) => (
              <li key={m.message}>
                {m.message}{" "}
                <Link
                  className="font-semibold underline"
                  href={`/estimates/${request.id}/edit?step=${m.step}`}
                >
                  Go to {STEPS[m.step - 1].label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        {sections.map((section) => (
          <section key={section.step} aria-labelledby={`s${section.step}`} className={ui.card}>
            <div className={ui.cardHead}>
              <h2 id={`s${section.step}`} className="text-lg font-bold">
                {STEPS[section.step - 1].label}
              </h2>
            </div>
            <dl className="grid gap-x-4 gap-y-3 px-5 py-4 text-sm sm:grid-cols-[170px_1fr]">
              {section.rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <section aria-labelledby="s4" className={ui.card}>
          <div className={ui.cardHead}>
            <h2 id="s4" className="text-lg font-bold">
              Requirements
            </h2>
            <span className="text-sm text-muted">
              {request.features.length} {request.features.length === 1 ? "feature" : "features"}
            </span>
          </div>
          <div className="flex flex-col gap-4 px-5 py-4 text-sm">
            {request.features.length === 0 && <p className="text-muted">No features yet.</p>}
            {PARTS.filter((p) => request.features.some((f) => f.parts.includes(p.value))).map(
              (part) => (
                <div key={part.value}>
                  <h3 className="font-semibold">{part.label}</h3>
                  <ul className="mt-1 flex flex-col gap-1">
                    {request.features
                      .filter((f) => f.parts.includes(part.value))
                      .map((f) => (
                        <li key={f.id}>
                          {f.name}
                          {f.description && (
                            <span className="text-foreground-2"> · {f.description}</span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
