import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ui } from "@/components/ui";
import {
  changeLine,
  hours,
  LEVEL_LABELS,
  range,
  SOURCE_LABELS,
  STATUS_LABELS,
} from "@/lib/benchmarks/labels";
import { BENCHMARK_PART_LABELS } from "@/lib/benchmarks/rows";
import { requireRole } from "@/server/auth/session";
import { getBenchmark } from "@/server/benchmarks/benchmarks";
import { ServiceError } from "@/server/service-error";
import { BenchmarkForm } from "../benchmark-form";
import { ObservationForm, ProposalDecision, StatusActions } from "./benchmark-controls";

export const metadata: Metadata = { title: "Benchmark · F3 Estimation Tool" };

const day = (d: Date) => d.toISOString().slice(0, 10);

// One benchmark (specs/feature-benchmarks): details, edit, confirm, retire, the pending proposal,
// observations, the change log and the trend.
export default async function BenchmarkPage({ params }: PageProps<"/benchmarks/[id]">) {
  const { id } = await params;
  const user = await requireRole(`/benchmarks/${id}`);
  if (!user) return null;
  const b = await getBenchmark(user, id).catch((err) => {
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  });

  // Trend: the pre-AI estimate, then every AI-era value with its date (oldest first).
  const trend = [
    ...(b.preAiMinTenths !== null
      ? [
          {
            when: "Pre-AI estimate",
            value: range(b.preAiMinTenths, b.preAiMaxTenths),
            note: b.preAiSource ?? "",
          },
        ]
      : []),
    ...[...b.changes]
      .reverse()
      .filter(
        (c) =>
          c.toExperienced !== null &&
          ["IMPORT", "EDIT", "RECALCULATED", "PROPOSAL_ACCEPTED", "REFERENCE"].includes(c.kind),
      )
      .map((c) => ({
        when: day(c.createdAt),
        value: range(c.toExperienced, c.toJunior),
        note: "",
      })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <Link href="/benchmarks" className="hover:underline">
              Feature hours
            </Link>{" "}
            <span aria-hidden="true">/</span> {b.code}
          </nav>
          <h1 className="mt-1 text-2xl font-bold tracking-tight break-words">
            {b.code} · {b.feature}
          </h1>
          <p className="mt-1.5 text-foreground-2" data-testid="benchmark-state">
            {BENCHMARK_PART_LABELS[b.part]} · {b.stack} · {STATUS_LABELS[b.status]}
            {b.status === "CONFIRMED" &&
              b.confirmedBy &&
              ` by ${b.confirmedBy.name}${b.confirmedAt ? ` on ${day(b.confirmedAt)}` : ""}`}
          </p>
        </div>
        <StatusActions id={b.id} canConfirm={b.can.confirm} canRetire={b.can.retire} />
      </div>

      <section
        aria-label="Hours"
        className={`${ui.card} flex flex-wrap gap-x-10 gap-y-3 px-5 py-4`}
      >
        <div>
          <div className="text-sm text-muted">With AI (experienced–junior)</div>
          <div className="text-2xl font-bold tabular-nums" data-testid="benchmark-hours">
            {range(b.experiencedTenths, b.juniorTenths)}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted">Pre-AI estimate</div>
          <div className="text-lg font-semibold tabular-nums text-foreground-2">
            {range(b.preAiMinTenths, b.preAiMaxTenths)}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted">Based on</div>
          <div className="text-lg font-semibold">
            {b.projectsCount} {b.projectsCount === 1 ? "project" : "projects"}
          </div>
        </div>
        <div className="text-sm">
          <div className="text-muted">Suggested as</div>
          {b.suggests && b.status !== "RETIRED" && b.part !== "DESIGN" ? (
            <ul>
              {b.suggests.map((s) => (
                <li key={s.title}>
                  {s.title}: {range(s.minTenths, s.maxTenths)}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted">
              {b.part === "DESIGN"
                ? "Not suggested yet: estimates have no Design part."
                : b.status === "RETIRED"
                  ? "Not suggested: retired."
                  : "Not suggested until it has AI-era hours."}
            </span>
          )}
        </div>
      </section>

      {b.proposal && (
        <section
          aria-label="Proposal"
          className="rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn"
          data-testid="proposal"
        >
          <p className="font-semibold">
            Proposed: {range(b.proposal.toExperienced, b.proposal.toJunior)} (now{" "}
            {range(b.experiencedTenths, b.juniorTenths)}), from {b.proposal.observationIds.length}{" "}
            observations. Changes over 15% to a Confirmed benchmark need an Architect.
          </p>
          {b.can.decide && (
            <div className="mt-2">
              <ProposalDecision id={b.id} />
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="details-title" className={ui.card}>
          <div className={ui.cardHead}>
            <h2 id="details-title" className="text-lg font-bold">
              Details
            </h2>
          </div>
          <div className="px-5 py-4 text-sm">
            {b.can.edit ? (
              <BenchmarkForm
                id={b.id}
                confirmed={b.status === "CONFIRMED"}
                initial={{
                  feature: b.feature,
                  module: b.module,
                  part: b.part,
                  stack: b.stack,
                  included: b.included,
                  experienced: b.experiencedTenths === null ? "" : hours(b.experiencedTenths),
                  junior: b.juniorTenths === null ? "" : hours(b.juniorTenths),
                  aiTools: b.aiTools,
                  notes: b.notes,
                }}
              />
            ) : (
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[160px_1fr]">
                <dt className="text-muted">Module</dt>
                <dd>{b.module || "–"}</dd>
                <dt className="text-muted">What it includes</dt>
                <dd>{b.included || "–"}</dd>
                <dt className="text-muted">AI tools used</dt>
                <dd>{b.aiTools || "–"}</dd>
                <dt className="text-muted">Notes</dt>
                <dd>{b.notes || "–"}</dd>
              </dl>
            )}
          </div>
        </section>

        <section aria-labelledby="trend-title" className={ui.card}>
          <div className={ui.cardHead}>
            <h2 id="trend-title" className="text-lg font-bold">
              Trend
            </h2>
          </div>
          <ol className="flex flex-col gap-1 px-5 py-4 text-sm" data-testid="trend">
            {trend.length === 0 && <li className="text-muted">No hours yet.</li>}
            {trend.map((t, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-muted">{t.when}</span>
                <span className="tabular-nums">
                  {t.value}
                  {t.note && <span className="text-muted"> · {t.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section aria-labelledby="obs-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="obs-title" className="text-lg font-bold">
            Observations
          </h2>
          <span className="text-sm text-muted">Last 6 months count double</span>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4 text-sm">
          {b.can.observe && <ObservationForm id={b.id} />}
          {b.observations.length === 0 ? (
            <p className="text-muted">No observations yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]" data-testid="observations">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-1 text-left font-semibold">Date</th>
                    <th className="py-1 text-left font-semibold">Level</th>
                    <th className="py-1 text-right font-semibold">Hours</th>
                    <th className="py-1 text-left font-semibold">Source</th>
                    <th className="py-1 text-left font-semibold">Project</th>
                    <th className="py-1 text-left font-semibold">By</th>
                  </tr>
                </thead>
                <tbody>
                  {b.observations.map((o) => (
                    <tr key={o.id} className="border-t border-border">
                      <td className="py-1">{day(o.observedOn)}</td>
                      <td className="py-1">{LEVEL_LABELS[o.level]}</td>
                      <td className="py-1 text-right tabular-nums">{hours(o.hoursTenths)} h</td>
                      <td className="py-1">
                        {SOURCE_LABELS[o.source]}
                        {o.aiTools && <span className="text-muted"> · {o.aiTools}</span>}
                      </td>
                      <td className="py-1">
                        {o.request ? (
                          <Link className="underline" href={`/estimates/${o.request.id}`}>
                            {o.request.projectName}
                          </Link>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="py-1">{o.createdBy?.name ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="log-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="log-title" className="text-lg font-bold">
            Change log
          </h2>
        </div>
        <ol className="flex flex-col gap-1.5 px-5 py-4 text-sm" data-testid="change-log">
          {b.changes.length === 0 && <li className="text-muted">No changes yet.</li>}
          {b.changes.map((c) => (
            <li key={c.id}>
              <span className="font-semibold">
                {changeLine({
                  kind: c.kind,
                  fromExperienced: c.fromExperienced,
                  toExperienced: c.toExperienced,
                  fromJunior: c.fromJunior,
                  toJunior: c.toJunior,
                  observationCount: c.observationIds.length,
                })}
              </span>
              <span className="text-muted">
                {" "}
                · {c.actor?.name ?? "automatic"} · {day(c.createdAt)}
                {c.note && ` · ${c.note}`}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
