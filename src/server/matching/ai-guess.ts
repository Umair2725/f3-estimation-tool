import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getEnv } from "@/lib/env";
import {
  GUESS_SYSTEM,
  GuessSchema,
  guessPrompt,
  type Guess,
  type GuessInput,
} from "@/lib/matching/ai-prompt";

// The optional AI-only guess (specs/feature-matching "No reliable match"). Only when an
// Anthropic API key is set; the prompt holds only this request's own details.

export const DEFAULT_MODEL = "claude-opus-5-5";
export const GUESS_FAILED = "The AI estimate failed. Try again.";

/** Swappable in tests, so nothing calls the network there. */
export type GuessClient = (input: GuessInput) => Promise<Guess>;

let override: GuessClient | null | undefined;
export function setGuessClientForTests(client: GuessClient | null | undefined) {
  override = client;
}

export function aiGuessesEnabled(): boolean {
  if (override !== undefined) return override !== null;
  const env = getEnv();
  return env.AI_GUESS === "stub" || !!env.ANTHROPIC_API_KEY;
}

/**
 * Deterministic guess for end-to-end tests (AI_GUESS=stub, refused in production): one Moderate
 * Sub task at High risk and one Boilerplate at Low, so rounds, reasons and integration all show.
 */
export const stubGuess: GuessClient = async () => ({
  subTasks: [
    {
      title: "Core logic",
      kind: "MODERATE",
      baseRounds: 4,
      risk: "HIGH",
      riskReason: "Third-party API is undocumented",
    },
    { title: "Screens", kind: "BOILERPLATE", baseRounds: 2, risk: "LOW" },
  ],
  biggestRisks: ["The client's rules for this feature are not written down yet"],
});

async function claudeGuess(input: GuessInput): Promise<Guess> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.parse({
    model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 16000,
    // If a safety classifier declines, Anthropic's recommended fallback model answers instead.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: GUESS_SYSTEM,
    messages: [{ role: "user", content: guessPrompt(input) }],
    output_config: { format: zodOutputFormat(GuessSchema) },
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`AI guess returned no usable answer (${response.stop_reason})`);
  }
  return GuessSchema.parse(response.parsed_output);
}

export async function guess(input: GuessInput): Promise<Guess> {
  const client = override ?? (getEnv().AI_GUESS === "stub" ? stubGuess : claudeGuess);
  return client(input);
}
