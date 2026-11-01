// Name similarity for matching actuals to the estimate (specs/actual-hours; design decision 4).
// Deterministic: Sørensen–Dice on character bigrams, boosted when every word of the shorter
// name appears in the longer one ("User login" vs "User Login + OTP").

export const PROPOSE_AT = 0.6;

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): string[] {
  const compact = s.replace(/\s+/g, "");
  const out: string[] = [];
  for (let i = 0; i < compact.length - 1; i++) out.push(compact.slice(i, i + 2));
  return out;
}

export function similarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const ax = bigrams(x);
  const by = bigrams(y);
  let dice = 0;
  if (ax.length && by.length) {
    const counts = new Map<string, number>();
    for (const g of ax) counts.set(g, (counts.get(g) ?? 0) + 1);
    let shared = 0;
    for (const g of by) {
      const n = counts.get(g) ?? 0;
      if (n > 0) {
        shared++;
        counts.set(g, n - 1);
      }
    }
    dice = (2 * shared) / (ax.length + by.length);
  }

  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const longWords = new Set(long.split(" "));
  const contained = short.split(" ").every((w) => longWords.has(w));
  return Math.min(0.99, contained ? Math.max(dice, 0.75) : dice);
}
