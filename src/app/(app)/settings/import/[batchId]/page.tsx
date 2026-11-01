import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ui } from "@/components/ui";
import { requireRole } from "@/server/auth/session";
import { getBatch } from "@/server/import/import";
import { ServiceError } from "@/server/service-error";
import { ProjectActions } from "./project-actions";

export const metadata: Metadata = { title: "Import batch · F3 Estimation Tool" };

const STATUS: Record<string, { label: string; style: string }> = {
  READY: { label: "Waiting", style: "bg-warn-bg text-warn" },
  APPROVED: { label: "Imported", style: "bg-ok-bg text-ok" },
  REJECTED: { label: "Rejected", style: "bg-surface-2 text-foreground-2" },
  SKIPPED: { label: "Skipped", style: "bg-surface-2 text-foreground-2" },
  FAILED: { label: "Failed", style: "bg-err-bg text-err" },
};

export default async function BatchPage({ params }: PageProps<"/settings/import/[batchId]">) {
  const { batchId } = await params;
  const user = await requireRole("/settings/import");
  if (!user) return null; // the layout shows the waiting page
  const batch = await getBatch(user, batchId).catch((err) => {
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  });
  const c = batch.counts;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/settings/import" className="hover:underline">
            Import past projects
          </Link>{" "}
          <span aria-hidden="true">/</span> {batch.sourceName}
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight break-words">{batch.sourceName}</h1>
        <p className="mt-1.5 text-foreground-2" role="status" data-testid="batch-summary">
          {c.imported} imported · {c.waiting} waiting · {c.skipped} skipped · {c.rejected} rejected
          · {c.failed} failed
        </p>
      </div>

      {batch.notes.length > 0 && (
        <details className={`${ui.card} p-4 text-sm`}>
          <summary className="cursor-pointer font-semibold">
            Ignored files ({batch.notes.length})
          </summary>
          <ul className="mt-2 list-disc pl-5 text-foreground-2">
            {batch.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}

      <section aria-labelledby="projects-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="projects-title" className="text-lg font-bold">
            Projects
          </h2>
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-2 text-left font-semibold">Folder / project</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Contents</th>
                <th className="px-3 py-2 text-left font-semibold">Needs attention</th>
                <th className="px-5 py-2 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {batch.projects.map((p) => {
                const s = STATUS[p.status];
                const attention = [
                  p.failure,
                  p.duplicate && !p.duplicateChoice
                    ? p.duplicate.kind === "same-file"
                      ? "Already imported"
                      : `Possibly a newer version of ${p.duplicate.projectName}`
                    : null,
                  p.status === "READY" && p.unassigned > 0
                    ? `${p.unassigned} sheet(s) need a part`
                    : null,
                  p.warnings > 0 ? `${p.warnings} warning(s)` : null,
                ].filter(Boolean);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-border align-top last:border-b-0"
                    data-testid="import-row"
                    data-folder={p.folder}
                  >
                    <td className="px-5 py-3">
                      <div className="font-semibold">{p.folder}</div>
                      <div className="text-muted">
                        {[p.projectName, p.clientName].filter(Boolean).join(" · ") || "–"}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.style}`}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-foreground-2">
                      {p.status === "FAILED"
                        ? "–"
                        : `${p.subTasks} Sub tasks${p.hasActuals ? " · with actuals" : ""}`}
                    </td>
                    <td className="px-3 py-3 text-warn">
                      {attention.length ? (
                        <ul className="flex flex-col gap-0.5">
                          {attention.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <span className="inline-flex flex-wrap justify-end gap-2">
                        {p.status !== "FAILED" && (
                          <Link
                            href={`/settings/import/${batch.id}/${p.id}`}
                            className={ui.smallButton}
                          >
                            {p.status === "READY" ? "Check" : "View"}
                          </Link>
                        )}
                        {p.requestId && (
                          <Link href={`/estimates/${p.requestId}`} className={ui.smallButton}>
                            Open project
                          </Link>
                        )}
                        {p.status === "READY" && (
                          <ProjectActions projectId={p.id} label={p.folder} />
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
