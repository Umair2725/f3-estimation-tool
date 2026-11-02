"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import {
  addObservationAction,
  confirmBenchmarkAction,
  decideProposalAction,
  retireBenchmarkAction,
} from "../actions";

// Client controls on a benchmark page (specs/feature-benchmarks). Only allowed ones are shown;
// the server checks again.

type Result = { ok: boolean; message?: string };

function useAction() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const act = (work: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const result = await work();
      setMessage({ ok: result.ok, text: result.message ?? "That didn't work." });
      if (result.ok) after?.();
    });
  const note = message && (
    <p
      role={message.ok ? "status" : "alert"}
      className={`text-sm ${message.ok ? "text-ok" : "text-err"}`}
    >
      {message.text}
    </p>
  );
  return { pending, act, note };
}

export function StatusActions(props: { id: string; canConfirm: boolean; canRetire: boolean }) {
  const { pending, act, note } = useAction();
  const [retiring, setRetiring] = useState(false);
  if (!props.canConfirm && !props.canRetire) return null;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {props.canConfirm && (
          <button
            type="button"
            className={ui.primaryButton}
            disabled={pending}
            onClick={() => act(() => confirmBenchmarkAction(props.id))}
          >
            Confirm
          </button>
        )}
        {props.canRetire && !retiring && (
          <button
            type="button"
            className={ui.secondaryButton}
            disabled={pending}
            onClick={() => setRetiring(true)}
          >
            Retire
          </button>
        )}
        {retiring && (
          <>
            <span className="self-center text-sm">It will no longer be suggested.</span>
            <button
              type="button"
              className={ui.smallButton}
              disabled={pending}
              onClick={() =>
                act(
                  () => retireBenchmarkAction(props.id),
                  () => setRetiring(false),
                )
              }
            >
              Retire it
            </button>
            <button type="button" className={ui.smallButton} onClick={() => setRetiring(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
      {note}
    </div>
  );
}

export function ProposalDecision(props: { id: string }) {
  const { pending, act, note } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          className={ui.smallButton}
          disabled={pending}
          onClick={() => act(() => decideProposalAction(props.id, true))}
        >
          Accept proposal
        </button>
        <button
          type="button"
          className={ui.smallButton}
          disabled={pending}
          onClick={() => act(() => decideProposalAction(props.id, false))}
        >
          Reject proposal
        </button>
      </div>
      {note}
    </div>
  );
}

export function ObservationForm(props: { id: string }) {
  const { pending, act, note } = useAction();
  const today = new Date().toISOString().slice(0, 10);
  const empty = { hours: "", level: "EXPERIENCED", observedOn: today, aiTools: "", note: "" };
  const [fields, setFields] = useState(empty);
  const set = (key: keyof typeof empty) => (e: { target: { value: string } }) =>
    setFields({ ...fields, [key]: e.target.value });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act(
          () => addObservationAction(props.id, fields),
          () => setFields(empty),
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className={ui.label}>
          Hours spent
          <input
            className={`${ui.input} w-28`}
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            value={fields.hours}
            onChange={set("hours")}
          />
        </label>
        <label className={ui.label}>
          Developer level
          <select className={`${ui.input} w-40`} value={fields.level} onChange={set("level")}>
            <option value="EXPERIENCED">Experienced</option>
            <option value="JUNIOR">Junior</option>
            <option value="MIXED">Mixed (recorded only)</option>
          </select>
        </label>
        <label className={ui.label}>
          Date
          <input
            className={`${ui.input} w-40`}
            type="date"
            max={today}
            value={fields.observedOn}
            onChange={set("observedOn")}
          />
        </label>
        <label className={ui.label}>
          AI tools
          <input
            className={`${ui.input} w-44`}
            maxLength={200}
            value={fields.aiTools}
            onChange={set("aiTools")}
          />
        </label>
        <label className={ui.label}>
          Note
          <input
            className={`${ui.input} w-56`}
            maxLength={500}
            value={fields.note}
            onChange={set("note")}
          />
        </label>
        <button type="submit" className={ui.smallButton} disabled={pending || !fields.hours}>
          Add observation
        </button>
      </div>
      {note}
    </form>
  );
}
