"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { approveAction, requestChangesAction } from "../../review-actions";

// Approve or Request changes, shown only to the assigned Approver (specs/estimate-review).
export function DecisionPanel(props: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [changing, setChanging] = useState(false);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const act = (work: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const result = await work();
      setMessage({ ok: result.ok, text: result.message ?? "That didn't work." });
      if (result.ok) setChanging(false);
    });

  return (
    <div className="flex max-w-md flex-col gap-2">
      {!changing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={ui.secondaryButton}
            disabled={pending}
            onClick={() => setChanging(true)}
          >
            Request changes
          </button>
          <button
            type="button"
            className={ui.primaryButton}
            disabled={pending}
            onClick={() => act(() => approveAction(props.id))}
          >
            Approve estimate
          </button>
        </div>
      )}
      {changing && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => requestChangesAction(props.id, comment));
          }}
        >
          <label className={ui.label}>
            What should change? (required)
            <textarea
              className={`${ui.input} min-h-20 py-2`}
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={ui.smallButton} disabled={pending}>
              Send back for changes
            </button>
            <button type="button" className={ui.smallButton} onClick={() => setChanging(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-sm ${message.ok ? "text-ok" : "text-err"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
