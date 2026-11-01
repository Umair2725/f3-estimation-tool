"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { findMatchesAction } from "./matching-actions";

// "Find matches for all Tasks" in the estimate page header (specs/feature-matching).
export function FindAllMatches({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex items-center gap-3">
      {message && (
        <span
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-ok" : "text-err"}
        >
          {message.text}
        </span>
      )}
      <button
        type="button"
        className={ui.secondaryButton}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await findMatchesAction(requestId);
            setMessage({ ok: result.ok, text: result.message ?? "That didn't work." });
          })
        }
      >
        {pending ? "Finding matches…" : "Find matches for all Tasks"}
      </button>
    </div>
  );
}
