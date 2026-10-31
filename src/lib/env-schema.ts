// Configuration schema shared by the app and by scripts/check-env.ts.
// Keep this file free of app imports: the startup check runs it directly with Node.
import { z } from "zod";

const postgresUrl = /^postgres(ql)?:\/\//;
const httpUrl = /^https?:\/\/[^\s/]+/;
const folio3Email = /^[^@\s]+@folio3\.com$/i;

/** An optional text setting where an empty value (`NAME=`) counts as not set. */
const optionalText = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

/** Splits `ADMIN_EMAILS` into lowercased addresses, ignoring blanks and spaces. */
export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export const envSchema = z
  .object({
    DATABASE_URL: z
      .string()
      .min(1)
      .refine((value) => postgresUrl.test(value)),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    // Sign-in (specs/authentication, specs/user-roles)
    AUTH_SECRET: z.string().min(32),
    AUTH_URL: z.string().refine((value) => httpUrl.test(value)),
    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,
    ADMIN_EMAILS: optionalText,
    AUTH_DEV_LOGIN: z.preprocess(
      (value) => (value === "" || value === undefined ? "0" : value),
      z.enum(["0", "1"]),
    ),
  })
  .superRefine((env, ctx) => {
    const production = env.NODE_ENV === "production";
    if (production && env.AUTH_DEV_LOGIN === "1") {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_DEV_LOGIN"],
        message: "not allowed in production",
      });
    }
    // Google sign-in is the only way in, except for development sign-in outside production.
    const googleRequired = production || env.AUTH_DEV_LOGIN !== "1";
    if (googleRequired) {
      for (const name of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const) {
        if (!env[name]) ctx.addIssue({ code: "custom", path: [name], message: "required" });
      }
    }
    if (parseAdminEmails(env.ADMIN_EMAILS).some((email) => !folio3Email.test(email))) {
      ctx.addIssue({ code: "custom", path: ["ADMIN_EMAILS"], message: "only @folio3.com" });
    }
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
