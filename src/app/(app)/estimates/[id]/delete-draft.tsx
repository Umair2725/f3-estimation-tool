"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { deleteRequestAction } from "../actions";

/** "Delete draft" with an inline confirmation step (no browser dialog). */
export function DeleteDraft({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" className={ui.secondaryButton} onClick={() => setConfirming(true)}>
        Delete draft
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm deletion">
      <span className="text-sm">Delete &ldquo;{name}&rdquo;? This can&apos;t be undone.</span>
      <button
        type="button"
        className={`${ui.primaryButton} min-h-9`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteRequestAction(id);
            if (result.ok) router.push("/");
            else setError(result.message ?? "Deleting didn't work.");
          })
        }
      >
        Confirm delete
      </button>
      <button
        type="button"
        className={`${ui.secondaryButton} min-h-9`}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-err">
          {error}
        </p>
      )}
    </div>
  );
}
