import type { Metadata } from "next";
import Link from "next/link";
import { ui } from "@/components/ui";
import { range, STATUS_LABELS } from "@/lib/benchmarks/labels";
import { BENCHMARK_PART_LABELS, BENCHMARK_PARTS } from "@/lib/benchmarks/rows";
import { can } from "@/server/auth/permissions";
import { requireRole } from "@/server/auth/session";
import { listBenchmarks } from "@/server/benchmarks/benchmarks";

export const metadata: Metadata = { title: "Feature hours · F3 Estimation Tool" };

// The benchmark library (specs/feature-benchmarks "Benchmark library"): everyone with a role.
export default async function BenchmarksPage({ searchParams }: PageProps<"/benchmarks">) {
  const user = await requireRole("/benchmarks");
  if (!user) return null;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const filters = {
    q: one(sp.q),
    part: one(sp.part),
    status: one(sp.status),
    module: one(sp.module),
    withHours: one(sp.hours) === "1",
  };
  const { rows, modules } = await listBenchmarks(user, filters);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            Knowledge base <span aria-hidden="true">/</span> Feature hours
          </nav>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Feature hours</h1>
          <p className="mt-1.5 max-w-3xl text-foreground-2">
            What common features really take with AI. Experienced-developer hours are suggested as
            Min and junior-developer hours as Max. Pre-AI hours are for comparison only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user.role, "settings.manage") && (
            <Link href="/benchmarks/import" className={ui.secondaryButton}>
              Import
            </Link>
          )}
          {can(user.role, "benchmark.edit") && (
            <Link href="/benchmarks/new" className={ui.primaryButton}>
              New benchmark
            </Link>
          )}
        </div>
      </div>

      <form className={`${ui.card} flex flex-wrap items-end gap-3 p-4`} role="search">
        <label className={ui.label}>
          Search
          <input name="q" defaultValue={filters.q} className={`${ui.input} w-64`} />
        </label>
        <label className={ui.label}>
          Part
          <select name="part" defaultValue={filters.part} className={`${ui.input} w-48`}>
            <option value="">All parts</option>
            {BENCHMARK_PARTS.map((p) => (
              <option key={p} value={p}>
                {BENCHMARK_PART_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.label}>
          Module
          <select name="module" defaultValue={filters.module} className={`${ui.input} w-52`}>
            <option value="">All modules</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.label}>
          Status
          <select name="status" defaultValue={filters.status} className={`${ui.input} w-40`}>
            <option value="">Draft and Confirmed</option>
            <option value="DRAFT">Draft</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="RETIRED">Retired</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
          <input type="checkbox" name="hours" value="1" defaultChecked={filters.withHours} />
          With AI-era hours
        </label>
        <button type="submit" className={ui.secondaryButton}>
          Filter
        </button>
      </form>

      <section aria-labelledby="list-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="list-title" className="text-lg font-bold">
            Benchmarks
          </h2>
          <span className="text-sm text-muted">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No benchmarks match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm" data-testid="benchmark-table">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">ID</th>
                  <th className="px-2 py-2 text-left font-semibold">Feature</th>
                  <th className="px-2 py-2 text-left font-semibold">Part and stack</th>
                  <th className="px-2 py-2 text-right font-semibold">Pre-AI</th>
                  <th className="px-2 py-2 text-right font-semibold">With AI</th>
                  <th className="px-2 py-2 text-right font-semibold">Projects</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={`/benchmarks/${b.id}`} className="underline">
                        {b.code}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-semibold">{b.feature}</div>
                      {b.module && <div className="text-xs text-muted">{b.module}</div>}
                    </td>
                    <td className="px-2 py-2">
                      {BENCHMARK_PART_LABELS[b.part]} · {b.stack}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">
                      {range(b.preAiMinTenths, b.preAiMaxTenths)}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {range(b.experiencedTenths, b.juniorTenths)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{b.projectsCount}</td>
                    <td className="px-4 py-2" data-testid="benchmark-status">
                      {STATUS_LABELS[b.status]}
                      {b.status === "CONFIRMED" && b.confirmedBy && (
                        <span className="text-muted"> · {b.confirmedBy.name}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
