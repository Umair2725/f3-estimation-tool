"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { answerReferenceAction, declineReferenceAction } from "./actions";

// Reference hours (Sub tasks with Min and Max) or a decline with a reason (specs/feature-matching).
type Row = { key: number; title: string; min: string; max: string };
let seq = 0;
const row = (): Row => ({ key: seq++, title: "", min: "", max: "" });

export function ReferenceForm(props: { id: string; featureName: string }) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(props.featureName);
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [row()]);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (key: number, patch: Partial<Row>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const act = (work: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const result = await work();
      setMessage({ ok: result.ok, text: result.message ?? "That didn't work." });
    });
  const total = rows.reduce(
    (t, r) => ({ min: t.min + (Number(r.min) || 0), max: t.max + (Number(r.max) || 0) }),
    { min: 0, max: 0 },
  );

  return (
    <section aria-labelledby="answer-title" className={`${ui.card} flex flex-col gap-4 p-5`}>
      <h2 id="answer-title" className="text-lg font-bold">
        Add reference hours
      </h2>
      <p className="text-sm text-foreground-2">
        Enter the hours this feature really takes with AI-assisted development, for an experienced
        developer on this part and stack.
      </p>
      <label className={ui.label}>
        Feature title
        <input
          className={ui.input}
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className={ui.label}>
        Description (optional)
        <input
          className={ui.input}
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-1 text-left font-semibold">Sub task</th>
              <th className="w-28 py-1 text-left font-semibold">Min (h)</th>
              <th className="w-28 py-1 text-left font-semibold">Max (h)</th>
              <th className="py-1">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const label = r.title || `Sub task ${i + 1}`;
              return (
                <tr key={r.key} className="border-t border-border">
                  <td className="py-2 pr-2">
                    <input
                      className={`${ui.input} min-h-9`}
                      aria-label={`Reference Sub task ${i + 1} title`}
                      maxLength={200}
                      value={r.title}
                      onChange={(e) => set(r.key, { title: e.target.value })}
                    />
                  </td>
                  {(["min", "max"] as const).map((field) => (
                    <td key={field} className="py-2 pr-2">
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        step={0.5}
                        inputMode="decimal"
                        className={`${ui.input} min-h-9`}
                        aria-label={`${field === "min" ? "Min" : "Max"} hours for ${label}`}
                        value={r[field]}
                        onChange={(e) => set(r.key, { [field]: e.target.value })}
                      />
                    </td>
                  ))}
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      className={ui.smallButton}
                      aria-label={`Remove ${label}`}
                      disabled={rows.length === 1}
                      onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" className={ui.smallButton} onClick={() => setRows([...rows, row()])}>
          Add sub task
        </button>
        <span className="font-semibold tabular-nums">
          Total {total.min}–{total.max} h
        </span>
      </div>

      {!declining && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={ui.primaryButton}
            disabled={pending}
            onClick={() =>
              act(() =>
                answerReferenceAction(props.id, {
                  title,
                  description,
                  subTasks: rows.map((r) => ({ title: r.title, min: r.min, max: r.max })),
                }),
              )
            }
          >
            Save reference hours
          </button>
          <button
            type="button"
            className={ui.secondaryButton}
            disabled={pending}
            onClick={() => setDeclining(true)}
          >
            Decline
          </button>
        </div>
      )}
      {declining && (
        <div className="flex flex-wrap items-end gap-2">
          <label className={ui.label}>
            Why are you declining?
            <input
              className={`${ui.input} w-80`}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={ui.smallButton}
            disabled={pending}
            onClick={() => act(() => declineReferenceAction(props.id, reason))}
          >
            Decline request
          </button>
          <button type="button" className={ui.smallButton} onClick={() => setDeclining(false)}>
            Cancel
          </button>
        </div>
      )}
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-sm ${message.ok ? "text-ok" : "text-err"}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
