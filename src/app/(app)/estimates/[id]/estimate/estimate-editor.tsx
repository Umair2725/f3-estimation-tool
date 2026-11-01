"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { buildChecklist } from "@/lib/estimation/checklist";
import type { Part } from "@/lib/estimation/options";
import { hoursSchema } from "@/lib/estimation/schemas";
import {
  computeTotals,
  formatHours,
  formatUsd,
  toTenths,
  type MinMax,
} from "@/lib/estimation/totals";
import type { EstimateView } from "@/server/estimates";
import type { ReviewComment } from "@/server/review";
import { CommentBox } from "../review/comment-box";
import { saveEstimateAction } from "./actions";

// The estimate page (specs/estimate-hours, approved design screen 4 without AI). Everything is
// edited locally with live totals and saved with one Save; Export needs a saved estimate.

type SubTaskState = {
  key: string;
  /** Saved Sub tasks keep their id, so review comments stay attached. */
  id?: string;
  title: string;
  min: string;
  max: string;
  comment: string;
  /** Where an imported Sub task came from, e.g. "BackEnd, row 19". */
  source?: string;
};
type TaskState = EstimateView["parts"][number]["tasks"][number] & { rows: SubTaskState[] };
type PartState = Omit<
  EstimateView["parts"][number],
  "tasks" | "deploymentMin" | "deploymentMax" | "assumptions" | "risks"
> & {
  tasks: TaskState[];
  deploymentMin: string;
  deploymentMax: string;
  assumptions: string;
  risks: string;
};
type State = { parts: PartState[]; overheads: EstimateView["overheads"] };

let keySeq = 0;
const newKey = () => `row-${Date.now()}-${keySeq++}`;
const num = (value: string) => (value.trim() === "" ? 0 : Number(value));
const validHours = (value: string) => hoursSchema.safeParse(num(value)).success;

function fromView(view: EstimateView): State {
  return {
    overheads: view.overheads,
    parts: view.parts.map((p) => ({
      ...p,
      deploymentMin: String(p.deploymentMin),
      deploymentMax: String(p.deploymentMax),
      assumptions: p.assumptions.join("\n"),
      risks: p.risks.join("\n"),
      tasks: p.tasks.map((t) => ({
        ...t,
        rows: t.subTasks.map((s) => ({
          key: newKey(),
          id: s.id,
          title: s.title,
          source: s.source,
          min: String(s.min),
          max: String(s.max),
          comment: s.comment,
        })),
      })),
    })),
  };
}

/** What the save action receives; also the snapshot used to detect unsaved changes. */
function toInput(state: State) {
  const lines = (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  return {
    tasks: state.parts.flatMap((p) =>
      p.tasks.map((t) => ({
        taskId: t.taskId,
        subTasks: t.rows.map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          title: r.title.trim(),
          min: num(r.min),
          max: num(r.max),
          comment: r.comment.trim(),
        })),
      })),
    ),
    parts: state.parts.map((p) => ({
      part: p.part,
      deploymentMin: num(p.deploymentMin),
      deploymentMax: num(p.deploymentMax),
      assumptions: lines(p.assumptions),
      risks: lines(p.risks),
    })),
    ...state.overheads,
  };
}

/** Review comments shown on the estimate (specs/estimate-review "Comments"). */
export type EditorReview = { requestId: string; comments: ReviewComment[]; canComment: boolean };

