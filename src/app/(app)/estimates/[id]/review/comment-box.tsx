"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { commentAction } from "../../review-actions";

// A comment on the request, a Task or a Sub task (specs/estimate-review "Comments").
export function CommentBox(props: {
  id: string;
  taskId?: string;
  subTaskId?: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(!props.taskId && !props.subTaskId);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="mt-1 text-sm text-brand-strong underline"
        onClick={() => setOpen(true)}
      >
        {props.label}
      </button>
    );
  }
  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await commentAction(props.id, {
            body,
            taskId: props.taskId,
            subTaskId: props.subTaskId,
          });
          if (result.ok) {
            setBody("");
            setError(null);
          } else setError(result.message ?? "That didn't work.");
        });
      }}
    >
      <label className={ui.label}>
        {props.label}
        <textarea
          className={`${ui.input} min-h-16 py-2`}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" className={ui.smallButton} disabled={pending || !body.trim()}>
          Post comment
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-err">
          {error}
        </p>
      )}
    </form>
  );
}
