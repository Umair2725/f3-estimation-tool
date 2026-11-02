import { describe, expect, it } from "vitest";
import { formatProblems, parseAdminEmails, validateEnv } from "./env-schema";

const secretUrl = "postgresql://f3:s3cret-password@db.internal:5432/f3";
const authSecret = "test-only-secret-0123456789abcdefghijklmnop";

/** A complete, valid configuration for local development with Google sign-in. */
const base = {
  DATABASE_URL: secretUrl,
  AUTH_SECRET: authSecret,
  AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "google-client-s3cret",
};

function problemsOf(source: Record<string, string | undefined>) {
  const result = validateEnv(source);
  return result.ok ? [] : result.problems;
}

describe("validateEnv: database and basics", () => {
  it("accepts a valid configuration and applies defaults", () => {
    const result = validateEnv(base);
    expect(result).toEqual({
      ok: true,
      env: {
        ...base,
        NODE_ENV: "development",
        LOG_LEVEL: "info",
        ADMIN_EMAILS: undefined,
        AUTH_DEV_LOGIN: "0",
        EMBEDDINGS_PROVIDER: "local",
        EMBEDDINGS_CACHE_DIR: undefined,
        ANTHROPIC_API_KEY: undefined,
        ANTHROPIC_MODEL: undefined,
        SMTP_HOST: undefined,
        SMTP_PORT: 465,
        SMTP_SECURE: undefined,
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        MAIL_FROM: undefined,
      },
    });
  });

  it("accepts the stub embeddings provider and refuses unknown ones", () => {
    expect(validateEnv({ ...base, EMBEDDINGS_PROVIDER: "stub" }).ok).toBe(true);
    expect(problemsOf({ ...base, EMBEDDINGS_PROVIDER: "openai" })).toEqual([
      { name: "EMBEDDINGS_PROVIDER", problem: "invalid" },
    ]);
  });

  it("accepts the postgres:// scheme too", () => {
    expect(validateEnv({ ...base, DATABASE_URL: "postgres://u:p@localhost/db" }).ok).toBe(true);
  });

  it("reports a missing DATABASE_URL by name", () => {
    expect(problemsOf({ ...base, DATABASE_URL: undefined })).toEqual([
      { name: "DATABASE_URL", problem: "missing" },
    ]);
    expect(problemsOf({ ...base, DATABASE_URL: "" })).toEqual([
      { name: "DATABASE_URL", problem: "missing" },
    ]);
  });

  it("reports a non-PostgreSQL URL as invalid", () => {
    expect(problemsOf({ ...base, DATABASE_URL: "mysql://u:p@host/db" })).toEqual([
      { name: "DATABASE_URL", problem: "invalid" },
    ]);
  });

  it("reports every problem setting once", () => {
    const problems = problemsOf({ ...base, LOG_LEVEL: "loud", NODE_ENV: "staging" });
    expect(problems).toEqual(
      expect.arrayContaining([
        { name: "LOG_LEVEL", problem: "invalid" },
        { name: "NODE_ENV", problem: "invalid" },
      ]),
    );
    expect(problems).toHaveLength(2);
  });
});

