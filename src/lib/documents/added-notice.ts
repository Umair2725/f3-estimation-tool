// The "Added 15 features, 7 details …" notice after "Add to request" (specs/requirement-documents
// "After adding"). The review sends the counts to the Estimate tab in its URL. Pure.

export type AddedCounts = {
  features: number;
  details: number;
  assumptions: number;
  risks: number;
  questions: number;
};

const ORDER = ["features", "details", "assumptions", "risks", "questions"] as const;
const SINGULAR = {
  features: "feature",
  details: "detail",
  assumptions: "assumption",
  risks: "risk",
  questions: "question",
} as const;

export function addedMessage(counts: AddedCounts): string {
  const parts = ORDER.map((k) => `${counts[k]} ${counts[k] === 1 ? SINGULAR[k] : k}`);
  return `Added ${parts.join(", ")} to the request.`;
}

/** The Estimate tab's address after adding, carrying the counts for the notice. */
export function estimateHrefAfterAdding(requestId: string, counts: AddedCounts): string {
  const added = ORDER.map((k) => counts[k]).join(".");
  return `/estimates/${requestId}/estimate?notice=document-added&added=${added}`;
}

/** Reads the counts back; anything malformed shows no notice. */
export function readAddedCounts(notice: unknown, added: unknown): AddedCounts | null {
  if (notice !== "document-added" || typeof added !== "string") return null;
  const values = added.split(".");
  if (values.length !== ORDER.length || !values.every((v) => /^\d{1,4}$/.test(v))) return null;
  return Object.fromEntries(ORDER.map((k, i) => [k, Number(values[i])])) as AddedCounts;
}
