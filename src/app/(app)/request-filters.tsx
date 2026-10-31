"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import {
  filtersToSearch,
  hasActiveFilters,
  QUICK_FILTERS,
  type RequestFilters as Filters,
} from "@/lib/estimation/filters";
import { STATUSES } from "@/lib/estimation/options";

type Option = { id: string; name: string };

// Filters for the home list (specs/home-screen). Every change updates the page address, so a
// filtered list can be shared; the server reads the filters from it.
export function RequestFilters(props: {
  filters: Filters;
  options: { clients: Option[]; owners: Option[]; technologies: Option[] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(props.filters.q);
  const { filters } = props;

  function apply(patch: Partial<Filters>) {
    const next = { ...filters, q, ...patch, page: 1 };
    startTransition(() => router.replace(`/${filtersToSearch(next)}#requests`, { scroll: false }));
  }

  const select = (
    label: string,
    key: "status" | "owner" | "client" | "tech",
    options: Option[],
  ) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted">
      {label}
      <select
        className={`${ui.input} min-h-9 text-sm text-foreground`}
        value={filters[key] ?? ""}
        onChange={(e) => apply({ [key]: e.target.value || null })}
      >
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-3 px-5 py-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Quick filters"
          className="inline-flex rounded-full border border-border-strong bg-surface-2 p-0.5"
        >
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filters.view === f.value}
              onClick={() => apply({ view: f.value })}
              className="rounded-full px-3 py-1 text-sm font-semibold text-foreground-2 aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-sm"
            >
              {f.label}
            </button>
          ))}
        </div>
        <form
          role="search"
          className="flex min-w-0 flex-1 basis-56 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: q.trim() });
          }}
        >
          <label className="sr-only" htmlFor="request-search">
            Search by project or client
          </label>
          <input
            id="request-search"
            type="search"
            placeholder="Search by project or client"
            className={`${ui.input} min-h-9`}
            value={q}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className={`${ui.smallButton} min-h-9`}>
            Search
          </button>
        </form>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {select(
          "Status",
          "status",
          STATUSES.map((s) => ({ id: s.value, name: s.label })),
        )}
        {select("Owner", "owner", props.options.owners)}
        {select("Client", "client", props.options.clients)}
        {select("Technology", "tech", props.options.technologies)}
      </div>
      {hasActiveFilters(filters) && (
        <div>
          <button
            type="button"
            className="text-sm font-semibold text-brand-strong hover:underline"
            onClick={() => {
              setQ("");
              startTransition(() => router.replace("/#requests", { scroll: false }));
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
