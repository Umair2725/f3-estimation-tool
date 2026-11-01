import { ui } from "@/components/ui";
import type { AccuracyReport, Line } from "@/lib/actuals/report";
import { formatHours } from "@/lib/estimation/totals";

// Accuracy report (specs/actual-hours): estimate vs actual by part and Task, variance against Min.

const pct = (v: number | null) => (v === null ? "–" : `${v > 0 ? "+" : ""}${v}%`);
const range = (l: Pick<Line, "estMin" | "estMax">) =>
  `${formatHours(l.estMin)}–${formatHours(l.estMax)}`;

export function AccuracyReportView({ report, final }: { report: AccuracyReport; final: boolean }) {
  return (
    <section aria-labelledby="report-title" className={ui.card} data-testid="accuracy-report">
      <div className={ui.cardHead}>
        <h2 id="report-title" className="text-lg font-bold">
          Accuracy report
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            final ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"
          }`}
        >
          {final ? "Final" : "In progress"}
        </span>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm tabular-nums">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-border">
              <th className="px-5 py-2 text-left font-semibold">Part / Task</th>
              <th className="px-3 py-2 text-right font-semibold">Estimate (h)</th>
              <th className="px-3 py-2 text-right font-semibold">Actual (h)</th>
              <th className="px-5 py-2 text-right font-semibold">Variance vs Min</th>
            </tr>
          </thead>
          <tbody>
            {report.parts.map((part) => (
              <PartRows key={part.label} part={part} />
            ))}
            <tr className="border-t-2 border-border font-semibold">
              <th scope="row" className="px-5 py-2 text-left">
                Matched work
              </th>
              <td className="px-3 py-2 text-right">{range(report.matched)}</td>
              <td className="px-3 py-2 text-right">{formatHours(report.matched.actual)}</td>
              <td className="px-5 py-2 text-right">{pct(report.matched.variance)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-sm text-foreground-2">
        Unplanned work: {report.unplanned.count} rows, {formatHours(report.unplanned.actual)} h.
        Dropped (not built): {report.dropped.count} rows, {range(report.dropped)} h estimated.
        Actual total: <strong>{formatHours(report.actualTotal)} h</strong>.
      </p>
    </section>
  );
}

function PartRows({ part }: { part: AccuracyReport["parts"][number] }) {
  return (
    <>
      <tr className="border-b border-border bg-surface-2 font-semibold">
        <th scope="row" className="px-5 py-2 text-left">
          {part.label}
        </th>
        <td className="px-3 py-2 text-right">{range(part)}</td>
        <td className="px-3 py-2 text-right">{formatHours(part.actual)}</td>
        <td className="px-5 py-2 text-right">{pct(part.variance)}</td>
      </tr>
      {part.tasks.map((task) => (
        <tr key={task.title} className="border-b border-border">
          <th scope="row" className="px-5 py-2 pl-8 text-left font-normal">
            {task.title}
          </th>
          <td className="px-3 py-2 text-right">{range(task)}</td>
          <td className="px-3 py-2 text-right">{formatHours(task.actual)}</td>
          <td className="px-5 py-2 text-right" data-testid="task-variance">
            {pct(task.variance)}
          </td>
        </tr>
      ))}
    </>
  );
}
