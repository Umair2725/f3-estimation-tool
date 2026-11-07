import "server-only";
import { z } from "zod";
import type { CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { fieldErrors } from "@/lib/estimation/schemas";
import { assertAccess, ServiceError } from "./service-error";

// What new estimates start from (specs/estimate-defaults). One row, id "default", created by
// the migration with the brief's values. Anyone with a role can read it; Admins change it.

export type EstimateDefaults = {
  qaPercent: number;
  pmPercent: number;
  bugFixPercent: number;
  defaultRate: number;
  approvedRates: number[];
  /** Pre-fills the AI guess's minutes per round, and sizes automatic guesses. */
  minutesPerRound: number;
};

export const DEFAULT_RATE_MESSAGE = "The default rate must be one of the approved rates";

const percent = z
  .number({ error: "Enter a whole number from 0 to 100" })
  .int("Enter a whole number from 0 to 100")
  .min(0, "Enter a whole number from 0 to 100")
  .max(100, "Enter a whole number from 0 to 100");
const rate = z
  .number({ error: "Rates are whole dollars from 1 to 1000" })
  .int("Rates are whole dollars from 1 to 1000")
  .min(1, "Rates are whole dollars from 1 to 1000")
  .max(1000, "Rates are whole dollars from 1 to 1000");

export const MINUTES_PER_ROUND_MESSAGE = "Enter whole minutes from 1 to 480";
/** Minutes one AI guess round takes (specs/feature-matching "Minutes per round for an AI guess"). */
export const minutesPerRoundSchema = z
  .number({ error: MINUTES_PER_ROUND_MESSAGE })
  .int(MINUTES_PER_ROUND_MESSAGE)
  .min(1, MINUTES_PER_ROUND_MESSAGE)
  .max(480, MINUTES_PER_ROUND_MESSAGE);

export const defaultsSchema = z
  .object({
    qaPercent: percent,
    pmPercent: percent,
    bugFixPercent: percent,
    defaultRate: rate,
    approvedRates: z
      .array(rate)
      .transform((rates) => [...new Set(rates)].sort((a, b) => a - b))
      .refine((rates) => rates.length > 0, "Keep at least one approved rate"),
    minutesPerRound: minutesPerRoundSchema,
  })
  .refine((d) => d.approvedRates.includes(d.defaultRate), {
    message: DEFAULT_RATE_MESSAGE,
    path: ["defaultRate"],
  });
export type DefaultsInput = z.input<typeof defaultsSchema>;

const FALLBACK: EstimateDefaults = {
  qaPercent: 25,
  pmPercent: 30,
  bugFixPercent: 10,
  defaultRate: 30,
  approvedRates: [25, 30, 35, 40, 45, 50],
  minutesPerRound: 60,
};

/** Current defaults; the brief's values if the row is somehow missing. No access check. */
export async function readDefaults(
  db: Pick<ReturnType<typeof getDb>, "estimateDefaults"> = getDb(),
) {
  const row = await db.estimateDefaults.findUnique({ where: { id: "default" } });
  if (!row) return FALLBACK;
  const { qaPercent, pmPercent, bugFixPercent, defaultRate, approvedRates, minutesPerRound } = row;
  return { qaPercent, pmPercent, bugFixPercent, defaultRate, approvedRates, minutesPerRound };
}

export async function getDefaults(actor: CurrentUser | null): Promise<EstimateDefaults> {
  assertAccess(actor);
  return readDefaults();
}

export async function updateDefaults(actor: CurrentUser | null, input: unknown) {
  assertAccess(actor, "settings.manage");
  const parsed = defaultsSchema.safeParse(input);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    throw new ServiceError(Object.values(fields)[0] ?? "Check the form", 400, fields);
  }
  const data = { ...parsed.data, updatedById: actor.id };
  await getDb().estimateDefaults.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  return parsed.data;
}
