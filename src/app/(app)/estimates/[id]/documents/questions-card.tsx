"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import {
  addQuestionAction,
  editQuestionAction,
  removeQuestionAction,
  type ActionResult,
} from "./actions";

// Questions for the client on the request page (specs/client-questions).

export type QuestionItem = {
  id: string;
  text: string;
  source: { fileName: string; page: number | null; section: string | null; quote: string } | null;
};

export function QuestionsCard(props: {
  requestId: string;
  questions: QuestionItem[];
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  function perform(action: () => Promise<ActionResult>, after?: () => void) {
    start(async () => {
      const result = await action();
      setNotice(result.ok ? null : result);
      if (result.ok) after?.();
    });
  }

  return (
    <section aria-labelledby="questions-title" className={ui.card} data-testid="client-questions">
      <div className={ui.cardHead}>
        <h2 id="questions-title" className="text-lg font-bold">
          Questions for the client
        </h2>
        <span className="text-sm text-muted">{props.questions.length}</span>
      </div>
      <div aria-live="polite" className="px-5 empty:hidden">
        {notice?.message && (
          <p role="alert" className="mt-3 rounded-lg bg-err-bg px-3.5 py-2.5 text-sm text-err">
            {notice.message}
          </p>
        )}
      </div>
      {props.questions.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">No questions yet.</p>
      ) : (
        <ol className="flex flex-col">
          {props.questions.map((q) => (
            <li
              key={q.id}
              className="flex flex-wrap items-start gap-3 border-b border-border px-5 py-3 text-sm last:border-b-0"
            >
              <div className="min-w-0 flex-1 basis-72">
                {editing?.id === q.id ? (
                  <textarea
                    className={`${ui.input} min-h-14 w-full`}
                    value={editing.text}
                    aria-label="Question"
                    onChange={(e) => setEditing({ id: q.id, text: e.target.value })}
                  />
                ) : (
                  <p>{q.text}</p>
                )}
                {q.source && (
                  <p className="mt-0.5 text-xs text-muted">
                    {q.source.fileName}
                    {q.source.page
                      ? `, page ${q.source.page}`
                      : q.source.section
                        ? `, "${q.source.section}"`
                        : ""}
                  </p>
                )}
              </div>
              {props.canEdit && (
                <div className="flex gap-2">
                  {editing?.id === q.id ? (
                    <>
                      <button
                        type="button"
                        className={ui.smallButton}
                        disabled={pending}
                        onClick={() =>
                          perform(
                            () => editQuestionAction(q.id, editing.text),
                            () => setEditing(null),
                          )
                        }
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className={ui.smallButton}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={ui.smallButton}
                      onClick={() => setEditing({ id: q.id, text: q.text })}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className={ui.smallButton}
                    disabled={pending}
                    aria-label={`Remove question ${q.text}`}
                    onClick={() => perform(() => removeQuestionAction(q.id))}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {props.canEdit && (
        <form
          className="flex flex-wrap items-end gap-2 border-t border-border px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            perform(
              () => addQuestionAction(props.requestId, draft),
              () => setDraft(""),
            );
          }}
        >
          <label className={`${ui.label} min-w-0 flex-1 basis-72`}>
            New question
            <input
              className={ui.input}
              value={draft}
              maxLength={1000}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button type="submit" className={ui.secondaryButton} disabled={pending}>
            Add question
          </button>
        </form>
      )}
    </section>
  );
}
