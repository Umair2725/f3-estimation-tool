"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ui } from "@/components/ui";
import type { Cite } from "@/lib/documents/proposal";
import {
  mergeFeatures,
  splitFeature,
  type Review,
  type ReviewFeature,
  type Selection,
} from "@/lib/documents/review";
import { PART_LABELS, PARTS, type Part } from "@/lib/estimation/options";
import { applyDocumentAction, type ActionResult } from "../actions";

// The review of one document (specs/requirement-documents "Review before adding", "Add to
// request"). Everything is local state until "Add to request".

type Doc = { requestId: string; id: string; fileName: string; format: "PDF" | "DOCX" };

function CiteLine(props: { doc: Doc; cites: Cite[]; needsConfirmation: boolean }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      {props.cites.map((c, i) => {
        const where = c.page ? `page ${c.page}` : c.section ? `"${c.section}"` : "";
        const href =
          props.doc.format === "PDF" && c.page
            ? `/estimates/${props.doc.requestId}/documents/${props.doc.id}/file#page=${c.page}`
            : null;
        return (
          <div
            key={i}
            className="flex flex-wrap items-baseline gap-x-2 text-muted"
            data-testid="cite"
          >
            <span>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer" className="underline">
                  {props.doc.fileName}, {where}
                </a>
              ) : (
                <>
                  {props.doc.fileName}
                  {where && `, ${where}`}
                </>
              )}
            </span>
            <q className="italic text-foreground-2">{c.quote}</q>
            <span className={c.checked ? "font-semibold text-ok" : "font-semibold text-warn"}>
              {c.checked ? "Quote checked" : "Check the page"}
            </span>
          </div>
        );
      })}
      {props.needsConfirmation && (
        <span className="w-fit rounded-full bg-warn-bg px-2 py-0.5 font-semibold text-warn">
          Needs confirmation
        </span>
      )}
    </div>
  );
}

