"use client";

import { useRef, useState, useTransition } from "react";
import { ui } from "@/components/ui";
import type { ImportPreview } from "@/server/benchmarks/import";
import { applyImportAction, previewImportAction } from "../actions";

// Upload → preview → apply (specs/feature-benchmarks "Import from the seed list or the survey").
// Nothing is saved until Apply; the same file is sent again to apply it.
export function ImportForm() {
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const form = () => {
    const data = new FormData();
    if (file) data.set("file", file);
    return data;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className={ui.label}>
          Seed CSV or survey workbook
          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx"
            className={`${ui.input} py-1.5`}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setMessage(null);
            }}
          />
        </label>
        <button
          type="button"
          className={ui.secondaryButton}
          disabled={pending || !file}
          onClick={() =>
            startTransition(async () => {
              const result = await previewImportAction(form());
              if (result.ok) {
                setPreview(result.preview);
                setMessage(null);
              } else {
                setPreview(null);
                setMessage({ ok: false, text: result.message });
              }
            })
          }
        >
          Preview
        </button>
      </div>

      {preview && (
        <section
          aria-labelledby="preview-title"
          className="flex flex-col gap-3"
          data-testid="import-preview"
        >
          <h2 id="preview-title" className="text-lg font-bold">
            Preview of {preview.fileName}
          </h2>
          <p className="text-sm" data-testid="import-counts">
            {preview.counts.new} new · {preview.counts.changed} changed · {preview.counts.unchanged}{" "}
            unchanged · {preview.counts.problems} with problems · {preview.counts.withHours} with
            AI-era hours
          </p>
          {preview.problems.length > 0 && (
            <ul className="rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn">
              {preview.problems.map((p) => (
                <li key={p.row}>{p.message}</li>
              ))}
            </ul>
          )}
          <div className="max-h-96 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">ID</th>
                  <th className="px-3 py-2 text-left font-semibold">Feature</th>
                  <th className="px-3 py-2 text-left font-semibold">Change</th>
                  <th className="px-3 py-2 text-right font-semibold">AI-era hours</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.code} className="border-t border-border">
                    <td className="px-3 py-1 font-mono text-xs">{r.code}</td>
                    <td className="px-3 py-1">{r.feature}</td>
                    <td className="px-3 py-1">
                      {r.status === "new"
                        ? "New"
                        : r.status === "changed"
                          ? "Changed"
                          : "Unchanged"}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">{r.hours || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted">
            AI-era hours become observations. &ldquo;Confirmed by&rdquo; names are kept as notes:
            only a Tech Lead or Architect can confirm in the tool. Rows with problems are skipped.
          </p>
          <div>
            <button
              type="button"
              className={ui.primaryButton}
              disabled={pending || preview.rows.length === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await applyImportAction(form());
                  setMessage({ ok: result.ok, text: result.message ?? "That didn't work." });
                  if (result.ok) {
                    setPreview(null);
                    setFile(null);
                    if (input.current) input.current.value = "";
                  }
                })
              }
            >
              Apply import
            </button>
          </div>
        </section>
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
