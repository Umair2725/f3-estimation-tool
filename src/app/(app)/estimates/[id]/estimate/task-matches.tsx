"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { formatHours } from "@/lib/estimation/totals";
import { benchmarkSource } from "@/lib/benchmarks/labels";
import { METHOD_LABELS, sourceName, type Match } from "@/lib/matching/suggest";
import type { MatchingView } from "@/server/matching/matching";
import {
  aiGuessAction,
  askArchitectAction,
  decideAction,
  findMatchesAction,
} from "./matching-actions";

// The Matches section of a Task card (specs/feature-matching). Only actions this person may take
// are shown; the server checks again.

const hours = (tenths: number | null) => (tenths === null ? "–" : formatHours(tenths / 10));
const range = (min: number | null, max: number | null) => `${hours(min)}–${hours(max)} h`;

const DECISIONS = { ACCEPTED: "Accepted", ADJUSTED: "Adjusted", REJECTED: "Rejected" } as const;

export function TaskMatches(props: {
  requestId: string;
  taskId: string;
  matching: MatchingView;
  /** Unsaved changes in the editor: a suggestion would replace them, so save first. */
  dirty: boolean;
}) {
  const { matching } = props;
  const entry = matching.byTask[props.taskId];
  const suggestion = entry?.suggestion ?? null;
  const ask = entry?.ask ?? null;
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [architectId, setArchitectId] = useState("");
  const [note, setNote] = useState("");
  // The last guess's minutes, else the Admin default (specs/estimate-defaults).
  const [minutes, setMinutes] = useState(
    String(suggestion?.minutesPerRound ?? matching.defaultMinutesPerRound),
  );

  const act = (work: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const result = await work();
      setMessage({ ok: result.ok, text: result.message ?? "That didn't work." });
      if (result.ok) {
        setAdjusting(false);
        setAsking(false);
        setReason("");
      }
    });

  const canEdit = matching.canEdit;
  if (!suggestion && !canEdit) return null;
  const blocked = props.dirty;
  const noMatch = suggestion?.method === "NO_MATCH";
  const waiting = ask?.status === "OPEN";

  return (
    <div className="border-t border-border px-4 py-3 text-sm" data-testid="task-matches">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-semibold">Matches</span>
          {suggestion && (
            <span className="text-foreground-2" data-testid="suggestion-line">
              {" · "}
              <span
                className={
                  suggestion.method === "AI_GUESS" || noMatch ? "font-semibold text-warn" : ""
                }
              >
                {METHOD_LABELS[suggestion.method]}
              </span>
              {suggestion.minTenths !== null &&
                ` · ${range(suggestion.minTenths, suggestion.maxTenths)}`}
              {suggestion.method !== "NO_MATCH" &&
                suggestion.method !== "AI_GUESS" &&
                suggestion.matches[0] && (
                  <>
                    {" "}
                    · <SourceLink match={sourceOf(suggestion)} long />
                  </>
                )}
              {suggestion.decision !== "PENDING" && (
                <span className="text-muted">
                  {" "}
                  · {DECISIONS[suggestion.decision]}
                  {suggestion.decidedByName && ` by ${suggestion.decidedByName}`}
                  {suggestion.reason && `: “${suggestion.reason}”`}
                </span>
              )}
            </span>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            className={ui.smallButton}
            disabled={pending}
            onClick={() => act(() => findMatchesAction(props.requestId, props.taskId))}
          >
            {suggestion ? "Find again" : "Find matches"}
          </button>
        )}
      </div>

      {suggestion && suggestion.matches.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-foreground-2">
            Similar past work ({suggestion.matches.length})
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs" data-testid="matches-table">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 text-left font-semibold">Similarity</th>
                  <th className="py-1 text-left font-semibold">Source</th>
                  <th className="py-1 text-left font-semibold">Task</th>
                  <th className="py-1 text-left font-semibold">Date</th>
                  <th className="py-1 text-right font-semibold">Min–Max</th>
                  <th className="py-1 text-right font-semibold">Actual</th>
                </tr>
              </thead>
              <tbody>
                {suggestion.matches.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="py-1 tabular-nums">{Math.round(m.similarity * 100)}%</td>
                    <td className="py-1">
                      <SourceLink match={m} />
                      {m.clientName && <span className="text-muted"> · {m.clientName}</span>}
                    </td>
                    <td className="py-1">{m.title}</td>
                    <td className="py-1">{m.sourceDate}</td>
                    <td className="py-1 text-right tabular-nums">
                      {range(m.minTenths, m.maxTenths)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {m.actualTenths === null ? "–" : `${hours(m.actualTenths)} h`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {suggestion?.method === "AI_GUESS" && suggestion.suggested && (
        <div className="mt-2 flex flex-col gap-2" data-testid="ai-guess">
          <ul className="flex flex-col gap-1 text-xs">
            {suggestion.suggested.map((s, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="font-semibold">{s.title}</span>
                <span className="tabular-nums">{range(s.minTenths, s.maxTenths)}</span>
                {/* The rating after the label: "4–6 rounds × 60 min, High risk: …". */}
                <span className="text-muted">{s.comment.split(" · ").slice(1).join(" · ")}</span>
              </li>
            ))}
          </ul>
          {suggestion.risks.length > 0 && (
            <div className="text-xs" data-testid="guess-risks">
              <p className="font-semibold">Biggest risks</p>
              <ul className="ml-4 list-disc text-foreground-2">
                {suggestion.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {canEdit && suggestion?.suggested && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {blocked && (
            <p className="w-full text-warn">Save your changes before using a suggestion.</p>
          )}
          {!adjusting && (
            <>
              <button
                type="button"
                className={ui.smallButton}
                disabled={pending || blocked}
                onClick={() => act(() => decideAction(props.requestId, props.taskId, "ACCEPTED"))}
              >
                Accept
              </button>
              <button
                type="button"
                className={ui.smallButton}
                disabled={pending || blocked}
                onClick={() => setAdjusting(true)}
              >
                Adjust
              </button>
              <button
                type="button"
                className={ui.smallButton}
                disabled={pending}
                onClick={() => act(() => decideAction(props.requestId, props.taskId, "REJECTED"))}
              >
                Reject
              </button>
            </>
          )}
          {adjusting && (
            <>
              <label className={ui.label}>
                Why are you adjusting it?
                <input
                  className={`${ui.input} min-h-9 w-72`}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={ui.smallButton}
                disabled={pending || blocked}
                onClick={() =>
                  act(() => decideAction(props.requestId, props.taskId, "ADJUSTED", reason))
                }
              >
                Use and adjust
              </button>
              <button type="button" className={ui.smallButton} onClick={() => setAdjusting(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {(noMatch || suggestion?.method === "AI_GUESS") && (
        <div className="mt-2 flex flex-col gap-2">
          {waiting && (
            <p className="text-info" data-testid="waiting-reference">
              Waiting for {ask!.architectName}&apos;s reference
            </p>
          )}
          {ask?.status === "DECLINED" && (
            <p className="text-muted">
              {ask.architectName} declined: “{ask.declineReason}”
            </p>
          )}
          {canEdit && !waiting && !asking && (
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                className={ui.smallButton}
                disabled={pending}
                onClick={() => setAsking(true)}
              >
                Ask an Architect
              </button>
              {matching.aiGuesses ? (
                <>
                  {/* Hours are rounds × these minutes (specs/feature-matching). */}
                  <label className={ui.label}>
                    Minutes per round
                    <input
                      type="number"
                      min={1}
                      max={480}
                      step={1}
                      inputMode="numeric"
                      className={`${ui.input} min-h-9 w-28`}
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className={ui.smallButton}
                    disabled={pending}
                    onClick={() =>
                      act(() => aiGuessAction(props.requestId, props.taskId, Number(minutes)))
                    }
                  >
                    {suggestion?.method === "AI_GUESS" ? "Guess again" : "AI guess"}
                  </button>
                </>
              ) : (
                <span className="self-center text-muted">AI guesses aren&apos;t set up</span>
              )}
            </div>
          )}
          {asking && (
            <div className="flex flex-wrap items-end gap-2">
              {matching.architects.length === 0 ? (
                <p className="text-warn">There is no Architect yet. Ask an Admin to assign one.</p>
              ) : (
                <>
                  <label className={ui.label}>
                    Architect
                    <select
                      className={`${ui.input} min-h-9 w-56`}
                      value={architectId}
                      onChange={(e) => setArchitectId(e.target.value)}
                    >
                      <option value="">Choose an Architect</option>
                      {matching.architects.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={ui.label}>
                    Note (optional)
                    <input
                      className={`${ui.input} min-h-9 w-64`}
                      maxLength={1000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className={ui.smallButton}
                    disabled={pending || !architectId}
                    onClick={() =>
                      act(() =>
                        askArchitectAction(props.requestId, props.taskId, architectId, note),
                      )
                    }
                  >
                    Send request
                  </button>
                </>
              )}
              <button type="button" className={ui.smallButton} onClick={() => setAsking(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mt-2 ${message.ok ? "text-ok" : "text-err"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/**
 * A match's source with a link: the benchmark page, or the source request. `long` gives the full
 * benchmark citation ("Benchmark FB-012, confirmed by …, based on 4 projects, updated 2026-09").
 */
function SourceLink({ match, long }: { match: Match; long?: boolean }) {
  if (match.benchmark) {
    const label = long
      ? benchmarkSource(match.benchmark)
      : `Benchmark ${match.benchmark.code} · ${match.benchmark.status === "CONFIRMED" ? "confirmed" : "draft"}`;
    return (
      <Link className="underline" href={`/benchmarks/${match.benchmark.id}`}>
        {label}
      </Link>
    );
  }
  if (match.requestId) {
    return (
      <Link className="underline" href={`/estimates/${match.requestId}`}>
        {sourceName(match)}
      </Link>
    );
  }
  return <>{sourceName(match)}</>;
}

/** The match a suggestion was taken from: the first one of the kind its method uses. */
function sourceOf(s: { method: string; matches: Match[] }): Match {
  const kind =
    s.method === "BENCHMARK_CONFIRMED" || s.method === "BENCHMARK_DRAFT"
      ? s.method
      : s.method === "PRE_AI_MATCH"
        ? "APPROVED_PRE_AI"
        : "APPROVED_AI_ERA";
  return (
    s.matches.find(
      (m) => m.kind === kind && (s.method !== "AI_ERA_ACTUALS" || m.actualTenths !== null),
    ) ?? s.matches[0]
  );
}
