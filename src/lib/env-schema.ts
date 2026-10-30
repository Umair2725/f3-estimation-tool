// Configuration schema shared by the app and by scripts/check-env.ts.
// Keep this file free of app imports: the startup check runs it directly with Node.
import { z } from "zod";

const postgresUrl = /^postgres(ql)?:\/\//;

export const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => postgresUrl.test(value)),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

export type EnvProblem = { name: string; problem: "missing" | "invalid" };

export type EnvResult = { ok: true; env: Env } | { ok: false; problems: EnvProblem[] };

/** Validates settings and reports problems by name only, never by value. */
export function validateEnv(source: Record<string, string | undefined>): EnvResult {
  const result = envSchema.safeParse(source);
  if (result.success) return { ok: true, env: result.data };

  const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
  const problems = names.map((name): EnvProblem => {
    const value = source[name];
    return { name, problem: value === undefined || value === "" ? "missing" : "invalid" };
  });
  return { ok: false, problems };
}

export function formatProblems(problems: EnvProblem[]): string {
  const lines = problems.map((p) => `  - ${p.name}: ${p.problem}`);
  return ["Invalid configuration. Fix these settings (see .env.example):", ...lines].join("\n");
}
