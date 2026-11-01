"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { approveAction, rejectAction } from "../actions";

// Approve / Reject / Skip for one imported project (specs/historical-import). Problems that
// need the preview (unassigned sheets, duplicates) come back as messages.
export function ProjectActions({ projectId, label }: { projectId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => ReturnType<typeof approveAction>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : r.message);
    });
  return (
    <>
      <button
        type="button"
        className={ui.smallButton}
        disabled={pending}
        aria-label={`Approve ${label}`}
        onClick={() => act(() => approveAction(projectId))}
      >
        Approve
      </button>
      <button
        type="button"
        className={ui.smallButton}
        disabled={pending}
        aria-label={`Reject ${label}`}
        onClick={() => act(() => rejectAction(projectId, "REJECTED"))}
      >
        Reject
      </button>
      <button
        type="button"
        className={ui.smallButton}
        disabled={pending}
        aria-label={`Skip ${label}`}
        onClick={() => act(() => rejectAction(projectId, "SKIPPED"))}
      >
        Skip
      </button>
      {error && (
        <span role="alert" className="block w-full text-right text-xs text-err">
          {error}
        </span>
      )}
    </>
  );
}
