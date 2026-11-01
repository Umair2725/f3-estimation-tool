import type { Metadata } from "next";
import Link from "next/link";
import { ui } from "@/components/ui";
import { lastActiveLabel } from "@/lib/relative-time";
import { requireRole } from "@/server/auth/session";
import { listBatches } from "@/server/import/import";

export const metadata: Metadata = { title: "Import past projects · F3 Estimation Tool" };

export default async function ImportPage({ searchParams }: PageProps<"/settings/import">) {
  const { error } = await searchParams;
  const user = await requireRole("/settings/import");
  if (!user) return null; // the layout shows the waiting page
  const batches = await listBatches(user);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          Settings <span aria-hidden="true">/</span> Import past projects
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Import past projects</h1>
        <p className="mt-1.5 text-foreground-2">
          Load Folio3&apos;s approved past estimates, with actual hours for delivered projects. You
          check each project before it becomes part of the knowledge base. Never commit these files
          to git.
        </p>
      </div>

      {typeof error === "string" && (
        <p role="alert" className="rounded-lg bg-err-bg px-3.5 py-3 text-sm text-err">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="zip-title" className={`${ui.card} p-5`}>
          <h2 id="zip-title" className="text-lg font-bold">
            Many projects (.zip)
          </h2>
          <p className="mt-1 text-sm text-muted">
            One folder per project, with the estimate and, for delivered projects, the actuals file
            named <code>…-actuals.xlsx</code>. Up to 150 projects and 100 MB.
          </p>
          <form
            method="post"
            action="/settings/import/upload"
            encType="multipart/form-data"
            className="mt-3 flex flex-col gap-3"
          >
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Zip file
              <input
                name="zip"
                type="file"
                required
                accept=".zip,application/zip"
                className="text-sm font-normal"
              />
            </label>
            <div>
              <button type="submit" className={ui.primaryButton}>
                Upload zip
              </button>
            </div>
          </form>
        </section>

        <section aria-labelledby="single-title" className={`${ui.card} p-5`}>
          <h2 id="single-title" className="text-lg font-bold">
            One project
          </h2>
          <p className="mt-1 text-sm text-muted">
            The estimate, plus the actuals file if it was delivered. .xlsx, up to 10 MB each.
          </p>
          <form
            method="post"
            action="/settings/import/upload"
            encType="multipart/form-data"
            className="mt-3 flex flex-col gap-3"
          >
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Estimate file
              <input
                name="estimate"
                type="file"
                required
                accept=".xlsx"
                className="text-sm font-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Actuals file (optional)
              <input name="actuals" type="file" accept=".xlsx" className="text-sm font-normal" />
            </label>
            <div>
              <button type="submit" className={ui.primaryButton}>
                Upload project
              </button>
            </div>
          </form>
        </section>
      </div>

      <section aria-labelledby="batches-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="batches-title" className="text-lg font-bold">
            Batches
          </h2>
        </div>
        {batches.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Nothing imported yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {batches.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/settings/import/${b.id}`}
                    className="font-semibold text-brand-strong hover:underline"
                  >
                    {b.sourceName}
                  </Link>
                  <div className="text-muted">
                    {b.createdBy} · {lastActiveLabel(b.createdAt, now).toLowerCase()}
                  </div>
                </div>
                <span className="text-foreground-2">
                  {b.counts.imported} imported · {b.counts.waiting} waiting ·{" "}
                  {b.counts.skipped + b.counts.rejected} skipped or rejected · {b.counts.failed}{" "}
                  failed
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
