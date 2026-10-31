// Home list filters (specs/home-screen), kept in the page address so they can be shared.
import { STATUSES, type RequestStatus } from "./options";

export const QUICK_FILTERS = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "in-review", label: "In review" },
  { value: "approved", label: "Approved" },
] as const;
export type QuickFilter = (typeof QUICK_FILTERS)[number]["value"];

export type RequestFilters = {
  view: QuickFilter;
  q: string;
  status: RequestStatus | null;
  owner: string | null;
  client: string | null;
  tech: string | null;
  page: number;
};

export const PAGE_SIZE = 25;

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() || null;

/** Reads filters from search params; unknown or malformed values fall back to the defaults. */
export function parseFilters(params: Params): RequestFilters {
  const view = first(params.view);
  const status = first(params.status);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  return {
    view: QUICK_FILTERS.some((f) => f.value === view) ? (view as QuickFilter) : "all",
    q: (first(params.q) ?? "").slice(0, 100),
    status: STATUSES.some((s) => s.value === status) ? (status as RequestStatus) : null,
    owner: first(params.owner),
    client: first(params.client),
    tech: first(params.tech),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/** The search params for `filters`, leaving out defaults so addresses stay short. */
export function filtersToSearch(filters: Partial<RequestFilters>): string {
  const params = new URLSearchParams();
  if (filters.view && filters.view !== "all") params.set("view", filters.view);
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.client) params.set("client", filters.client);
  if (filters.tech) params.set("tech", filters.tech);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function hasActiveFilters(filters: RequestFilters): boolean {
  return (
    filters.view !== "all" ||
    !!filters.q ||
    !!filters.status ||
    !!filters.owner ||
    !!filters.client ||
    !!filters.tech
  );
}
