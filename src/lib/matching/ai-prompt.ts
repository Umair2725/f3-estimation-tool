// The AI-only guess prompt (specs/feature-matching "Privacy of AI calls", "How an AI guess is
// sized"). Pure, so a test can check it carries only this request's own details: no client name,
// no other request's data.
//
// Sizing follows the agent-estimation method (github.com/ZhangHanDong/agent-estimation, MIT):
// the model estimates rounds with fixed anchors and a risk coefficient, and the arithmetic stays
// here. Only the minutes per round differ: the estimator chooses them instead of a fixed 3.
import { z } from "zod";
import type { SuggestedSubTask } from "./suggest";

export type GuessInput = {
  applicationTypes: string[];
  partLabel: string;
  featureName: string;
  featureDescription: string;
  compliance: string[];
};

export const WORK_KINDS = ["BOILERPLATE", "MODERATE", "EXPLORATORY", "HIGH_UNCERTAINTY"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];
export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** agent-estimation's risk coefficients, in tenths so the arithmetic stays exact. */
export const RISK_FACTOR_TENTHS: Record<RiskLevel, number> = {
  LOW: 10,
  MEDIUM: 13,
  HIGH: 15,
  VERY_HIGH: 20,
};
/** Integration rounds: the middle of agent-estimation's 10–20% of the base total. */
export const INTEGRATION_PERCENT = 15;
export const MAX_BASE_ROUNDS = 15;

const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  VERY_HIGH: "Very high",
};

export const GUESS_SYSTEM = `You estimate software development effort for Folio3, a software services company whose developers use AI coding tools for most of their work.
Break the feature into 2 to 8 concrete development Sub tasks for the given part and stack. Count development only: no QA, project management or deployment, which are added separately. Keep titles short (under 80 characters).

Estimate each Sub task in rounds, never in hours or days. A round is one cycle of thinking, writing code, running it, checking the result and fixing it.
Give each Sub task a kind of work and a whole number of base rounds within its anchor:
- BOILERPLATE: a known pattern or boilerplate, 1 to 2 rounds
- MODERATE: moderate complexity, 3 to 5 rounds
- EXPLORATORY: exploratory or poorly documented, 5 to 10 rounds
- HIGH_UNCERTAINTY: high uncertainty, 8 to 15 rounds
Split anything larger than 15 rounds into more Sub tasks.

Give each Sub task a risk level:
- LOW: mature tools, clear documentation, a well-known pattern
- MEDIUM: minor unknowns, one or two extra debugging rounds likely
- HIGH: sparse documentation, platform quirks or integration unknowns
- VERY_HIGH: possible dead ends that may need a different approach
For any risk above LOW, give a one-line reason naming the specific cause. Never raise the risk just to be safe, and don't count lines of code as difficulty. Integration between Sub tasks is added separately; don't include it.

Finally list up to 3 biggest risks for the whole feature, one sentence each.`;

export function guessPrompt(input: GuessInput): string {
  const lines = [
    `Part and stack: ${input.partLabel}`,
    `Feature: ${input.featureName}`,
    input.featureDescription.trim() ? `Description: ${input.featureDescription.trim()}` : null,
    input.applicationTypes.length ? `Application: ${input.applicationTypes.join(", ")}` : null,
    input.compliance.length ? `Compliance: ${input.compliance.join(", ")}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

export const GuessSchema = z.object({
  subTasks: z
    .array(
      z
        .object({
          title: z.string().min(1).max(200),
          kind: z.enum(WORK_KINDS),
          baseRounds: z.number().int().min(1).max(MAX_BASE_ROUNDS),
          risk: z.enum(RISK_LEVELS),
          riskReason: z.string().max(300).optional(),
        })
        .refine((s) => s.risk === "LOW" || !!s.riskReason?.trim(), {
          message: "A risk above Low needs a reason",
          path: ["riskReason"],
        }),
    )
    .min(1)
    .max(12),
  biggestRisks: z.array(z.string().min(1).max(300)).max(3),
});
export type Guess = z.infer<typeof GuessSchema>;

/** A guessed Sub task keeps its rating, so it can later be compared with actual hours. */
export type GuessedSubTask = SuggestedSubTask & {
  kind?: WorkKind;
  baseRounds?: number;
  risk?: RiskLevel;
  riskReason?: string;
};

/** Rounds to one decimal, without a trailing ".0". */
const rounds = (tenths: number) => String(Math.round(tenths) / 10);

function roundsText(baseTenths: number, effectiveTenths: number) {
  return baseTenths === effectiveTenths
    ? `${rounds(baseTenths)} ${baseTenths === 10 ? "round" : "rounds"}`
    : `${rounds(baseTenths)}–${rounds(effectiveTenths)} rounds`;
}

/**
 * Turns the model's rounds into Sub tasks with hours (specs/feature-matching "How an AI guess is
 * sized", "Integration Sub task in an AI guess"). Hours in tenths are rounds × minutes ÷ 6:
 * Min uses base rounds, Max base rounds × the risk factor. Integer arithmetic until the final
 * rounding, so 3 rounds × 1.3 at 60 minutes is exactly 3.9 h.
 */
export function guessToSubTasks(
  guess: Guess,
  minutesPerRound: number,
  note: string,
): { subTasks: GuessedSubTask[]; risks: string[] } {
  let baseTotal = 0; // rounds
  let effectiveTotal = 0; // rounds × factor tenths
  const subTasks: GuessedSubTask[] = guess.subTasks.map((s) => {
    const factor = RISK_FACTOR_TENTHS[s.risk];
    const effective = s.baseRounds * factor;
    baseTotal += s.baseRounds;
    effectiveTotal += effective;
    const reason = s.risk === "LOW" ? "" : (s.riskReason ?? "").trim().slice(0, 300);
    const risk = `${RISK_LABELS[s.risk]} risk${reason ? `: ${reason}` : ""}`;
    return {
      title: s.title.trim().slice(0, 200),
      minTenths: Math.round((s.baseRounds * minutesPerRound) / 6),
      maxTenths: Math.round((effective * minutesPerRound) / 60),
      comment: `${note} · ${roundsText(s.baseRounds * 10, effective)} × ${minutesPerRound} min, ${risk}`,
      kind: s.kind,
      baseRounds: s.baseRounds,
      risk: s.risk,
      ...(reason ? { riskReason: reason } : {}),
    };
  });
  if (subTasks.length >= 2) {
    subTasks.push({
      title: "Integration and wiring",
      minTenths: Math.round((baseTotal * INTEGRATION_PERCENT * minutesPerRound) / 600),
      maxTenths: Math.round((effectiveTotal * INTEGRATION_PERCENT * minutesPerRound) / 6000),
      comment: `${note} · Integration, ${INTEGRATION_PERCENT}% of rounds`,
    });
  }
  const risks = guess.biggestRisks
    .map((r) => r.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 3);
  return { subTasks, risks };
}
