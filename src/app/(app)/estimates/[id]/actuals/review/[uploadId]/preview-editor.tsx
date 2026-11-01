"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { matchActuals, type MatchDecisions, type MatchRow } from "@/lib/actuals/match";
import { variance } from "@/lib/actuals/report";
import { hoursSchema } from "@/lib/estimation/schemas";
import { formatHours } from "@/lib/estimation/totals";
import type { UploadPreview } from "@/server/actuals";
import { discardUploadAction, saveUploadAction } from "../../actions";

// Preview of an uploaded actuals file (specs/actual-hours "Preview before saving"). The same
// pure matcher runs here for instant feedback and again on the server when saving.

const STATUS_LABEL: Record<MatchRow["status"], string> = {
  MATCHED: "Matched",
  UNPLANNED: "Unplanned",
  DROPPED: "Dropped",
};

export function PreviewEditor(props: {
  requestId: string;
  uploadId: string;
  preview: UploadPreview;
}) {
  const router = useRouter();
  const { preview } = props;
  const [sheetParts, setSheetParts] = useState<Record<string, string>>({});
  const [rejected, setRejected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const decisions: MatchDecisions = useMemo(
    () => ({
      sheetParts,
      rejected,
      hours: Object.fromEntries(
        Object.entries(hours)
          .filter(([, v]) => v.trim() !== "" && hoursSchema.safeParse(Number(v)).success)
          .map(([k, v]) => [k, Number(v)]),
      ),
    }),
    [sheetParts, rejected, hours],
  );
  const result = useMemo(
    () => matchActuals(preview.estimate, preview.sheets, decisions),
    [preview, decisions],
  );
  const proposalKey = (r: MatchRow) => `${r.key}>${r.subTaskId}`;
  const unresolved = result.rows.filter(
    (r) => r.needsConfirmation && !confirmed.includes(proposalKey(r)),
  );
  const unassigned = result.sheets.filter((s) => s.needsAssignment);
  const badHours = Object.values(hours).some(
    (v) => v.trim() !== "" && !hoursSchema.safeParse(Number(v)).success,
  );
  const canSave = unresolved.length === 0 && unassigned.length === 0 && !badHours;

  function save() {
    startTransition(async () => {
      const r = await saveUploadAction(props.requestId, props.uploadId, decisions);
      if (r.ok) router.push(`/estimates/${props.requestId}/actuals`);
      else setMessage(r.message);
    });
  }
  function cancel() {
    startTransition(async () => {
      await discardUploadAction(props.requestId, props.uploadId);
      router.push(`/estimates/${props.requestId}/actuals`);
    });
  }

  const parts = preview.estimate;
  const devSheets = result.sheets.filter((s) => s.partId !== null || s.needsAssignment);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-foreground-2" role="status" data-testid="match-counts">
        {result.counts.matched} matched · {result.counts.unplanned} unplanned ·{" "}
        {result.counts.dropped} dropped
        {unresolved.length > 0 && ` · ${unresolved.length} to confirm`}
      </p>

      {devSheets.length > 0 && (
        <section aria-labelledby="sheets-title" className={`${ui.card} p-5`}>
          <h2 id="sheets-title" className="text-lg font-bold">
            Sheets
          </h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {devSheets.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">{s.name}</span>
                <label className="inline-flex items-center gap-2">
                  <span className="sr-only">Part for sheet {s.name}</span>
                  <select
                    className={`${ui.input} min-h-9 w-56 text-sm`}
                    aria-label={`Part for sheet ${s.name}`}
                    value={sheetParts[s.name] ?? s.partId ?? ""}
                    onChange={(e) => setSheetParts((m) => ({ ...m, [s.name]: e.target.value }))}
                  >
                    <option value="" disabled>
                      Choose a part…
                    </option>
                    {parts.map((p) => (
                      <option key={p.partId} value={p.partId}>
                        {p.label}
                      </option>
                    ))}
                    <option value="skip">Skip this sheet</option>
                  </select>
                </label>
                {s.needsAssignment && <span className="text-warn">Choose a part</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="rows-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="rows-title" className="text-lg font-bold">
            Rows
          </h2>
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-2 text-left font-semibold">Part / Task / Sub task</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Estimate (h)</th>
                <th className="w-28 px-3 py-2 text-left font-semibold">Actual (h)</th>
                <th className="px-3 py-2 text-right font-semibold">Variance</th>
                <th className="px-5 py-2 text-left font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const v =
                  row.actual === null || row.status !== "MATCHED"
                    ? null
                    : variance(row.estMinTenths / 10, row.actual);
                const key = proposalKey(row);
                return (
                  <tr
                    key={row.key}
                    className="border-b border-border align-top"
                    data-testid="preview-row"
                    data-status={row.status}
                  >
                    <td className="px-5 py-2">
                      <div className="text-xs text-muted">
                        {row.partLabel} · {row.taskTitle}
                      </div>
                      <div className="font-semibold">{row.title}</div>
                    </td>
                    <td className="px-3 py-2">{STATUS_LABEL[row.status]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.status === "UNPLANNED"
                        ? "–"
                        : `${formatHours(row.estMinTenths / 10)}–${formatHours(row.estMaxTenths / 10)}`}
                    </td>
                    <td className="px-3 py-2">
                      {row.status === "DROPPED" ? (
                        <span className="text-muted">Not built</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={9999}
                          step={0.5}
                          className={`${ui.input} min-h-9`}
                          aria-label={`Actual hours for ${row.title}`}
                          value={hours[row.key] ?? String(row.actual ?? "")}
                          onChange={(e) => setHours((h) => ({ ...h, [row.key]: e.target.value }))}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {v === null ? "–" : `${v > 0 ? "+" : ""}${v}%`}
                    </td>
                    <td className="px-5 py-2">
                      <ul className="flex flex-col gap-1 text-xs text-warn">
                        {row.flags.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                      {row.needsConfirmation && (
                        <div className="mt-1 flex gap-2">
                          {confirmed.includes(key) ? (
                            <span className="text-xs font-semibold text-ok">Confirmed</span>
                          ) : (
                            <button
                              type="button"
                              className={ui.smallButton}
                              aria-label={`Confirm match for ${row.title}`}
                              onClick={() => setConfirmed((c) => [...c, key])}
                            >
                              Confirm
                            </button>
                          )}
                          <button
                            type="button"
                            className={ui.smallButton}
                            aria-label={`Reject match for ${row.title}`}
                            onClick={() => {
                              setConfirmed((c) => c.filter((x) => x !== key));
                              setRejected((r) => [...r, key]);
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {preview.warnings.length > 0 && (
        <details className={`${ui.card} p-5`}>
          <summary className="cursor-pointer font-semibold">
            File warnings ({preview.warnings.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-foreground-2">
            {preview.warnings.map((w, i) => (
              <li key={i}>
                {[w.sheet, w.cell ?? (w.row ? `row ${w.row}` : undefined)]
                  .filter(Boolean)
                  .join(" ")}
                {w.sheet ? ": " : ""}
                {w.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <button
          type="button"
          className={ui.primaryButton}
          disabled={pending || !canSave}
          onClick={save}
        >
          Save as a new version
        </button>
        <button type="button" className={ui.secondaryButton} disabled={pending} onClick={cancel}>
          Cancel
        </button>
        {!canSave && (
          <span className="text-sm text-warn">
            {unassigned.length > 0
              ? "Choose a part for every sheet."
              : unresolved.length > 0
                ? "Confirm or reject each proposed match."
                : "Fix the hours marked in red."}
          </span>
        )}
        {message && (
          <span role="alert" className="text-sm text-err">
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
