import { formatProblems, validateEnv, type Env } from "./env-schema";

let cached: Env | undefined;

/**
 * Returns the validated configuration. Parsed lazily so `next build` works without
 * runtime settings; the server itself refuses to start earlier via scripts/check-env.ts.
 */
export function getEnv(): Env {
  if (!cached) {
    const result = validateEnv(process.env);
    if (!result.ok) throw new Error(formatProblems(result.problems));
    cached = result.env;
  }
  return cached;
}
