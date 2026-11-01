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
export const GUESS_FAILED = "The AI guess failed. Try again or ask an Architect.";

/** Swappable in tests, so nothing calls the network there. */
export type GuessClient = (input: GuessInput) => Promise<Guess>;

let override: GuessClient | null | undefined;
export function setGuessClientForTests(client: GuessClient | null | undefined) {
  override = client;
}

export function aiGuessesEnabled(): boolean {
  if (override !== undefined) return override !== null;
  return !!getEnv().ANTHROPIC_API_KEY;
}

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
  const client = override ?? claudeGuess;
  return client(input);
}
