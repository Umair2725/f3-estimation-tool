// Recalculating a benchmark from its observations (specs/feature-benchmarks "Recalculation",
// "Large changes are proposed"). Pure, so the spec's examples are unit tests.

export type Level = "EXPERIENCED" | "JUNIOR" | "MIXED";

export type ObservationInput = {
  id: string;
  level: Level;
  hoursTenths: number;
  observedOn: Date;
  requestId: string | null;
};

/** Observations this recent weigh twice as much. */
export const RECENT_DAYS = 183;
/** A Confirmed benchmark moving more than this is proposed to an Architect. */
export const PROPOSAL_THRESHOLD = 0.15;

/** Weighted mean of one level's observations, rounded to 0.5 h (5 tenths); null when none. */
export function weightedHours(
  observations: ObservationInput[],
  level: "EXPERIENCED" | "JUNIOR",
  now: Date,
) {
  const relevant = observations.filter((o) => o.level === level);
  if (relevant.length === 0) return null;
  const cutoff = now.getTime() - RECENT_DAYS * 86_400_000;
  let sum = 0;
  let weights = 0;
  for (const o of relevant) {
    const w = o.observedOn.getTime() >= cutoff ? 2 : 1;
    sum += o.hoursTenths * w;
    weights += w;
  }
  return Math.round(sum / weights / 5) * 5;
}

/** Distinct projects; observations without a project count as one each. */
export function projectsCount(observations: ObservationInput[]): number {
  const projects = new Set<string>();
  let loose = 0;
  for (const o of observations) {
    if (o.level === "MIXED") continue;
    if (o.requestId) projects.add(o.requestId);
    else loose++;
  }
  return projects.size + loose;
}

export type Hours = { experienced: number | null; junior: number | null };

const changeOf = (from: number | null, to: number | null) =>
  from === null || to === null
    ? from === to
      ? 0
      : Infinity
    : from === 0
      ? to === 0
        ? 0
        : Infinity
      : Math.abs(to - from) / from;

/**
 * What to do with recalculated hours: nothing when unchanged, propose when a Confirmed benchmark
 * would move more than 15% on either level, otherwise apply.
 */
export function decide(current: Hours, next: Hours, status: "DRAFT" | "CONFIRMED" | "RETIRED") {
  if (current.experienced === next.experienced && current.junior === next.junior) return "none";
  if (status !== "CONFIRMED") return "apply";
  const big =
    changeOf(current.experienced, next.experienced) > PROPOSAL_THRESHOLD ||
    changeOf(current.junior, next.junior) > PROPOSAL_THRESHOLD;
  return big ? "propose" : "apply";
}

/** New hours from observations: a level without observations keeps its current hours. */
export function recalculated(current: Hours, observations: ObservationInput[], now: Date): Hours {
  return {
    experienced: weightedHours(observations, "EXPERIENCED", now) ?? current.experienced,
    junior: weightedHours(observations, "JUNIOR", now) ?? current.junior,
  };
}
