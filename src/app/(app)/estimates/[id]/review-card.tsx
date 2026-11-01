"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { reopenAction, submitForReviewAction, withdrawAction } from "../review-actions";

// The review card on the request page (specs/estimate-review). Only the actions this person may
// take are passed in; the server checks again.
export type ReviewCardProps = {
  id: string;
  statusLine: string;
  can: { submit: boolean; withdraw: boolean; reopen: boolean; openReview: boolean };
  approverChoices: { id: string; name: string; roleLabel: string }[];
  preselected: string | null;
  missing: number;
};

export function ReviewCard(props: ReviewCardProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [reviewerId, setReviewerId] = useState(props.preselected ?? "");
  const [confirmingReopen, setConfirmingReopen] = useState(false);

  const act = (work: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const result = await work();
      setMessage({ ok: result.ok, text: result.message ?? "That didn't work." });
      if (result.ok) {
        setChoosing(false);
        setConfirmingReopen(false);
      }
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground-2" data-testid="review-status">
        {props.statusLine}
      </p>
      <div className="flex flex-wrap gap-2">
        {props.can.openReview && (
          <Link href={`/estimates/${props.id}/review`} className={ui.smallButton}>
            Open review
          </Link>
        )}
        {props.can.submit && !choosing && (
          <button
            type="button"
            className={ui.smallButton}
            disabled={pending}
            onClick={() => setChoosing(true)}
          >
            Submit for review
          </button>
        )}
        {props.can.withdraw && (
          <button
            type="button"
            className={ui.smallButton}
            disabled={pending}
            onClick={() => act(() => withdrawAction(props.id))}
          >
            Withdraw
          </button>
        )}
        {props.can.reopen && !confirmingReopen && (
          <button
            type="button"
            className={ui.smallButton}
            disabled={pending}
            onClick={() => setConfirmingReopen(true)}
          >
            Edit as new version
          </button>
        )}
      </div>

      {choosing && (
        <div className="flex flex-col gap-2">
          {props.missing > 0 && (
            <p className="text-sm text-warn">
              Finish the request first: {props.missing}{" "}
              {props.missing === 1 ? "item is" : "items are"} still missing.
            </p>
          )}
          {props.approverChoices.length === 0 ? (
            <p className="text-sm text-warn">
              There is no Tech Lead or Architect to review this yet. Ask an Admin to assign one.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className={ui.label}>
                Approver
                <select
                  className={`${ui.input} min-h-9 w-72`}
                  value={reviewerId}
                  onChange={(e) => setReviewerId(e.target.value)}
                >
                  <option value="">Choose a Tech Lead or Architect</option>
                  {props.approverChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.roleLabel})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={ui.smallButton}
                disabled={pending || !reviewerId}
                onClick={() => act(() => submitForReviewAction(props.id, reviewerId))}
              >
                Submit
              </button>
              <button type="button" className={ui.smallButton} onClick={() => setChoosing(false)}>
                Cancel
              </button>
            </div>
          )}
          <p className="text-sm text-muted">
            The request is locked for editing while it is in review.
          </p>
        </div>
      )}

      {confirmingReopen && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            This starts a new version as a Draft. It needs approval again; the approved version is
            kept.
          </span>
          <button
            type="button"
            className={ui.smallButton}
            disabled={pending}
            onClick={() => act(() => reopenAction(props.id))}
          >
            Start new version
          </button>
          <button
            type="button"
            className={ui.smallButton}
            onClick={() => setConfirmingReopen(false)}
          >
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
    </div>
  );
}
