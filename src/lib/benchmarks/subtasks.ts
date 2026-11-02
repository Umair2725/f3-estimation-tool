// The Sub tasks a benchmark suggests (specs/feature-matching, design §4). Pure.
import { BENCHMARK_PART_LABELS, type BenchmarkPart } from "./rows";

type Line = { title: string; minTenths: number; maxTenths: number };

/** Scales values to a total in whole tenths, putting any rounding difference on the first. */
function scale(values: number[], total: number): number[] {
  const sum = values.reduce((n, v) => n + v, 0);
  if (sum === 0) return values.map((_, i) => (i === 0 ? total : 0));
  const scaled = values.map((v) => Math.round((v * total) / sum));
  scaled[0] += total - scaled.reduce((n, v) => n + v, 0);
  return scaled;
}

/**
 * The breakdown scaled to the benchmark's current experienced (Min) and junior (Max) hours, or
 * one Sub task named after the feature. Null when the benchmark has no AI-era hours.
 */
export function benchmarkSubTasks(b: {
  feature: string;
  experiencedTenths: number | null;
  juniorTenths: number | null;
  breakdown: unknown;
}): Line[] | null {
  if (b.experiencedTenths === null) return null;
  const min = b.experiencedTenths;
  const max = Math.max(b.juniorTenths ?? min, min);
  const lines = Array.isArray(b.breakdown) ? (b.breakdown as Line[]).filter((l) => l?.title) : [];
  if (lines.length === 0) return [{ title: b.feature, minTenths: min, maxTenths: max }];
  const mins = scale(
    lines.map((l) => l.minTenths),
    min,
  );
  const maxes = scale(
    lines.map((l) => l.maxTenths),
    max,
  );
  return lines.map((l, i) => ({
    title: l.title,
    minTenths: mins[i],
    maxTenths: Math.max(maxes[i], mins[i]),
  }));
}

/** "Backend (Node.js)", "Any part" or "Web/Frontend". */
export function benchmarkPartLabel(part: BenchmarkPart, stack: string): string {
  const label = part === "ANY" ? "Any part" : BENCHMARK_PART_LABELS[part];
  return stack && stack.toLowerCase() !== "any" ? `${label} (${stack})` : label;
}
