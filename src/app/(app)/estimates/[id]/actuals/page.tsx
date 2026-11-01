import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ui } from "@/components/ui";
import { lastActiveLabel } from "@/lib/relative-time";
import { getActuals } from "@/server/actuals";
import { requireRole } from "@/server/auth/session";
import { OUTCOME_LABELS } from "@/server/outcome";
import { ServiceError } from "@/server/service-error";
import { ActualsEditor } from "./actuals-editor";
import { AccuracyReportView } from "./report-view";

export const metadata: Metadata = { title: "Actual hours · F3 Estimation Tool" };

export default async function ActualsPage({
  params,
  searchParams,
}: PageProps<"/estimates/[id]/actuals">) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireRole(`/estimates/${id}/actuals`);
  if (!user) return null; // the layout shows the waiting page
  const view = await getActuals(user, id).catch((err) => {
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  });
  const now = new Date();
  const outcome = view.request.outcome;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/" className="hover:underline">
            Home
          </Link>{" "}
          <span aria-hidden="true">/</span>{" "}
          <Link href={`/estimates/${id}`} className="hover:underline">
            {view.request.projectName}
          </Link>{" "}
          <span aria-hidden="true">/</span> Actual hours
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight break-words">
          Actual hours: {view.request.projectName}
        </h1>
        <p className="mt-1.5 text-foreground-2">
          {OUTCOME_LABELS[outcome]}
          {view.latest
            ? ` · version ${view.latest.number} by ${view.latest.createdBy}, ${lastActiveLabel(view.latest.createdAt, now).toLowerCase()}`
            : " · no actual hours yet"}
        </p>
      </div>

      {typeof error === "string" && (
        <p role="alert" className="rounded-lg bg-err-bg px-3.5 py-3 text-sm text-err">
          {error}
        </p>
      )}
      {outcome === "DELIVERED" && (
        <p role="status" className="rounded-lg bg-info-bg px-3.5 py-3 text-sm text-info">
          Delivered: actual hours are final
          {view.canRecord ? ". As an Admin you can still change them." : "."}
        </p>
      )}
      {(outcome === "NONE" || outcome === "LOST") && (
        <p role="status" className="rounded-lg bg-warn-bg px-3.5 py-3 text-sm text-warn">
          Mark the project as won first, on the request page, to record actual hours.
        </p>
      )}
      {!view.canRecord && outcome === "IN_DELIVERY" && (
        <p role="status" className="rounded-lg bg-info-bg px-3.5 py-3 text-sm text-info">
          You can view these hours. Tech Leads, Architects and Admins record them.
        </p>
      )}

      {view.canRecord && (
        <section aria-labelledby="upload-title" className={`${ui.card} p-5`}>
          <h2 id="upload-title" className="text-lg font-bold">
            Upload an actuals file
          </h2>
          <p className="mt-1 text-sm text-muted">
            Export the estimate, replace the hours with the real hours (Min and Max the same, or add
            an &ldquo;Actual&rdquo; column), add rows for unplanned work and delete rows that
            weren&apos;t built. You&apos;ll see a preview before anything is saved. .xlsx, up to 10
            MB.
          </p>
          <form
            method="post"
            action={`/estimates/${id}/actuals/upload`}
            encType="multipart/form-data"
            className="mt-3 flex flex-wrap items-center gap-3"
          >
            <label className="sr-only" htmlFor="actuals-file">
              Actuals file
            </label>
            <input
              id="actuals-file"
              name="file"
              type="file"
              required
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="text-sm"
            />
            <button type="submit" className={ui.secondaryButton}>
              Upload and preview
            </button>
          </form>
        </section>
      )}

      <ActualsEditor view={view} />

      {view.report && <AccuracyReportView report={view.report} final={outcome === "DELIVERED"} />}

      {view.history.length > 0 && (
        <section aria-labelledby="history-title" className={`${ui.card} p-5`}>
          <h2 id="history-title" className="text-lg font-bold">
            Versions
          </h2>
          <ol className="mt-2 flex flex-col gap-1.5 text-sm" data-testid="versions">
            {view.history.map((v) => (
              <li key={v.id}>
                <span className="font-semibold">Version {v.number}</span> · {v.createdBy} ·{" "}
                {lastActiveLabel(v.createdAt, now).toLowerCase()} ·{" "}
                {v.source === "FILE" ? (
                  <a
                    className="text-brand-strong underline"
                    href={`/estimates/${id}/actuals/versions/${v.id}/file`}
                  >
                    {v.fileName}
                  </a>
                ) : (
                  "entered in the tool"
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
