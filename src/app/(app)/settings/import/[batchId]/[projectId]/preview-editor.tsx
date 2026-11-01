"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { PARTS } from "@/lib/estimation/options";
import { formatHours } from "@/lib/estimation/totals";
import type { DuplicateChoice, ImportDecisions } from "@/lib/import/preview";
import type { getImportedProject } from "@/server/import/import";
import { approveAction, rejectAction, saveDecisionsAction } from "../../actions";

// Preview and corrections for one imported project (specs/historical-import). Corrections are
// saved with the batch; the preview below always shows what approval would create.

type Project = Awaited<ReturnType<typeof getImportedProject>>;

const DUPLICATE_CHOICES: Record<
  "same-file" | "newer-version",
  { value: DuplicateChoice; label: string }[]
> = {
  "same-file": [
    { value: "skip", label: "Skip it" },
    { value: "keep", label: "Keep both" },
  ],
  "newer-version": [
    { value: "new-version", label: "Link as new version" },
    { value: "different", label: "Treat as a different project" },
    { value: "skip", label: "Skip it" },
  ],
};

export function ImportPreviewEditor({ project }: { project: Project }) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<ImportDecisions>(project.decisions);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // Compare with sorted keys: the database (jsonb) doesn't keep key order.
  const dirty = stable(decisions) !== stable(project.decisions);
  const editable = project.status === "READY";
  const preview = project.preview;
  const set = (patch: Partial<ImportDecisions>) => setDecisions((d) => ({ ...d, ...patch }));
  const toggleExcluded = (key: string, on: boolean) =>
    set({
      excluded: on
        ? [...(decisions.excluded ?? []), key]
        : (decisions.excluded ?? []).filter((k) => k !== key),
    });

  const run = (
    fn: () => ReturnType<typeof saveDecisionsAction>,
    ok: string,
    after?: (r: { requestId?: string | null }) => void,
  ) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setMessage({ kind: "ok", text: ok });
        router.refresh();
        after?.(r);
      } else setMessage({ kind: "err", text: r.message });
    });

  if (!preview) {
    return (
      <p className="rounded-lg bg-err-bg px-3.5 py-3 text-sm text-err">
        {project.failure ?? "This project couldn't be read."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {project.status !== "READY" && (
        <p role="status" className="rounded-lg bg-info-bg px-3.5 py-3 text-sm text-info">
          This project was{" "}
          {project.status === "APPROVED" ? "imported" : project.status.toLowerCase()}
          {project.decidedBy ? ` by ${project.decidedBy}` : ""}.
          {project.request && (
            <>
              {" "}
              <Link className="font-semibold underline" href={`/estimates/${project.request.id}`}>
                Open the historical project
              </Link>
            </>
          )}
        </p>
      )}

      {project.duplicate && editable && (
        <fieldset
          className="rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn"
          data-testid="duplicate"
        >
          <legend className="sr-only">Duplicate</legend>
          <p className="font-semibold">
            {project.duplicate.kind === "same-file"
              ? `Already imported as "${project.duplicate.projectName}".`
              : `Possibly a newer version of "${project.duplicate.projectName}".`}
          </p>
          <div className="mt-2 flex flex-wrap gap-4">
            {DUPLICATE_CHOICES[project.duplicate.kind].map((c) => (
              <label key={c.value} className="inline-flex items-center gap-2 text-foreground">
                <input
                  type="radio"
                  name="duplicate"
                  checked={decisions.duplicate === c.value}
                  onChange={() => set({ duplicate: c.value })}
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <section
        aria-labelledby="details-title"
        className={`${ui.card} grid gap-4 p-5 sm:grid-cols-2`}
      >
        <h2 id="details-title" className="text-lg font-bold sm:col-span-2">
          Project details
        </h2>
        <label className={ui.label}>
          Project name
          <input
            className={ui.input}
            disabled={!editable}
            value={decisions.projectName ?? preview.projectName}
            onChange={(e) => set({ projectName: e.target.value })}
          />
        </label>
        <label className={ui.label}>
          Client
          <input
            className={ui.input}
            disabled={!editable}
            value={decisions.clientName ?? preview.clientName}
            onChange={(e) => set({ clientName: e.target.value })}
          />
        </label>
        <p className="text-sm text-muted sm:col-span-2">
          Project manager: {preview.projectManager || "–"} · Date: {preview.dateIso ?? "–"} · QA:{" "}
          {preview.qaPercent ?? "–"}% · PM: {preview.pmPercent ?? "–"}%
        </p>
        {project.actualsFile && editable && (
          <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={!!decisions.swapFiles}
              onChange={(e) => set({ swapFiles: e.target.checked })}
            />
            Swap the estimate and actuals files ({project.estimateFile?.fileName} ↔{" "}
            {project.actualsFile.fileName})
          </label>
        )}
      </section>

      {preview.sheets.map((sheet) => (
        <section key={sheet.name} aria-label={`Sheet ${sheet.name}`} className={ui.card}>
          <div className={ui.cardHead}>
            <h2 className="font-bold">{sheet.name}</h2>
            <label className="inline-flex items-center gap-2 text-sm">
              <span>Part</span>
              <select
                className={`${ui.input} min-h-9 w-56 text-sm`}
                aria-label={`Part for sheet ${sheet.name}`}
                disabled={!editable}
                value={decisions.sheetParts?.[sheet.name] ?? sheet.part ?? ""}
                onChange={(e) =>
                  set({
                    sheetParts: { ...decisions.sheetParts, [sheet.name]: e.target.value as never },
                  })
                }
              >
                <option value="" disabled>
                  Choose a part…
                </option>
                {PARTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
                <option value="skip">Skip this sheet</option>
              </select>
            </label>
          </div>
          {!sheet.skipped && (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <th className="px-5 py-2 text-left font-semibold">Task / Sub task</th>
                    <th className="px-3 py-2 text-right font-semibold">Min–Max (h)</th>
                    <th className="px-3 py-2 text-left font-semibold">Source</th>
                    <th className="px-5 py-2 text-left font-semibold">Include</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.tasks.map((task) => (
                    <FragmentRows
                      key={task.key}
                      task={task}
                      sheet={sheet.name}
                      editable={editable}
                      decisions={decisions}
                      onRename={(key, title) =>
                        set({ renames: { ...decisions.renames, [key]: title } })
                      }
                      onExclude={toggleExcluded}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {project.comparison && (
        <section aria-labelledby="actuals-title" className={`${ui.card} p-5`}>
          <h2 id="actuals-title" className="text-lg font-bold">
            Estimate vs actual
          </h2>
          <p className="mt-1 text-sm text-foreground-2" data-testid="comparison-counts">
            {project.comparison.counts.matched} matched · {project.comparison.counts.unplanned}{" "}
            unplanned · {project.comparison.counts.dropped} dropped
            {project.comparison.counts.toConfirm > 0 &&
              ` · ${project.comparison.counts.toConfirm} matched by similar names (kept and flagged on approval)`}
          </p>
        </section>
      )}

      {project.warnings.length > 0 && (
        <details className={`${ui.card} p-5`}>
          <summary className="cursor-pointer font-semibold">
            File warnings ({project.warnings.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-foreground-2">
            {project.warnings.map((w, i) => (
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

      {editable && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <button
            type="button"
            className={ui.secondaryButton}
            disabled={pending || !dirty}
            onClick={() => run(() => saveDecisionsAction(project.id, decisions), "Changes saved.")}
          >
            Save changes
          </button>
          <button
            type="button"
            className={ui.primaryButton}
            disabled={pending || dirty}
            title={dirty ? "Save your changes first" : undefined}
            onClick={() => run(() => approveAction(project.id), "Imported.")}
          >
            Approve and import
          </button>
          <button
            type="button"
            className={ui.ghostButton}
            disabled={pending}
            onClick={() => run(() => rejectAction(project.id, "REJECTED"), "Rejected.")}
          >
            Reject
          </button>
          <span className="text-sm text-muted">
            {preview.counts.tasks} Tasks, {preview.counts.subTasks} Sub tasks will be imported
            {preview.unassigned.length > 0 &&
              ` · choose a part for ${preview.unassigned.join(", ")}`}
          </span>
          <span aria-live="polite">
            {message && (
              <span
                role={message.kind === "err" ? "alert" : "status"}
                className={`text-sm ${message.kind === "err" ? "text-err" : "text-ok"}`}
              >
                {message.text}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function FragmentRows(props: {
  task: NonNullable<Project["preview"]>["sheets"][number]["tasks"][number];
  sheet: string;
  editable: boolean;
  decisions: ImportDecisions;
  onRename: (key: string, title: string) => void;
  onExclude: (key: string, on: boolean) => void;
}) {
  const { task, decisions } = props;
  const excluded = (key: string) => (decisions.excluded ?? []).includes(key);
  const title = (key: string, fallback: string) => decisions.renames?.[key] ?? fallback;
  return (
    <>
      <tr className="border-b border-border bg-surface-2">
        <td className="px-5 py-2">
          <input
            className={`${ui.input} min-h-9 font-semibold`}
            aria-label={`Task title, ${props.sheet} row ${task.row}`}
            disabled={!props.editable}
            value={title(task.key, task.originalTitle)}
            onChange={(e) => props.onRename(task.key, e.target.value)}
          />
        </td>
        <td className="px-3 py-2" />
        <td className="px-3 py-2 text-muted">row {task.row}</td>
        <td className="px-5 py-2">
          <input
            type="checkbox"
            aria-label={`Include Task ${task.title}`}
            disabled={!props.editable}
            checked={!excluded(task.key)}
            onChange={(e) => props.onExclude(task.key, !e.target.checked)}
          />
        </td>
      </tr>
      {task.subTasks.map((s) => (
        <tr
          key={s.key}
          className={`border-b border-border ${s.excluded ? "opacity-50" : ""}`}
          data-testid="import-subtask"
        >
          <td className="px-5 py-2 pl-8">
            <input
              className={`${ui.input} min-h-9`}
              aria-label={`Sub task title, ${props.sheet} row ${s.row}`}
              disabled={!props.editable}
              value={title(s.key, s.originalTitle)}
              onChange={(e) => props.onRename(s.key, e.target.value)}
            />
          </td>
          <td className="px-3 py-2 text-right tabular-nums">
            {formatHours(s.min)}–{formatHours(s.max)}
          </td>
          <td className="px-3 py-2 text-muted">row {s.row}</td>
          <td className="px-5 py-2">
            <input
              type="checkbox"
              aria-label={`Include ${s.title}`}
              disabled={!props.editable}
              checked={!excluded(s.key)}
              onChange={(e) => props.onExclude(s.key, !e.target.checked)}
            />
          </td>
        </tr>
      ))}
    </>
  );
}

/** JSON with object keys sorted, so equal values compare equal whatever their key order. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}
