// The "Added 15 features, 7 details …" notice after "Add to request" (specs/requirement-documents
// "After adding", "Hours filled in"). The review sends the counts to the Estimate tab in its URL.
// Pure.

export type AddedCounts = {
  features: number;
  details: number;
  assumptions: number;
  risks: number;
  questions: number;
  /** Tasks of the new features: hours from a match, from an AI guess, or still none. */
  hours: { matched: number; guessed: number; empty: number };
};

const ORDER = ["features", "details", "assumptions", "risks", "questions"] as const;
const HOURS = ["matched", "guessed", "empty"] as const;
const SINGULAR = {
  features: "feature",
  details: "detail",
  assumptions: "assumption",
  risks: "risk",
  questions: "question",
} as const;

const tasks = (n: number) => `${n} ${n === 1 ? "Task" : "Tasks"}`;

export function addedMessage(counts: AddedCounts): string {
  const parts = ORDER.map((k) => `${counts[k]} ${counts[k] === 1 ? SINGULAR[k] : k}`);
  const added = `Added ${parts.join(", ")} to the request.`;
  const { matched, guessed, empty } = counts.hours;
  const hours = [
    matched && `${tasks(matched)} from past estimates`,
    guessed && `${tasks(guessed)} from an AI estimate (check them)`,
    empty && `${tasks(empty)} still without hours`,
  ].filter(Boolean);
  return hours.length ? `${added} Hours: ${hours.join(", ")}.` : added;
}

/** The Estimate tab's address after adding, carrying the counts for the notice. */
export function estimateHrefAfterAdding(requestId: string, counts: AddedCounts): string {
  const added = [...ORDER.map((k) => counts[k]), ...HOURS.map((k) => counts.hours[k])].join(".");
  return `/estimates/${requestId}/estimate?notice=document-added&added=${added}`;
}

/** Reads the counts back; anything malformed shows no notice. */
export function readAddedCounts(notice: unknown, added: unknown): AddedCounts | null {
  if (notice !== "document-added" || typeof added !== "string") return null;
  const values = added.split(".");
  const size = ORDER.length + HOURS.length;
  if (values.length !== size || !values.every((v) => /^\d{1,4}$/.test(v))) return null;
  const n = values.map(Number);
  return {
    ...(Object.fromEntries(ORDER.map((k, i) => [k, n[i]])) as Omit<AddedCounts, "hours">),
    hours: Object.fromEntries(
      HOURS.map((k, i) => [k, n[ORDER.length + i]]),
    ) as AddedCounts["hours"],
  };
}