function Section(props: { title: string; count: number; children: React.ReactNode }) {
  const id = `section-${props.title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={ui.card}>
      <div className={ui.cardHead}>
        <h2 id={id} className="text-lg font-bold">
          {props.title}
        </h2>
        <span className="text-sm text-muted">{props.count}</span>
      </div>
      {props.children}
    </section>
  );
}

function Tick(props: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className="mt-1.5 size-4 shrink-0"
      checked={props.checked}
      disabled={props.disabled}
      aria-label={props.label}
      onChange={(e) => props.onChange(e.target.checked)}
    />
  );
}

type EditorProps = { doc: Doc; review: Review; canEdit: boolean };

/**
 * Keeps the "Add to request" result while the editor below is rebuilt from the server's fresh
 * review (it is keyed by when items were last added).
 */
export function ReviewShell(props: EditorProps & { version: string }) {
  const [notice, setNotice] = useState<ActionResult | null>(null);
  return (
    <ReviewEditor
      key={props.version}
      doc={props.doc}
      review={props.review}
      canEdit={props.canEdit}
      notice={notice}
      onNotice={setNotice}
    />
  );
}

function ReviewEditor(
  props: EditorProps & { notice: ActionResult | null; onNotice: (n: ActionResult) => void },
) {
  const notice = props.notice;
  const router = useRouter();
  const ro = !props.canEdit;
  const [features, setFeatures] = useState<ReviewFeature[]>(props.review.features);
  const [text, setText] = useState(props.review.text);
  const [lists, setLists] = useState(props.review.lists);
  const [parts, setParts] = useState(props.review.parts);
  const [nfr, setNfr] = useState(props.review.nfr);
  const [assumptions, setAssumptions] = useState(props.review.assumptions);
  const [risks, setRisks] = useState(props.review.risks);
  const [questions, setQuestions] = useState(props.review.questions);
  const [mergeName, setMergeName] = useState("");
  const [pending, start] = useTransition();

  const patch =
    <T extends { id: string }>(set: React.Dispatch<React.SetStateAction<T[]>>) =>
    (id: string, p: Partial<T>) =>
      set((rows) => rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const patchFeature = patch(setFeatures);

  const ticked = features.filter((f) => f.selected);
  const total = useMemo(
    () =>
      ticked.length +
      [text, lists, parts, nfr, assumptions, risks, questions].reduce(
        (n, rows) => n + (rows as { selected: boolean }[]).filter((r) => r.selected).length,
        0,
      ),
    [ticked.length, text, lists, parts, nfr, assumptions, risks, questions],
  );

  function merge() {
    if (ticked.length < 2) return;
    const merged = mergeFeatures(ticked, mergeName);
    const first = features.findIndex((f) => f.selected);
    setFeatures((rows) => {
      const rest = rows.filter((f) => !f.selected);
      rest.splice(Math.min(first, rest.length), 0, merged);
      return rest;
    });
    setMergeName("");
  }

  function split(id: string) {
    setFeatures((rows) => rows.flatMap((f) => (f.id === id ? splitFeature(f) : [f])));
  }

  function add() {
    const pick = <T extends { selected: boolean }>(rows: T[]) => rows.filter((r) => r.selected);
    const selection: Selection = {
      itemIds: [
        ...pick(features).flatMap((f) => f.itemIds),
        ...[text, lists, parts, nfr, assumptions, risks, questions].flatMap((rows) =>
          (rows as { id: string; selected: boolean }[]).filter((r) => r.selected).map((r) => r.id),
        ),
      ],
      features: pick(features).map((f) => ({
        itemIds: f.itemIds,
        name: f.name,
        description: f.description,
        parts: f.parts,
      })),
      projectName: pick(text).find((t) => t.field === "projectName")?.value,
      client: pick(text).find((t) => t.field === "client")?.value,
      lists: Object.fromEntries(pick(lists).map((l) => [l.field, l.values])),
      parts: pick(parts).map((p) => ({
        part: p.part,
        technologyIds: p.technologies.map((t) => t.id),
        note: p.note,
      })),
      nfr: pick(nfr).map((n) => ({ area: n.area, note: n.note })),
      assumptions: pick(assumptions).map((a) => ({ part: a.part, text: a.text })),
      risks: pick(risks).map((r) => ({ part: r.part, text: r.text })),
      questions: pick(questions).map((q) => ({
        text: q.text,
        source: { page: q.cite.page, section: q.cite.section, quote: q.cite.quote },
      })),
    };
    start(async () => {
      const result = await applyDocumentAction(props.doc.requestId, props.doc.id, selection);
      props.onNotice(result);
      // The estimator goes where the hours are: the Estimate tab, with the new Tasks matched.
      if (result.ok && result.href) router.push(result.href);
      else if (result.ok) router.refresh();
    });
  }

  const empty = (n: number) =>
    n === 0 ? <p className="px-5 py-4 text-sm text-muted">Nothing proposed.</p> : null;

  return (
    <div className="flex flex-col gap-6" data-testid="review-editor">
      <Section title="Features" count={features.length}>
        {!ro && features.length > 1 && (
          <div className="flex flex-wrap items-end gap-2 border-b border-border px-5 py-3">
            <label className={`${ui.label} min-w-0 flex-1 basis-60`}>
              Merge the ticked features into
              <input
                className={ui.input}
                value={mergeName}
                placeholder="Name of the merged feature"
                onChange={(e) => setMergeName(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={ui.secondaryButton}
              disabled={ticked.length < 2}
              onClick={merge}
            >
              Merge {ticked.length > 1 ? ticked.length : ""} ticked
            </button>
          </div>
        )}
        {empty(features.length)}
        <ol className="flex flex-col">
          {features.map((f) => (
            <li
              key={f.id}
              className="flex gap-3 border-b border-border px-5 py-4 last:border-b-0"
              data-testid="proposed-feature"
            >
              <Tick
                checked={f.selected}
                disabled={ro || f.added}
                label={`Add ${f.name}`}
                onChange={(v) => patchFeature(f.id, { selected: v })}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {ro ? (
                    <span className="font-semibold">{f.name}</span>
                  ) : (
                    <input
                      className={`${ui.input} min-w-0 flex-1 basis-60 font-semibold`}
                      value={f.name}
                      aria-label="Feature name"
                      onChange={(e) => patchFeature(f.id, { name: e.target.value })}
                    />
                  )}
                  {f.duplicate && (
                    <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">
                      Already in the request
                    </span>
                  )}
                  {f.added && (
                    <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok">
                      Added
                    </span>
                  )}
                  {f.removed && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-foreground-2">
                      Removed from the request
                    </span>
                  )}
                </div>
                {ro ? (
                  <p className="text-sm text-foreground-2">{f.description}</p>
                ) : (
                  <textarea
                    className={`${ui.input} min-h-16 text-sm`}
                    value={f.description}
                    aria-label={`Description of ${f.name}`}
                    onChange={(e) => patchFeature(f.id, { description: e.target.value })}
                  />
                )}
                <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <legend className="sr-only">Parts for {f.name}</legend>
                  {PARTS.map((p) => (
                    <label key={p.value} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        disabled={ro}
                        checked={f.parts.includes(p.value)}
                        onChange={(e) =>
                          patchFeature(f.id, {
                            parts: e.target.checked
                              ? [...f.parts, p.value]
                              : f.parts.filter((x) => x !== p.value),
                          })
                        }
                      />
                      {p.label}
                    </label>
                  ))}
                </fieldset>
                <CiteLine doc={props.doc} cites={f.cites} needsConfirmation={f.needsConfirmation} />
              </div>
              {!ro && (
                <div className="flex shrink-0 flex-col gap-2">
                  <button type="button" className={ui.smallButton} onClick={() => split(f.id)}>
                    Split
                  </button>
                  <button
                    type="button"
                    className={ui.smallButton}
                    aria-label={`Delete ${f.name}`}
                    onClick={() => setFeatures((rows) => rows.filter((r) => r.id !== f.id))}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="Request details"
        count={text.length + lists.length + parts.length + nfr.length}
      >
        {empty(text.length + lists.length + parts.length + nfr.length)}
        <ul className="flex flex-col">
          {text.map((t) => (
            <li
              key={t.id}
              className="flex gap-3 border-b border-border px-5 py-3"
              data-testid="detail-row"
            >
              <Tick
                checked={t.selected}
                disabled={ro || t.added}
                label={`Use ${t.label}`}
                onChange={(v) => patch(setText)(t.id, { selected: v })}
              />
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{t.label}</span>
                <span className="text-sm">
                  {t.current && <span className="text-muted">{t.current} (current) → </span>}
                  {t.value} (document)
                </span>
                <CiteLine
                  doc={props.doc}
                  cites={[t.cite]}
                  needsConfirmation={t.needsConfirmation}
                />
              </div>
            </li>
          ))}
          {lists.map((l) => (
            <li
              key={l.id}
              className="flex gap-3 border-b border-border px-5 py-3"
              data-testid="detail-row"
            >
              <Tick
                checked={l.selected}
                disabled={ro || l.added}
                label={`Add ${l.label}`}
                onChange={(v) => patch(setLists)(l.id, { selected: v })}
              />
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{l.label}</span>
                <span className="text-sm">
                  {l.current.length > 0 && (
                    <span className="text-muted">{l.current.join(", ")} (current) + </span>
                  )}
                  {l.values.join(", ")} (document)
                </span>
                <CiteLine
                  doc={props.doc}
                  cites={[l.cite]}
                  needsConfirmation={l.needsConfirmation}
                />
              </div>
            </li>
          ))}
          {parts.map((p) => (
            <li
              key={p.id}
              className="flex gap-3 border-b border-border px-5 py-3"
              data-testid="detail-row"
            >
              <Tick
                checked={p.selected}
                disabled={ro || p.added}
                label={`Add ${p.label} technologies`}
                onChange={(v) => patch(setParts)(p.id, { selected: v })}
              />
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{p.label}</span>
                <span className="text-sm">
                  {p.currentTechnologies.length > 0 && (
                    <span className="text-muted">
                      {p.currentTechnologies.join(", ")} (current) +{" "}
                    </span>
                  )}
                  {p.technologies.map((t) => t.name).join(", ") || "No catalog technology"}
                </span>
                {p.note && <span className="text-sm text-warn">{p.note}</span>}
                <CiteLine
                  doc={props.doc}
                  cites={[p.cite]}
                  needsConfirmation={p.needsConfirmation}
                />
              </div>
            </li>
          ))}
          {nfr.map((n) => (
            <li
              key={n.id}
              className="flex gap-3 border-b border-border px-5 py-3"
              data-testid="detail-row"
            >
              <Tick
                checked={n.selected}
                disabled={ro || n.added}
                label={`Add ${n.label}`}
                onChange={(v) => patch(setNfr)(n.id, { selected: v })}
              />
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{n.label}</span>
                <span className="text-sm">
                  {n.current && <span className="text-muted">{n.current} (current) + </span>}
                  {n.note || "Needed"}
                </span>
                <CiteLine
                  doc={props.doc}
                  cites={[n.cite]}
                  needsConfirmation={n.needsConfirmation}
                />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {(
        [
          ["Assumptions", assumptions, setAssumptions],
          ["Risks", risks, setRisks],
        ] as const
      ).map(([title, rows, set]) => (
        <Section key={title} title={title} count={rows.length}>
          {empty(rows.length)}
          <ul className="flex flex-col">
            {rows.map((r) => (
              <li key={r.id} className="flex gap-3 border-b border-border px-5 py-3">
                <Tick
                  checked={r.selected}
                  disabled={ro || r.added}
                  label={`Add ${title.toLowerCase().slice(0, -1)} ${r.text}`}
                  onChange={(v) =>
                    patch(set as React.Dispatch<React.SetStateAction<(typeof rows)[number][]>>)(
                      r.id,
                      { selected: v },
                    )
                  }
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <select
                      className={`${ui.input} min-h-8 w-48 py-0`}
                      disabled={ro}
                      value={r.part}
                      aria-label="Part"
                      onChange={(e) =>
                        patch(set as React.Dispatch<React.SetStateAction<(typeof rows)[number][]>>)(
                          r.id,
                          {
                            part: e.target.value as Part,
                          },
                        )
                      }
                    >
                      {PARTS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {PART_LABELS[p.value]}
                        </option>
                      ))}
                    </select>
                    {r.added && <span className="font-semibold text-ok">Added</span>}
                  </div>
                  {ro ? (
                    <p className="text-sm">{r.text}</p>
                  ) : (
                    <textarea
                      className={`${ui.input} min-h-12 text-sm`}
                      value={r.text}
                      aria-label={title.slice(0, -1)}
                      onChange={(e) =>
                        patch(set as React.Dispatch<React.SetStateAction<(typeof rows)[number][]>>)(
                          r.id,
                          {
                            text: e.target.value,
                          },
                        )
                      }
                    />
                  )}
                  <CiteLine
                    doc={props.doc}
                    cites={[r.cite]}
                    needsConfirmation={r.needsConfirmation}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ))}

      <Section title="Questions for the client" count={questions.length}>
        {empty(questions.length)}
        <ul className="flex flex-col">
          {questions.map((q) => (
            <li
              key={q.id}
              className="flex gap-3 border-b border-border px-5 py-3"
              data-testid="proposed-question"
            >
              <Tick
                checked={q.selected}
                disabled={ro || q.added}
                label={`Add question ${q.text}`}
                onChange={(v) => patch(setQuestions)(q.id, { selected: v })}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {ro ? (
                  <p className="text-sm">{q.text}</p>
                ) : (
                  <textarea
                    className={`${ui.input} min-h-12 text-sm`}
                    value={q.text}
                    aria-label="Question"
                    onChange={(e) => patch(setQuestions)(q.id, { text: e.target.value })}
                  />
                )}
                {q.added && <span className="text-sm font-semibold text-ok">Added</span>}
                <CiteLine
                  doc={props.doc}
                  cites={[q.cite]}
                  needsConfirmation={q.needsConfirmation}
                />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <div
        className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 py-3"
        aria-live="polite"
      >
        {!ro && (
          <button
            type="button"
            className={ui.primaryButton}
            disabled={pending || total === 0}
            onClick={add}
          >
            {pending ? "Adding…" : `Add to request (${total})`}
          </button>
        )}
        <Link href={`/estimates/${props.doc.requestId}/edit?step=4`} className={ui.secondaryButton}>
          Back to Requirements
        </Link>
        {notice?.message && (
          <p
            role={notice.ok ? "status" : "alert"}
            className={notice.ok ? "text-sm text-ok" : "text-sm text-err"}
          >
            {notice.message}
          </p>
        )}
        {ro && (
          <p className="text-sm text-muted">Only people who may edit the request can add items.</p>
        )}
      </div>
    </div>
  );
}
