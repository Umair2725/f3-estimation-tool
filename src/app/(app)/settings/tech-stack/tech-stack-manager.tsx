"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { PART_LABELS, PARTS, type Part } from "@/lib/estimation/options";
import type { TechnologyRow } from "@/server/tech-stack";
import {
  addTechnologyAction,
  restoreTechnologyAction,
  retireTechnologyAction,
  updateTechnologyAction,
  type ActionResult,
} from "./actions";

type Perform = (action: () => Promise<ActionResult>, success: string) => Promise<boolean>;

export function TechStackManager({ technologies }: { technologies: TechnologyRow[] }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const perform: Perform = (action, success) =>
    new Promise((resolve) => {
      startTransition(async () => {
        const result = await action();
        setNotice(
          result.ok ? { kind: "ok", text: success } : { kind: "err", text: result.message },
        );
        resolve(result.ok);
      });
    });

  return (
    <div className="flex flex-col gap-6">
      <div aria-live="polite">
        {notice && (
          <p
            role={notice.kind === "err" ? "alert" : "status"}
            className={`rounded-lg px-3.5 py-3 text-sm ${
              notice.kind === "err" ? "bg-err-bg text-err" : "bg-ok-bg text-ok"
            }`}
          >
            {notice.text}
          </p>
        )}
      </div>

      <AddForm pending={pending} perform={perform} />

      <section aria-labelledby="catalog-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="catalog-title" className="text-lg font-bold">
            Technologies
          </h2>
          <span className="text-sm text-muted">
            {technologies.filter((t) => !t.retired).length} active
          </span>
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="whitespace-nowrap text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 font-semibold">Name</th>
                <th className="px-3 py-2.5 font-semibold">Parts</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-5 py-2.5 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {technologies.map((tech) => (
                <TechnologyRowView key={tech.id} tech={tech} pending={pending} perform={perform} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PartChecks(props: { legend: string; value: Part[]; onChange: (parts: Part[]) => void }) {
  return (
    <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
      <legend className="sr-only">{props.legend}</legend>
      {PARTS.map((p) => (
        <label key={p.value} className="inline-flex items-center gap-1.5 text-sm font-normal">
          <input
            type="checkbox"
            checked={props.value.includes(p.value)}
            onChange={(e) =>
              props.onChange(
                e.target.checked
                  ? [...props.value, p.value]
                  : props.value.filter((v) => v !== p.value),
              )
            }
          />
          {p.label}
        </label>
      ))}
    </fieldset>
  );
}

function AddForm({ pending, perform }: { pending: boolean; perform: Perform }) {
  const [name, setName] = useState("");
  const [parts, setParts] = useState<Part[]>([]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await perform(() => addTechnologyAction({ name, parts }), `${name.trim()} added.`);
    if (ok) {
      setName("");
      setParts([]);
    }
  }

  return (
    <section aria-labelledby="add-tech-title" className={ui.card}>
      <div className={ui.cardHead}>
        <h2 id="add-tech-title" className="text-lg font-bold">
          Add a technology
        </h2>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3 px-5 py-4">
        <label className={`${ui.label} max-w-sm`}>
          Name
          <input
            className={ui.input}
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Parts it applies to</span>
          <PartChecks legend="Parts for the new technology" value={parts} onChange={setParts} />
        </div>
        <div>
          <button type="submit" className={ui.primaryButton} disabled={pending}>
            Add technology
          </button>
        </div>
      </form>
    </section>
  );
}

function TechnologyRowView(props: { tech: TechnologyRow; pending: boolean; perform: Perform }) {
  const { tech, pending, perform } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tech.name);
  const [parts, setParts] = useState<Part[]>(tech.parts);

  async function save() {
    const ok = await perform(
      () => updateTechnologyAction(tech.id, { name, parts }),
      `${name.trim()} saved.`,
    );
    if (ok) setEditing(false);
  }

  return (
    <tr
      className="border-b border-border align-top last:border-b-0"
      data-testid="tech-row"
      data-name={tech.name}
    >
      <td className="px-5 py-3 font-semibold">
        {editing ? (
          <input
            className={ui.input}
            aria-label={`Name for ${tech.name}`}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        ) : (
          tech.name
        )}
      </td>
      <td className="px-3 py-3">
        {editing ? (
          <PartChecks legend={`Parts for ${tech.name}`} value={parts} onChange={setParts} />
        ) : (
          <span className="text-foreground-2">
            {tech.parts.map((p) => PART_LABELS[p]).join(", ")}
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        {tech.retired ? (
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">
            Retired
          </span>
        ) : (
          <span>Active</span>
        )}
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-right">
        <span className="inline-flex gap-2">
          {editing ? (
            <>
              <button type="button" className={ui.smallButton} disabled={pending} onClick={save}>
                Save
              </button>
              <button
                type="button"
                className={ui.smallButton}
                onClick={() => {
                  setEditing(false);
                  setName(tech.name);
                  setParts(tech.parts);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={ui.smallButton}
                aria-label={`Edit ${tech.name}`}
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              {tech.retired ? (
                <button
                  type="button"
                  className={ui.smallButton}
                  disabled={pending}
                  aria-label={`Restore ${tech.name}`}
                  onClick={() =>
                    perform(() => restoreTechnologyAction(tech.id), `${tech.name} restored.`)
                  }
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className={ui.smallButton}
                  disabled={pending}
                  aria-label={`Retire ${tech.name}`}
                  onClick={() =>
                    perform(() => retireTechnologyAction(tech.id), `${tech.name} retired.`)
                  }
                >
                  Retire
                </button>
              )}
            </>
          )}
        </span>
      </td>
    </tr>
  );
}
