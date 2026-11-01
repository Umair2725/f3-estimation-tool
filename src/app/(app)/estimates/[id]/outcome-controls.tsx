"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import type { Outcome } from "@/server/outcome";
import { setOutcomeAction } from "../actions";

// Outcome buttons on the request page (specs/project-outcome). Only the choices this person may
// make are passed in; the server checks again.
const BUTTONS: Record<Outcome, string> = {
  IN_DELIVERY: "Mark as won",
  LOST: "Mark as lost",
  DELIVERED: "Mark as delivered",
  NONE: "Clear outcome",
};

export function OutcomeControls(props: { id: string; choices: Outcome[]; hasHours: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [losing, setLosing] = useState(false);
  const [reason, setReason] = useState("");

  if (props.choices.length === 0) return null;
  if (!props.hasHours) {
    return <p className="text-sm text-muted">Estimate hours before recording an outcome.</p>;
  }

  const set = (outcome: Outcome, why?: string) =>
    startTransition(async () => {
      const result = await setOutcomeAction(props.id, outcome, why);
      if (!result.ok) setError(result.message ?? "That didn't work.");
      else {
        setError(null);
        setLosing(false);
      }
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {props.choices.map((o) =>
          o === "LOST" ? (
            <button
              key={o}
              type="button"
              className={ui.smallButton}
              disabled={pending}
              onClick={() => setLosing(true)}
            >
              {BUTTONS[o]}
            </button>
          ) : (
            <button
              key={o}
              type="button"
              className={ui.smallButton}
              disabled={pending}
              onClick={() => set(o)}
            >
              {o === "IN_DELIVERY" && !props.choices.includes("NONE") && props.choices.length === 1
                ? "Reopen (back to in delivery)"
                : BUTTONS[o]}
            </button>
          ),
        )}
      </div>
      {losing && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Reason (optional)
            <input
              className={`${ui.input} min-h-9 w-72`}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={ui.smallButton}
            disabled={pending}
            onClick={() => set("LOST", reason)}
          >
            Confirm lost
          </button>
          <button type="button" className={ui.smallButton} onClick={() => setLosing(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-err">
          {error}
        </p>
      )}
    </div>
  );
}
