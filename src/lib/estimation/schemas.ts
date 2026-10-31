// Validation for the four wizard steps (specs/estimation-requests). Used by the forms for
// immediate feedback and by the server, which is authoritative.
import { z } from "zod";
import {
  APP_STORES,
  APPLICATION_TYPES,
  BROWSERS,
  COMPLIANCE,
  ENVIRONMENTS,
  HOSTING,
  OPERATING_SYSTEMS,
  PART_VALUES,
} from "./options";

const text = (max: number) => z.string().trim().max(max, `Use at most ${max} characters`);
const uniqueList = <T extends z.ZodType>(item: T) =>
  z.array(item).transform((items) => [...new Set(items)]);

export const partSchema = z.enum(PART_VALUES);

export const step1Schema = z.object({
  projectName: text(200).min(1, "Enter a project name"),
  clientName: text(200).default(""),
  projectManager: text(120).default(""),
  projectDate: z.iso.date("Enter a valid date"),
});
export type Step1Input = z.input<typeof step1Schema>;

export const step2Schema = z
  .object({
    applicationTypes: uniqueList(z.enum(APPLICATION_TYPES)),
    operatingSystems: uniqueList(z.enum(OPERATING_SYSTEMS)),
    browsers: uniqueList(z.enum(BROWSERS)),
    parts: z
      .array(z.object({ part: partSchema, technologyIds: uniqueList(z.string().min(1)) }))
      .max(PART_VALUES.length),
  })
  .refine((v) => new Set(v.parts.map((p) => p.part)).size === v.parts.length, {
    message: "Each part can be chosen once",
    path: ["parts"],
  });
export type Step2Input = z.input<typeof step2Schema>;

const nfrSchema = z.object({ enabled: z.boolean(), note: text(500).default("") });

export const considerationsSchema = z.object({
  v: z.literal(1).default(1),
  hosting: uniqueList(z.enum(HOSTING)).default([]),
  environments: uniqueList(z.enum(ENVIRONMENTS)).default([]),
  appStores: uniqueList(z.enum(APP_STORES)).default([]),
  compliance: uniqueList(z.enum(COMPLIANCE)).default([]),
  nfr: z
    .object({
      accessibility: nfrSchema.optional(),
      performance: nfrSchema.optional(),
      security: nfrSchema.optional(),
      documentation: nfrSchema.optional(),
    })
    .default({}),
  other: text(2000).default(""),
});
export type Considerations = z.output<typeof considerationsSchema>;
export type Step3Input = z.input<typeof considerationsSchema>;
export const step3Schema = considerationsSchema;

/** Reads stored considerations; anything unreadable becomes the empty default. */
export function readConsiderations(value: unknown): Considerations {
  const parsed = considerationsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : considerationsSchema.parse({});
}

export const featureSchema = z.object({
  // The existing feature id, so saving keeps its estimate Tasks; new rows send a client-only key.
  key: z.string().max(100).optional(),
  name: text(200).min(1, "Enter a feature name"),
  description: text(1000).default(""),
  parts: uniqueList(partSchema).refine((p) => p.length > 0, "Choose at least one part"),
});

export const step4Schema = z.object({
  features: z.array(featureSchema).max(300, "Use at most 300 features"),
});
export type Step4Input = z.input<typeof step4Schema>;

/** First error message per field path ("features.2.parts"), for showing next to inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    out[key] ??= issue.message;
  }
  return out;
}

// ---------- Estimate hours (specs/estimate-hours) ----------

export const HOURS_MESSAGE = "Enter hours from 0 to 9999, with at most one decimal";

/** Hours: 0–9999 with at most one decimal place. */
export const hoursSchema = z
  .number({ error: HOURS_MESSAGE })
  .min(0, HOURS_MESSAGE)
  .max(9999, HOURS_MESSAGE)
  .refine((h) => Math.abs(Math.round(h * 10) - h * 10) < 1e-9, HOURS_MESSAGE);

const wholePercent = z
  .number({ error: "Enter a whole number from 0 to 100" })
  .int("Enter a whole number from 0 to 100")
  .min(0, "Enter a whole number from 0 to 100")
  .max(100, "Enter a whole number from 0 to 100");

const lines = z
  .array(text(500))
  .max(50, "Use at most 50 lines")
  .transform((items) => items.filter((line) => line.length > 0));

export const estimateSchema = z.object({
  tasks: z
    .array(
      z.object({
        taskId: z.string().min(1),
        subTasks: z
          .array(
            z.object({
              title: text(200).min(1, "Enter a Sub task title"),
              min: hoursSchema,
              max: hoursSchema,
              comment: text(1000).default(""),
            }),
          )
          .max(200, "Use at most 200 Sub tasks per Task"),
      }),
    )
    .max(1000),
  parts: z
    .array(
      z.object({
        part: partSchema,
        deploymentMin: hoursSchema,
        deploymentMax: hoursSchema,
        assumptions: lines,
        risks: lines,
      }),
    )
    .max(PART_VALUES.length),
  qaEnabled: z.boolean(),
  qaPercent: wholePercent,
  pmEnabled: z.boolean(),
  pmPercent: wholePercent,
  bugFixPercent: wholePercent,
  hourlyRate: z.number().int().min(1).max(1000),
  rateConfirmed: z.boolean(),
});
export type EstimateInput = z.input<typeof estimateSchema>;
