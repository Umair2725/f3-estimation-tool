"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { BENCHMARK_PART_LABELS, BENCHMARK_PARTS } from "@/lib/benchmarks/rows";
import { createBenchmarkAction, updateBenchmarkAction, type BenchmarkFields } from "./actions";

// Add or edit a benchmark (specs/feature-benchmarks "Edit, confirm and retire").
export function BenchmarkForm(props: {
  id?: string;
  initial: BenchmarkFields;
  confirmed?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState(props.initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (key: keyof BenchmarkFields) => (e: { target: { value: string } }) =>
    setFields({ ...fields, [key]: e.target.value });
  const hoursChanged =
    fields.experienced !== props.initial.experienced || fields.junior !== props.initial.junior;

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = props.id
            ? await updateBenchmarkAction(props.id, fields)
            : await createBenchmarkAction(fields);
          setMessage({ ok: result.ok, text: result.message ?? "That didn't work." });
        });
      }}
    >
      <label className={`${ui.label} sm:col-span-2`}>
        Feature
        <input
          className={ui.input}
          maxLength={200}
          value={fields.feature}
          onChange={set("feature")}
        />
      </label>
      <label className={ui.label}>
        Module
        <input
          className={ui.input}
          maxLength={100}
          value={fields.module}
          onChange={set("module")}
        />
      </label>
      <label className={ui.label}>
        Part
        <select className={ui.input} value={fields.part} onChange={set("part")}>
          <option value="">Choose a part</option>
          {BENCHMARK_PARTS.map((p) => (
            <option key={p} value={p}>
              {BENCHMARK_PART_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <label className={ui.label}>
        Typical stack
        <input className={ui.input} maxLength={100} value={fields.stack} onChange={set("stack")} />
      </label>
      <label className={ui.label}>
        AI tools used
        <input
          className={ui.input}
          maxLength={200}
          value={fields.aiTools}
          onChange={set("aiTools")}
        />
      </label>
      <label className={`${ui.label} sm:col-span-2`}>
        What one instance includes
        <input
          className={ui.input}
          maxLength={1000}
          value={fields.included}
          onChange={set("included")}
        />
      </label>
      <label className={ui.label}>
        AI hours, experienced developer (Min)
        <input
          className={ui.input}
          type="number"
          min={0}
          step={0.5}
          inputMode="decimal"
          value={fields.experienced}
          onChange={set("experienced")}
        />
      </label>
      <label className={ui.label}>
        AI hours, junior developer (Max)
        <input
          className={ui.input}
          type="number"
          min={0}
          step={0.5}
          inputMode="decimal"
          value={fields.junior}
          onChange={set("junior")}
        />
      </label>
      <label className={`${ui.label} sm:col-span-2`}>
        Notes
        <input className={ui.input} maxLength={1000} value={fields.notes} onChange={set("notes")} />
      </label>
      {props.confirmed && hoursChanged && (
        <p className="text-sm text-warn sm:col-span-2">
          Changing the hours sends this benchmark back to Draft; it needs confirming again.
        </p>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" className={ui.primaryButton} disabled={pending}>
          {props.id ? "Save changes" : "Add benchmark"}
        </button>
        {message && (
          <span
            role={message.ok ? "status" : "alert"}
            className={`text-sm ${message.ok ? "text-ok" : "text-err"}`}
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
