// The AI-only guess prompt (specs/feature-matching "Privacy of AI calls"). Pure, so a test can
// check it carries only this request's own details: no client name, no other request's data.
import { z } from "zod";

export type GuessInput = {
  applicationTypes: string[];
  partLabel: string;
  featureName: string;
  featureDescription: string;
  compliance: string[];
};

export const GUESS_SYSTEM = `You estimate software development effort for Folio3, a software services company whose developers use AI coding tools for most of their work.
Break the feature into 2 to 8 concrete development Sub tasks for the given part and stack, each with a Minimum and Maximum in hours for an experienced developer working with AI assistance.
Count development only: no QA, project management or deployment, which are added separately.
Use realistic, conservative ranges. Keep titles short (under 80 characters).`;

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
      z.object({
        title: z.string().min(1).max(200),
        minHours: z.number().min(0).max(999),
        maxHours: z.number().min(0).max(999),
      }),
    )
    .min(1)
    .max(12),
});
export type Guess = z.infer<typeof GuessSchema>;

/** Hours to tenths, with Min never above Max. */
export function guessToSubTasks(guess: Guess, note: string) {
  return guess.subTasks.map((s) => {
    const min = Math.round(Math.min(s.minHours, s.maxHours) * 10);
    const max = Math.round(Math.max(s.minHours, s.maxHours) * 10);
    return { title: s.title.trim().slice(0, 200), minTenths: min, maxTenths: max, comment: note };
  });
}