export function EstimateEditor({ view, review }: { view: EstimateView; review: EditorReview }) {
  const router = useRouter();
  const editable = view.request.canEdit;
  const [state, setState] = useState<State>(() => fromView(view));
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(toInput(fromView(view))));
  const [activePart, setActivePart] = useState<Part | null>(view.parts[0]?.part ?? null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const input = useMemo(() => toInput(state), [state]);
  const dirty = JSON.stringify(input) !== savedSnapshot;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const totals = useMemo(
    () =>
      computeTotals({
        parts: input.parts.map((p, i) => ({
          part: p.part,
          tasks: input.tasks
            .filter((t) => state.parts[i].tasks.some((st) => st.taskId === t.taskId))
            .map((t) => ({
              subTasks: t.subTasks.map((s) => ({
                minTenths: toTenths(s.min),
                maxTenths: toTenths(s.max),
              })),
            })),
          deploymentMinTenths: toTenths(p.deploymentMin),
          deploymentMaxTenths: toTenths(p.deploymentMax),
        })),
        qa: { enabled: state.overheads.qaEnabled, percent: state.overheads.qaPercent },
        pm: { enabled: state.overheads.pmEnabled, percent: state.overheads.pmPercent },
        bugFixPercent: state.overheads.bugFixPercent,
        rate: state.overheads.hourlyRate,
      }),
    [input, state],
  );

  const checklist = useMemo(
    () =>
      buildChecklist({
        parts: state.parts.map((p, i) => ({
          part: p.part,
          assumptions: input.parts[i].assumptions,
          risks: input.parts[i].risks,
          tasks: p.tasks.map((t) => ({
            taskId: t.taskId,
            featureName: t.featureName,
            subTasks: input.tasks.find((x) => x.taskId === t.taskId)?.subTasks ?? [],
          })),
        })),
        features: view.features,
        otherConsiderations: view.otherConsiderations,
        overheads: state.overheads,
        approvedRates: view.approvedRates,
        otherClients: view.otherClients,
      }),
    [state, input, view],
  );

  function updatePart(part: Part, patch: (p: PartState) => PartState) {
    setState((s) => ({ ...s, parts: s.parts.map((p) => (p.part === part ? patch(p) : p)) }));
  }
  function updateTask(part: Part, taskId: string, patch: (t: TaskState) => TaskState) {
    updatePart(part, (p) => ({
      ...p,
      tasks: p.tasks.map((t) => (t.taskId === taskId ? patch(t) : t)),
    }));
  }
  function setOverheads(patch: Partial<State["overheads"]>) {
    setState((s) => ({ ...s, overheads: { ...s.overheads, ...patch } }));
  }

  function save() {
    startTransition(async () => {
      const result = await saveEstimateAction(view.request.id, input);
      if (result.ok) {
        setSavedSnapshot(JSON.stringify(input));
        setMessage({ kind: "ok", text: "Estimate saved." });
        router.refresh();
      } else {
        setMessage({ kind: "err", text: result.message });
      }
    });
  }

  const rates = view.approvedRates.includes(state.overheads.hourlyRate)
    ? view.approvedRates
    : [...view.approvedRates, state.overheads.hourlyRate].sort((a, b) => a - b);
  const current = state.parts.find((p) => p.part === activePart) ?? state.parts[0];
  const partTotals = (part: Part) => totals.parts.find((t) => t.part === part);

  if (state.parts.length === 0) {
    return (
      <p className="rounded-lg bg-warn-bg px-3.5 py-3 text-sm text-warn">
        This request has no parts yet. Choose them in the wizard&apos;s &ldquo;Platforms &amp;
        stack&rdquo; step, and add features, to estimate hours.
      </p>
    );
  }

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div
          role="tablist"
          aria-label="Parts"
          className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border"
        >
          {state.parts.map((p) => {
            const t = partTotals(p.part);
            return (
              <button
                key={p.part}
                role="tab"
                type="button"
                id={`tab-${p.part}`}
                aria-selected={p.part === current.part}
                aria-controls={`panel-${p.part}`}
                onClick={() => setActivePart(p.part)}
                className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-muted hover:text-foreground aria-selected:border-brand-strong aria-selected:text-foreground"
              >
                {p.label}
                {t && <span className="ml-2 font-normal tabular-nums">{range(t.total)} h</span>}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`panel-${current.part}`}
          aria-labelledby={`tab-${current.part}`}
          className="flex flex-col gap-4"
        >
          {current.tasks.length === 0 && (
            <p className="text-sm text-muted">
              No features use this part yet. Add features for it in the wizard&apos;s Requirements
              step.
            </p>
          )}
          {current.tasks.map((task) => (
            <TaskCard
              key={task.taskId}
              task={task}
              total={partTotals(current.part)?.tasks[current.tasks.indexOf(task)]}
              editable={editable}
              review={review}
              onChange={(patch) => updateTask(current.part, task.taskId, patch)}
            />
          ))}
          <PartExtras
            part={current}
            environments={view.environments}
            editable={editable}
            onChange={(patch) => updatePart(current.part, patch)}
          />
        </div>
      </div>

      <aside aria-label="Overheads, totals and export" className="flex flex-col gap-4">
        <section aria-labelledby="overheads-title" className={`${ui.card} p-4`}>
          <h2 id="overheads-title" className="font-bold">
            Overheads and rate
          </h2>
          <div className="mt-3 flex flex-col gap-3 text-sm">
            <PercentRow
              label="QA"
              enabled={state.overheads.qaEnabled}
              percent={state.overheads.qaPercent}
              editable={editable}
              onChange={(enabled, percent) =>
                setOverheads({ qaEnabled: enabled, qaPercent: percent })
              }
            />
            <PercentRow
              label="PM"
              enabled={state.overheads.pmEnabled}
              percent={state.overheads.pmPercent}
              editable={editable}
              onChange={(enabled, percent) =>
                setOverheads({ pmEnabled: enabled, pmPercent: percent })
              }
            />
            <label className="flex items-center justify-between gap-3">
              Bug fixing (%)
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className={`${ui.input} w-20 min-h-9`}
                disabled={!editable}
                value={state.overheads.bugFixPercent}
                onChange={(e) => setOverheads({ bugFixPercent: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              Hourly rate (USD)
              <select
                className={`${ui.input} w-28 min-h-9`}
                disabled={!editable}
                value={state.overheads.hourlyRate}
                onChange={(e) =>
                  setOverheads({ hourlyRate: Number(e.target.value), rateConfirmed: false })
                }
              >
                {rates.map((r) => (
                  <option key={r} value={r}>
                    ${r}
                    {view.approvedRates.includes(r) ? "" : " (not approved)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!editable}
                checked={state.overheads.rateConfirmed}
                onChange={(e) => setOverheads({ rateConfirmed: e.target.checked })}
              />
              Rate confirmed for this request
            </label>
          </div>
        </section>

        <section aria-labelledby="totals-title" className={`${ui.card} p-4`}>
          <h2 id="totals-title" className="font-bold">
            Totals (hours)
          </h2>
          <table className="mt-2 w-full text-sm tabular-nums" data-testid="totals">
            <tbody>
              {totals.parts.map((t) => (
                <TotalRow
                  key={t.part}
                  label={state.parts.find((p) => p.part === t.part)!.label}
                  value={t.total}
                />
              ))}
              <TotalRow label="Development" value={totals.development} strong />
              {totals.qa && (
                <TotalRow label={`QA (${state.overheads.qaPercent}%)`} value={totals.qa} />
              )}
              {totals.pm && (
                <TotalRow label={`PM (${state.overheads.pmPercent}%)`} value={totals.pm} />
              )}
              <TotalRow label="Total" value={totals.total} strong testId="grand-total" />
              <tr>
                <th scope="row" className="py-1 text-left font-semibold">
                  Cost
                </th>
                <td className="py-1 text-right font-semibold" data-testid="cost">
                  {formatUsd(totals.cost.min)}–{formatUsd(totals.cost.max)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section aria-labelledby="checklist-title" className={`${ui.card} p-4`}>
          <h2 id="checklist-title" className="font-bold">
            Before you export{" "}
            {checklist.length > 0 && (
              <span className="font-normal text-muted">({checklist.length})</span>
            )}
          </h2>
          {checklist.length === 0 ? (
            <p className="mt-2 text-sm text-ok">No warnings.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5 text-sm text-warn" data-testid="checklist">
              {checklist.slice(0, 20).map((item, i) => (
                <li key={`${item.code}-${i}`}>
                  {item.part ? (
                    <button
                      type="button"
                      className="text-left underline"
                      onClick={() => setActivePart(item.part!)}
                    >
                      {item.message}
                    </button>
                  ) : (
                    item.message
                  )}
                </li>
              ))}
              {checklist.length > 20 && <li>…and {checklist.length - 20} more</li>}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">Warnings don&apos;t stop the internal export.</p>
        </section>

        <div className="sticky bottom-0 flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <div aria-live="polite" className="text-sm empty:hidden">
            {message && (
              <p
                role={message.kind === "err" ? "alert" : "status"}
                className={message.kind === "err" ? "text-err" : "text-ok"}
              >
                {message.text}
              </p>
            )}
          </div>
          {editable && (
            <>
              <span className="text-sm text-muted" data-testid="save-state">
                {dirty ? "Unsaved changes" : "All changes saved"}
              </span>
              <button
                type="button"
                className={ui.primaryButton}
                disabled={pending || !dirty}
                onClick={save}
              >
                Save
              </button>
            </>
          )}
          {dirty ? (
            <button
              type="button"
              className={ui.secondaryButton}
              disabled
              title="Save first, so the file matches what's stored"
            >
              Export (internal)
            </button>
          ) : (
            <a
              className={ui.secondaryButton}
              href={`/estimates/${view.request.id}/export`}
              download
            >
              Export (internal)
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}

function range(value: MinMax) {
  return `${formatHours(value.min)}–${formatHours(value.max)}`;
}

function TotalRow(props: { label: string; value: MinMax; strong?: boolean; testId?: string }) {
  return (
    <tr className={props.strong ? "border-t border-border font-semibold" : ""}>
      <th
        scope="row"
        className={`py-1 text-left ${props.strong ? "font-semibold" : "font-normal"}`}
      >
        {props.label}
      </th>
      <td className="py-1 text-right" data-testid={props.testId}>
        {range(props.value)}
      </td>
    </tr>
  );
}

function PercentRow(props: {
  label: string;
  enabled: boolean;
  percent: number;
  editable: boolean;
  onChange: (enabled: boolean, percent: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={props.enabled}
          disabled={!props.editable}
          onChange={(e) => props.onChange(e.target.checked, props.percent)}
        />
        {props.label}
      </label>
      <label className="inline-flex items-center gap-1">
        <span className="sr-only">{props.label} percentage</span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          className={`${ui.input} w-20 min-h-9`}
          disabled={!props.editable || !props.enabled}
          value={props.percent}
          onChange={(e) => props.onChange(props.enabled, Number(e.target.value))}
        />
        %
      </label>
    </div>
  );
}

function TaskCard(props: {
  task: TaskState;
  total: MinMax | undefined;
  editable: boolean;
  review: EditorReview;
  onChange: (patch: (t: TaskState) => TaskState) => void;
}) {
  const { task, editable } = props;
  const setRows = (rows: SubTaskState[]) => props.onChange((t) => ({ ...t, rows }));
  const setRow = (key: string, patch: Partial<SubTaskState>) =>
    setRows(task.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, by: -1 | 1) => {
    const rows = [...task.rows];
    const [row] = rows.splice(index, 1);
    rows.splice(index + by, 0, row);
    setRows(rows);
  };

  return (
    <section aria-label={`Task ${task.featureName}`} className={ui.card} data-testid="task-card">
      <div className={ui.cardHead}>
        <div className="min-w-0">
          <h3 className="font-bold break-words">{task.featureName}</h3>
          {task.featureDescription && (
            <p className="text-sm text-muted">{task.featureDescription}</p>
          )}
          <Comments review={props.review} taskId={task.taskId} title={task.featureName} />
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {props.total ? range(props.total) : "0–0"} h
        </span>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Sub task</th>
              <th className="w-24 px-2 py-2 text-left font-semibold">Min (h)</th>
              <th className="w-24 px-2 py-2 text-left font-semibold">Max (h)</th>
              <th className="px-2 py-2 text-left font-semibold">Comment</th>
              <th className="px-4 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {task.rows.map((row, index) => {
              const label = row.title || `Sub task ${index + 1}`;
              const minBad = !validHours(row.min);
              const maxBad = !validHours(row.max);
              return (
                <tr key={row.key} className="border-t border-border" data-testid="subtask-row">
                  <td className="px-4 py-2">
                    <input
                      className={`${ui.input} min-h-9`}
                      aria-label={`Sub task title in ${task.featureName}`}
                      value={row.title}
                      maxLength={200}
                      disabled={!editable}
                      onChange={(e) => setRow(row.key, { title: e.target.value })}
                    />
                    {row.source && (
                      <div className="mt-1 text-xs text-muted" data-testid="subtask-source">
                        {row.source}
                      </div>
                    )}
                    {row.id && <Comments review={props.review} subTaskId={row.id} title={label} />}
                  </td>
                  {(["min", "max"] as const).map((field) => (
                    <td key={field} className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        step={0.5}
                        inputMode="decimal"
                        className={`${ui.input} min-h-9 aria-invalid:border-err`}
                        aria-label={`${field === "min" ? "Min" : "Max"} hours for ${label}`}
                        aria-invalid={field === "min" ? minBad : maxBad}
                        value={row[field]}
                        disabled={!editable}
                        onChange={(e) => setRow(row.key, { [field]: e.target.value })}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <input
                      className={`${ui.input} min-h-9`}
                      aria-label={`Comment for ${label}`}
                      value={row.comment}
                      maxLength={1000}
                      disabled={!editable}
                      onChange={(e) => setRow(row.key, { comment: e.target.value })}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {editable && (
                      <span className="inline-flex gap-1">
                        <button
                          type="button"
                          className={ui.smallButton}
                          aria-label={`Move ${label} up`}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={ui.smallButton}
                          aria-label={`Move ${label} down`}
                          disabled={index === task.rows.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className={ui.smallButton}
                          aria-label={`Remove ${label}`}
                          onClick={() => setRows(task.rows.filter((r) => r.key !== row.key))}
                        >
                          ✕
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {task.rows.some((r) => !validHours(r.min) || !validHours(r.max)) && (
        <p className={`${ui.fieldError} px-4 pt-2`}>
          Enter hours from 0 to 9999, with at most one decimal
        </p>
      )}
      {editable && (
        <div className="px-4 py-3">
          <button
            type="button"
            className={ui.smallButton}
            onClick={() =>
              setRows([...task.rows, { key: newKey(), title: "", min: "0", max: "0", comment: "" }])
            }
          >
            Add sub task
          </button>
        </div>
      )}
    </section>
  );
}

function PartExtras(props: {
  part: PartState;
  environments: string[];
  editable: boolean;
  onChange: (patch: (p: PartState) => PartState) => void;
}) {
  const { part, editable } = props;
  const set = (patch: Partial<PartState>) => props.onChange((p) => ({ ...p, ...patch }));
  return (
    <section
      aria-label={`Other work for ${part.label}`}
      className={`${ui.card} flex flex-col gap-4 p-4`}
    >
      <div>
        <h3 className="font-bold">Deployment</h3>
        <p className="text-sm text-muted">
          {props.environments.length
            ? props.environments.join(", ")
            : "No environments chosen in the request"}
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          {(["deploymentMin", "deploymentMax"] as const).map((field) => (
            <label key={field} className="flex flex-col gap-1 text-sm font-semibold">
              {field === "deploymentMin" ? "Min (h)" : "Max (h)"}
              <input
                type="number"
                min={0}
                max={9999}
                step={0.5}
                className={`${ui.input} w-28 min-h-9`}
                value={part[field]}
                disabled={!editable}
                aria-label={`Deployment ${field === "deploymentMin" ? "Min" : "Max"} hours for ${part.label}`}
                onChange={(e) => set({ [field]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(["assumptions", "risks"] as const).map((field) => (
          <label key={field} className="flex flex-col gap-1 text-sm font-semibold">
            {field === "assumptions" ? "Assumptions & constraints" : "Risks"}
            <textarea
              className={`${ui.input} min-h-24 py-2`}
              placeholder="One per line"
              value={part[field]}
              disabled={!editable}
              onChange={(e) => set({ [field]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function Comments(props: {
  review: EditorReview;
  taskId?: string;
  subTaskId?: string;
  title: string;
}) {
  const thread = props.review.comments.filter((c) =>
    props.subTaskId ? c.subTaskId === props.subTaskId : c.taskId === props.taskId,
  );
  if (thread.length === 0 && !props.review.canComment) return null;
  return (
    <div className="mt-1 flex flex-col gap-1">
      {thread.length > 0 && (
        <ul className="flex flex-col gap-1" data-testid="comment-thread">
          {thread.map((c) => (
            <li key={c.id} className="rounded-lg bg-surface-2 px-2 py-1 text-xs">
              <span className="font-semibold">{c.authorName}</span>
              <span className="text-muted"> · v{c.version}: </span>
              <span className="whitespace-pre-wrap">{c.body}</span>
            </li>
          ))}
        </ul>
      )}
      {props.review.canComment && (
        <CommentBox
          id={props.review.requestId}
          taskId={props.taskId}
          subTaskId={props.subTaskId}
          label={`Comment on ${props.title}`}
        />
      )}
    </div>
  );
}
