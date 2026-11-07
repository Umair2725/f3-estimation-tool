"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import type { EstimateDefaults } from "@/server/estimate-defaults";
import { updateDefaultsAction } from "./actions";

const PERCENTS = [
  { key: "qaPercent", label: "QA", hint: "of total development hours" },
  { key: "pmPercent", label: "PM", hint: "of total development hours" },
  { key: "bugFixPercent", label: "Bug fixing", hint: "of each part's development hours" },
] as const;

export function DefaultsForm({ initial }: { initial: EstimateDefaults }) {
  const [value, setValue] = useState(initial);
  const [newRate, setNewRate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function addRate() {
    const rate = Number(newRate);
    if (!Number.isInteger(rate) || rate < 1 || rate > 1000) {
      setErrors({ approvedRates: "Rates are whole dollars from 1 to 1000" });
      return;
    }
    setErrors({});
    setValue((v) => ({
      ...v,
      approvedRates: [...new Set([...v.approvedRates, rate])].sort((a, b) => a - b),
    }));
    setNewRate("");
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateDefaultsAction(value);
      if (result.ok) {
        setErrors({});
        setNotice({ kind: "ok", text: "Defaults saved. New requests start from these values." });
      } else {
        setErrors(result.fields);
        setNotice({ kind: "err", text: result.message });
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <div aria-live="polite">
        {notice && (
          <p
            role={notice.kind === "err" ? "alert" : "status"}
            className={`rounded-lg px-3.5 py-3 text-sm ${
              notice.kind === "err" ? "bg-err-bg text-err" : "bg-ok-bg text-ok"
            }`}
          >
            {notice.text}
          </p>
        )}
      </div>

      <section aria-labelledby="percent-title" className={`${ui.card} p-5`}>
        <h2 id="percent-title" className="text-lg font-bold">
          Percentages
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {PERCENTS.map((p) => (
            <div key={p.key} className="flex flex-col gap-1">
              <label htmlFor={p.key} className="text-sm font-semibold">
                {p.label} (%)
              </label>
              <input
                id={p.key}
                type="number"
                min={0}
                max={100}
                step={1}
                inputMode="numeric"
                className={ui.input}
                value={value[p.key]}
                aria-describedby={`${p.key}-hint`}
                aria-invalid={!!errors[p.key]}
                onChange={(e) => setValue({ ...value, [p.key]: Number(e.target.value) })}
              />
              <span id={`${p.key}-hint`} className="text-xs text-muted">
                {p.hint}
              </span>
              {errors[p.key] && <span className={ui.fieldError}>{errors[p.key]}</span>}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="rates-title" className={`${ui.card} p-5`}>
        <h2 id="rates-title" className="text-lg font-bold">
          Hourly rates (USD)
        </h2>
        <p className="mt-1 text-sm text-muted">
          Estimators pick from the approved rates. The default is pre-selected on new requests and
          must be confirmed before export.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Approved rates">
          {value.approvedRates.map((rate) => (
            <li
              key={rate}
              className="inline-flex items-center gap-2 rounded-full border border-border-strong px-3 py-1 text-sm font-semibold"
            >
              ${rate}
              {rate === value.defaultRate && (
                <span className="font-normal text-muted">· default</span>
              )}
              <button
                type="button"
                className="text-muted hover:text-err"
                aria-label={`Remove $${rate}`}
                onClick={() =>
                  setValue({
                    ...value,
                    approvedRates: value.approvedRates.filter((r) => r !== rate),
                  })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="new-rate" className="text-sm font-semibold">
              Add a rate
            </label>
            <input
              id="new-rate"
              type="number"
              min={1}
              max={1000}
              step={1}
              inputMode="numeric"
              className={`${ui.input} w-32`}
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
            />
          </div>
          <button type="button" className={ui.smallButton} onClick={addRate}>
            Add rate
          </button>
        </div>
        {errors.approvedRates && <p className={`${ui.fieldError} mt-2`}>{errors.approvedRates}</p>}

        <div className="mt-4 flex flex-col gap-1">
          <label htmlFor="default-rate" className="text-sm font-semibold">
            Default rate
          </label>
          <select
            id="default-rate"
            className={`${ui.input} w-40`}
            value={value.defaultRate}
            aria-invalid={!!errors.defaultRate}
            onChange={(e) => setValue({ ...value, defaultRate: Number(e.target.value) })}
          >
            {!value.approvedRates.includes(value.defaultRate) && (
              <option value={value.defaultRate}>${value.defaultRate} (not approved)</option>
            )}
            {value.approvedRates.map((rate) => (
              <option key={rate} value={rate}>
                ${rate}
              </option>
            ))}
          </select>
          {errors.defaultRate && <span className={ui.fieldError}>{errors.defaultRate}</span>}
        </div>
      </section>

      <section aria-labelledby="ai-guess-title" className={`${ui.card} p-5`}>
        <h2 id="ai-guess-title" className="text-lg font-bold">
          AI guess
        </h2>
        <p className="mt-1 text-sm text-muted">
          An AI guess estimates each Sub task in rounds (one think, write, run and fix cycle). Hours
          are rounds × minutes per round. This value pre-fills the estimator&apos;s field and sizes
          the guesses made when features are added from a document.
        </p>
        <div className="mt-4 flex flex-col gap-1">
          <label htmlFor="minutes-per-round" className="text-sm font-semibold">
            Default minutes per round
          </label>
          <input
            id="minutes-per-round"
            type="number"
            min={1}
            max={480}
            step={1}
            inputMode="numeric"
            className={`${ui.input} w-32`}
            value={value.minutesPerRound}
            aria-invalid={!!errors.minutesPerRound}
            onChange={(e) => setValue({ ...value, minutesPerRound: Number(e.target.value) })}
          />
          {errors.minutesPerRound && (
            <span className={ui.fieldError}>{errors.minutesPerRound}</span>
          )}
        </div>
      </section>

      <div>
        <button type="submit" className={ui.primaryButton} disabled={pending}>
          Save defaults
        </button>
      </div>
    </form>
  );
}
