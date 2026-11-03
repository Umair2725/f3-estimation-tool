"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { readAgainAction, removeDocumentAction, type ActionResult } from "./actions";

// Requirement documents on the Requirements step (specs/requirement-documents): upload, status,
// download, read again, remove and the link to review. Refreshes while a document is being read.

export type PanelDocument = {
  id: string;
  fileName: string;
  kind: "CLIENT_REQUIREMENTS" | "FOLIO3_SOW";
  format: "PDF" | "DOCX";
  pageCount: number;
  status: "READING" | "READY" | "FAILED" | "NOT_SET_UP";
  error: string | null;
  uploadedByName: string;
  addedAt: string | null;
  addedByName: string | null;
  counts: {
    features: number;
    details: number;
    assumptions: number;
    risks: number;
    questions: number;
  } | null;
};

export const KIND_LABELS = {
  CLIENT_REQUIREMENTS: "Client requirements",
  FOLIO3_SOW: "Folio3 SOW",
} as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function StatusLine({ doc }: { doc: PanelDocument }) {
  if (doc.status === "READING") {
    return <span className="text-muted">Reading…</span>;
  }
  if (doc.status === "NOT_SET_UP") {
    return (
      <span className="text-muted">AI reading isn&apos;t set up; add the features by hand</span>
    );
  }
  if (doc.status === "FAILED") {
    return <span className="text-err">Failed: {doc.error ?? "reading didn't finish"}</span>;
  }
  const c = doc.counts;
  return (
    <span className="text-ok">
      Ready to review
      {c && (
        <span className="text-muted">
          {" "}
          · {plural(c.features, "feature")}, {plural(c.details, "detail")},{" "}
          {plural(c.assumptions, "assumption")}, {plural(c.risks, "risk")},{" "}
          {plural(c.questions, "question")}
        </span>
      )}
    </span>
  );
}

export function DocumentsPanel(props: {
  requestId: string;
  documents: PanelDocument[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<PanelDocument["kind"]>("CLIENT_REQUIREMENTS");
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const reading = props.documents.some((d) => d.status === "READING");

  // Next.js keeps this page mounted while the person is elsewhere; drop the last action's
  // message and any open confirmation when it's hidden, so they don't come back stale.
  useLayoutEffect(
    () => () => {
      setNotice(null);
      setConfirming(null);
    },
    [],
  );

  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [reading, router]);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setNotice({ ok: false, message: "Choose a PDF or Word (.docx) file" });
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    setUploading(true);
    try {
      const response = await fetch(`/estimates/${props.requestId}/documents`, {
        method: "POST",
        body: form,
      });
      const result = (await response.json().catch(() => null)) as ActionResult | null;
      setNotice(result ?? { ok: false, message: "The upload didn't finish. Try again." });
      if (result?.ok && fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch {
      setNotice({ ok: false, message: "The upload didn't finish. Try again." });
    } finally {
      setUploading(false);
    }
  }

  function perform(action: () => Promise<ActionResult>) {
    start(async () => {
      setNotice(await action());
      setConfirming(null);
    });
  }

  return (
    <section
      aria-labelledby="documents-title"
      className="rounded-xl border border-border bg-surface"
      data-testid="documents-panel"
    >
      <div className="border-b border-border px-4 py-3">
        <h3 id="documents-title" className="font-semibold">
          Requirement documents
        </h3>
        <p className="mt-0.5 text-sm text-muted">
          Upload the client&apos;s RFP or specification (PDF) or a Folio3 SOW (Word). Claude
          proposes the features, details, assumptions, risks and questions with page references; you
          review them before anything is added.
        </p>
      </div>

      <div aria-live="polite" className="px-4 empty:hidden">
        {notice?.message && (
          <p
            role={notice.ok ? "status" : "alert"}
            className={`mt-3 rounded-lg px-3.5 py-2.5 text-sm ${
              notice.ok ? "bg-ok-bg text-ok" : "bg-err-bg text-err"
            }`}
          >
            {notice.message}
          </p>
        )}
      </div>

      {props.canEdit && (
        <form onSubmit={upload} className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className={`${ui.label} min-w-0 flex-1 basis-60`}>
            File
            <input
              ref={fileInput}
              type="file"
              name="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="min-h-10 w-full min-w-0 text-sm font-normal file:mr-3 file:rounded-full file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold"
            />
          </label>
          <label className={ui.label}>
            This is
            <select
              className={`${ui.input} min-h-10 w-full max-w-52`}
              value={kind}
              onChange={(e) => setKind(e.target.value as PanelDocument["kind"])}
            >
              <option value="CLIENT_REQUIREMENTS">{KIND_LABELS.CLIENT_REQUIREMENTS}</option>
              <option value="FOLIO3_SOW">{KIND_LABELS.FOLIO3_SOW}</option>
            </select>
          </label>
          <button type="submit" className={ui.secondaryButton} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <p className="basis-full text-xs text-muted">PDF or Word (.docx), up to 25 MB each.</p>
        </form>
      )}

      {props.documents.length === 0 ? (
        <p className="border-t border-border px-4 py-3 text-sm text-muted">No documents yet.</p>
      ) : (
        <ul className="border-t border-border">
          {props.documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0"
              data-testid="document-row"
            >
              <div className="min-w-0 flex-1 basis-72">
                <div className="break-all font-semibold">{doc.fileName}</div>
                <div className="text-sm text-muted">
                  {KIND_LABELS[doc.kind]} ·{" "}
                  {doc.format === "PDF"
                    ? plural(doc.pageCount, "page")
                    : plural(doc.pageCount, "section")}{" "}
                  · uploaded by {doc.uploadedByName}
                </div>
                <div className="text-sm" data-testid="document-status">
                  <StatusLine doc={doc} />
                </div>
                {doc.addedAt && (
                  <div className="text-xs text-muted">
                    Items added by {doc.addedByName} on{" "}
                    {new Date(doc.addedAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {doc.status === "READY" && (
                  <Link
                    href={`/estimates/${props.requestId}/documents/${doc.id}`}
                    className={props.canEdit ? ui.primaryButton : ui.secondaryButton}
                  >
                    {props.canEdit ? "Review" : "View proposals"}
                  </Link>
                )}
                <a
                  href={`/estimates/${props.requestId}/documents/${doc.id}/file?download`}
                  className={ui.smallButton}
                >
                  Download
                </a>
                {props.canEdit && (doc.status === "FAILED" || doc.status === "READY") && (
                  <button
                    type="button"
                    className={ui.smallButton}
                    disabled={pending}
                    onClick={() => perform(() => readAgainAction(doc.id))}
                  >
                    Read again
                  </button>
                )}
                {props.canEdit &&
                  (confirming === doc.id ? (
                    <button
                      type="button"
                      className={`${ui.smallButton} text-err`}
                      disabled={pending}
                      onClick={() => perform(() => removeDocumentAction(doc.id))}
                    >
                      Confirm remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={ui.smallButton}
                      aria-label={`Remove ${doc.fileName}`}
                      onClick={() => setConfirming(doc.id)}
                    >
                      Remove
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
