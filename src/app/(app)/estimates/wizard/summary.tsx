"use client";

import { PART_LABELS } from "@/lib/estimation/options";
import type { TechnologyOption, WizardState } from "./types";

// "Request summary" beside the wizard (approved design); a disclosure on narrow screens.
export function RequestSummary(props: { state: WizardState; technologies: TechnologyOption[] }) {
  const content = <SummaryList {...props} />;
  return (
    <>
      <aside aria-label="Request summary" className="hidden lg:block">
        <div className="sticky top-20 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-lg font-bold">Request summary</h2>
          {content}
        </div>
      </aside>
      <details className="rounded-xl border border-border bg-surface p-4 lg:hidden">
        <summary className="cursor-pointer font-semibold">Summary</summary>
        {content}
      </details>
    </>
  );
}

function SummaryList({
  state,
  technologies,
}: {
  state: WizardState;
  technologies: TechnologyOption[];
}) {
  const techName = new Map(technologies.map((t) => [t.id, t.name]));
  const parts = state[2].parts.map(
    (p) =>
      `${PART_LABELS[p.part]}${
        p.technologyIds.length
          ? ` (${p.technologyIds.map((id) => techName.get(id) ?? "?").join(", ")})`
          : ""
      }`,
  );
  const rows: [string, string][] = [
    ["Client", state[1].clientName || "–"],
    ["Project", state[1].projectName || "–"],
    ["Parts", parts.join(" · ") || "–"],
    ["Hosting", [...state[3].hosting, ...state[3].environments].join(" · ") || "–"],
    ["Compliance", state[3].compliance.join(" · ") || "–"],
    ["Features", String(state[4].features.length)],
  ];
  return (
    <dl className="mt-3 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
