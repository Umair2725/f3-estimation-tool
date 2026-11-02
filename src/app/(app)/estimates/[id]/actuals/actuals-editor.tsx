"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { hoursSchema } from "@/lib/estimation/schemas";
import { formatHours } from "@/lib/estimation/totals";
import type { ActualsView } from "@/server/actuals";
import { saveManualAction } from "./actions";
import { TeamLevelSelect, type TeamLevelChoice } from "./team-level";

// Actual hours entered in the tool (specs/actual-hours "Record hours in the tool"). Saving
// creates a new version; Sub tasks left empty are recorded as not built (Dropped).

type Unplanned = {
  key: string;
  requestPartId: string;
  taskTitle: string;
  title: string;
  actual: string;
};

let seq = 0;
const newKey = () => `u-${Date.now()}-${seq++}`;
const hours = (tenths: number) => formatHours(tenths / 10);
const valid = (value: string) =>
  value.trim() === "" || hoursSchema.safeParse(Number(value)).success;

export function ActualsEditor({ view }: { view: ActualsView }) {
  const router = useRouter();
  const editable = view.canRecord;
  const initial = useMemo(() => {
    const actuals: Record<string, string> = {};
    const unplanned: Unplanned[] = [];
    for (const row of view.rows) {
      if (row.status === "MATCHED" && row.subTaskId && row.actualTenths !== null) {
        actuals[row.subTaskId] = formatHours(row.actualTenths / 10);
      }
      if (row.status === "UNPLANNED" && row.partId) {
        unplanned.push({
          key: newKey(),
          requestPartId: row.partId,
          taskTitle: row.taskTitle,
          title: row.title,
          actual: formatHours((row.actualTenths ?? 0) / 10),
        });
      }
    }
    return { actuals, unplanned };
  }, [view.rows]);

  const [actuals, setActuals] = useState(initial.actuals);
  const [unplanned, setUnplanned] = useState<Unplanned[]>(initial.unplanned);
  const [active, setActive] = useState(view.estimate[0]?.partId ?? "");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [teamLevel, setTeamLevel] = useState<TeamLevelChoice>("");

  if (view.estimate.length === 0) return null;
  const part = view.estimate.find((p) => p.partId === active) ?? view.estimate[0];
  const allValid = Object.values(actuals).every(valid) && unplanned.every((u) => valid(u.actual));

  function save() {
    startTransition(async () => {
      const result = await saveManualAction(view.request.id, {
        teamLevel: teamLevel || null,
        rows: [
          ...Object.entries(actuals)
            .filter(([, v]) => v.trim() !== "")
            .map(([subTaskId, v]) => ({ subTaskId, actual: Number(v) })),
          ...unplanned.map((u) => ({
            unplanned: { requestPartId: u.requestPartId, taskTitle: u.taskTitle, title: u.title },
            actual: u.actual.trim() === "" ? null : Number(u.actual),
          })),
        ],
      });
      if (result.ok) {
        setMessage({ kind: "ok", text: `Saved as version ${result.versionNumber}.` });
        router.refresh();
      } else {
        setMessage({ kind: "err", text: result.message });
      }
    });
  }

  return (
    <section aria-labelledby="enter-title" className={ui.card}>
      <div className={ui.cardHead}>
        <h2 id="enter-title" className="text-lg font-bold">
          {editable ? "Enter actual hours" : "Actual hours"}
        </h2>
        {editable && (
          <span className="text-sm text-muted">Leave a row empty if it wasn&apos;t built.</span>
        )}
      </div>
      <div
        role="tablist"
        aria-label="Parts"
        className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-5"
      >
        {view.estimate.map((p) => (
          <button
            key={p.partId}
            role="tab"
            type="button"
            aria-selected={p.partId === part.partId}
            onClick={() => setActive(p.partId)}
            className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-muted aria-selected:border-brand-strong aria-selected:text-foreground"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={part.label} className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-border">
              <th className="px-5 py-2 text-left font-semibold">Sub task</th>
              <th className="px-3 py-2 text-right font-semibold">Estimate (h)</th>
              <th className="w-32 px-3 py-2 text-left font-semibold">Actual (h)</th>
              <th className="px-5 py-2 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {part.tasks.map((task) => (
              <TaskRows
                key={task.title}
                task={task}
                actuals={actuals}
                editable={editable}
                onChange={(id, value) => setActuals((a) => ({ ...a, [id]: value }))}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 px-5 py-4">
        <h3 className="text-sm font-bold">Unplanned work on {part.label}</h3>
        {unplanned.filter((u) => u.requestPartId === part.partId).length === 0 && (
          <p className="text-sm text-muted">None.</p>
        )}
        {unplanned
          .filter((u) => u.requestPartId === part.partId)
          .map((u) => (
            <div key={u.key} className="flex flex-wrap items-end gap-2" data-testid="unplanned-row">
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Task
                <select
                  className={`${ui.input} min-h-9 w-48 text-sm`}
                  disabled={!editable}
                  value={u.taskTitle}
                  onChange={(e) =>
                    setUnplanned((list) =>
                      list.map((x) => (x.key === u.key ? { ...x, taskTitle: e.target.value } : x)),
                    )
                  }
                >
                  {[...part.tasks.map((t) => t.title), "Unplanned work"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Title
                <input
                  className={`${ui.input} min-h-9 w-56 text-sm`}
                  disabled={!editable}
                  value={u.title}
                  maxLength={200}
                  onChange={(e) =>
                    setUnplanned((list) =>
                      list.map((x) => (x.key === u.key ? { ...x, title: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Actual (h)
                <input
                  type="number"
                  min={0}
                  max={9999}
                  step={0.5}
                  className={`${ui.input} min-h-9 w-24 text-sm`}
                  disabled={!editable}
                  aria-invalid={!valid(u.actual)}
                  value={u.actual}
                  onChange={(e) =>
                    setUnplanned((list) =>
                      list.map((x) => (x.key === u.key ? { ...x, actual: e.target.value } : x)),
                    )
                  }
                />
              </label>
              {editable && (
                <button
                  type="button"
                  className={ui.smallButton}
                  aria-label={`Remove unplanned row ${u.title || ""}`}
                  onClick={() => setUnplanned((list) => list.filter((x) => x.key !== u.key))}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        {editable && (
          <div>
            <button
              type="button"
              className={ui.smallButton}
              onClick={() =>
                setUnplanned((list) => [
                  ...list,
                  {
                    key: newKey(),
                    requestPartId: part.partId,
                    taskTitle: part.tasks[0]?.title ?? "Unplanned work",
                    title: "",
                    actual: "",
                  },
                ])
              }
            >
              Add unplanned row
            </button>
          </div>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
          {view.request.aiEra && <TeamLevelSelect value={teamLevel} onChange={setTeamLevel} />}
          <button
            type="button"
            className={ui.primaryButton}
            disabled={pending || !allValid || (view.request.aiEra && !teamLevel)}
            onClick={save}
          >
            Save as a new version
          </button>
          {!allValid && (
            <span className={ui.fieldError}>
              Enter hours from 0 to 9999, with at most one decimal
            </span>
          )}
          <span aria-live="polite">
            {message && (
              <span
                role={message.kind === "err" ? "alert" : "status"}
                className={message.kind === "err" ? "text-sm text-err" : "text-sm text-ok"}
              >
                {message.text}
              </span>
            )}
          </span>
        </div>
      )}
    </section>
  );
}

function TaskRows(props: {
  task: ActualsView["estimate"][number]["tasks"][number];
  actuals: Record<string, string>;
  editable: boolean;
  onChange: (subTaskId: string, value: string) => void;
}) {
  return (
    <>
      <tr className="border-b border-border bg-surface-2">
        <th
          colSpan={4}
          scope="rowgroup"
          className="px-5 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-foreground-2"
        >
          {props.task.title}
        </th>
      </tr>
      {props.task.subTasks.map((s) => {
        const value = props.actuals[s.id] ?? "";
        return (
          <tr key={s.id} className="border-b border-border" data-testid="actual-row">
            <td className="px-5 py-2">{s.title}</td>
            <td className="px-3 py-2 text-right tabular-nums">
              {hours(s.minTenths)}–{hours(s.maxTenths)}
            </td>
            <td className="px-3 py-2">
              <input
                type="number"
                min={0}
                max={9999}
                step={0.5}
                className={`${ui.input} min-h-9 aria-invalid:border-err`}
                aria-label={`Actual hours for ${s.title}`}
                aria-invalid={!valid(value)}
                disabled={!props.editable}
                value={value}
                onChange={(e) => props.onChange(s.id, e.target.value)}
              />
            </td>
            <td className="px-5 py-2 text-muted">
              {value.trim() === "" ? "Not built" : "Matched"}
            </td>
          </tr>
        );
      })}
    </>
  );
}