describe("validateEnv: sign-in settings", () => {
  it("requires AUTH_SECRET with at least 32 characters", () => {
    expect(problemsOf({ ...base, AUTH_SECRET: undefined })).toEqual([
      { name: "AUTH_SECRET", problem: "missing" },
    ]);
    expect(problemsOf({ ...base, AUTH_SECRET: "too-short" })).toEqual([
      { name: "AUTH_SECRET", problem: "invalid" },
    ]);
  });

  it("requires AUTH_URL to be an http(s) URL", () => {
    expect(problemsOf({ ...base, AUTH_URL: "localhost:3000" })).toEqual([
      { name: "AUTH_URL", problem: "invalid" },
    ]);
    expect(validateEnv({ ...base, AUTH_URL: "https://estimates.folio3.com" }).ok).toBe(true);
  });

  it("requires the Google client when development sign-in is off", () => {
    expect(problemsOf({ ...base, GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: "" })).toEqual([
      { name: "GOOGLE_CLIENT_ID", problem: "missing" },
      { name: "GOOGLE_CLIENT_SECRET", problem: "missing" },
    ]);
  });

  it("allows no Google client in development and test when development sign-in is on", () => {
    for (const NODE_ENV of ["development", "test"]) {
      const result = validateEnv({
        ...base,
        NODE_ENV,
        AUTH_DEV_LOGIN: "1",
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
      });
      expect(result.ok).toBe(true);
    }
  });

  it("refuses development sign-in in production", () => {
    expect(problemsOf({ ...base, NODE_ENV: "production", AUTH_DEV_LOGIN: "1" })).toEqual([
      { name: "AUTH_DEV_LOGIN", problem: "invalid" },
    ]);
  });

  it("requires the Google client in production even with development sign-in requested", () => {
    const problems = problemsOf({
      ...base,
      NODE_ENV: "production",
      AUTH_DEV_LOGIN: "1",
      GOOGLE_CLIENT_ID: undefined,
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        { name: "AUTH_DEV_LOGIN", problem: "invalid" },
        { name: "GOOGLE_CLIENT_ID", problem: "missing" },
      ]),
    );
  });

  it("only accepts 0 or 1 for AUTH_DEV_LOGIN", () => {
    expect(problemsOf({ ...base, AUTH_DEV_LOGIN: "yes" })).toEqual([
      { name: "AUTH_DEV_LOGIN", problem: "invalid" },
    ]);
  });

  it("accepts only @folio3.com addresses in ADMIN_EMAILS", () => {
    expect(
      validateEnv({ ...base, ADMIN_EMAILS: " KhanUmair@folio3.com , sara.a@folio3.com ," }).ok,
    ).toBe(true);
    expect(problemsOf({ ...base, ADMIN_EMAILS: "admin@folio3.com,someone@gmail.com" })).toEqual([
      { name: "ADMIN_EMAILS", problem: "invalid" },
    ]);
  });
});

describe("parseAdminEmails", () => {
  it("lowercases, trims and drops blanks", () => {
    expect(parseAdminEmails(" KhanUmair@folio3.com , ,sara.a@folio3.com ")).toEqual([
      "khanumair@folio3.com",
      "sara.a@folio3.com",
    ]);
    expect(parseAdminEmails(undefined)).toEqual([]);
  });
});

describe("formatProblems", () => {
  it("names settings without printing their values", () => {
    const result = validateEnv({
      ...base,
      DATABASE_URL: "mysql://f3:s3cret-password@db.internal/f3",
      AUTH_SECRET: "short-s3cret",
    });
    if (result.ok) throw new Error("expected invalid");
    const text = formatProblems(result.problems);
    expect(text).toContain("DATABASE_URL: invalid");
    expect(text).toContain("AUTH_SECRET: invalid");
    expect(text).not.toContain("s3cret");
    expect(text).not.toContain("db.internal");
    expect(text).not.toContain(authSecret);
  });
});

describe("validateEnv: email", () => {
  const smtp = {
    SMTP_HOST: "smtp.gmail.com",
    SMTP_USER: "estimation@folio3.com",
    SMTP_PASSWORD: "app-pass-s3cret",
    MAIL_FROM: "estimation@folio3.com",
  };

  it("treats email as optional", () => {
    expect(problemsOf(base)).toEqual([]);
  });

  it("accepts a complete SMTP setup with port and secure defaults", () => {
    const result = validateEnv({ ...base, ...smtp });
    expect(result.ok && result.env.SMTP_PORT).toBe(465);
    expect(result.ok && result.env.SMTP_SECURE).toBeUndefined();
    const custom = validateEnv({ ...base, ...smtp, SMTP_PORT: "587", SMTP_SECURE: "false" });
    expect(custom.ok && [custom.env.SMTP_PORT, custom.env.SMTP_SECURE]).toEqual([587, "false"]);
  });

  it("requires the user, password and from address once a host is set", () => {
    expect(problemsOf({ ...base, ...smtp, SMTP_PASSWORD: "" })).toEqual([
      { name: "SMTP_PASSWORD", problem: "missing" },
    ]);
    expect(problemsOf({ ...base, SMTP_HOST: "smtp.gmail.com" }).map((p) => p.name)).toEqual([
      "SMTP_USER",
      "SMTP_PASSWORD",
      "MAIL_FROM",
    ]);
  });

  it("refuses a bad port or from address without printing the password", () => {
    const problems = problemsOf({ ...base, ...smtp, SMTP_PORT: "abc", MAIL_FROM: "nope" });
    expect(problems.map((p) => p.name).sort()).toEqual(["MAIL_FROM", "SMTP_PORT"]);
    expect(formatProblems(problems)).not.toContain("app-pass-s3cret");
  });
});
