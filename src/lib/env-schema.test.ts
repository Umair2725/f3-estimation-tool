import { describe, expect, it } from "vitest";
import { formatProblems, validateEnv } from "./env-schema";

const secretUrl = "postgresql://f3:s3cret-password@db.internal:5432/f3";

describe("validateEnv", () => {
  it("accepts a valid configuration and applies defaults", () => {
    const result = validateEnv({ DATABASE_URL: secretUrl });
    expect(result).toEqual({
      ok: true,
      env: { DATABASE_URL: secretUrl, NODE_ENV: "development", LOG_LEVEL: "info" },
    });
  });

  it("accepts the postgres:// scheme too", () => {
    expect(validateEnv({ DATABASE_URL: "postgres://u:p@localhost/db" }).ok).toBe(true);
  });

  it("reports a missing DATABASE_URL by name", () => {
    expect(validateEnv({})).toEqual({
      ok: false,
      problems: [{ name: "DATABASE_URL", problem: "missing" }],
    });
    expect(validateEnv({ DATABASE_URL: "" })).toEqual({
      ok: false,
      problems: [{ name: "DATABASE_URL", problem: "missing" }],
    });
  });

  it("reports a non-PostgreSQL URL as invalid", () => {
    expect(validateEnv({ DATABASE_URL: "mysql://u:p@host/db" })).toEqual({
      ok: false,
      problems: [{ name: "DATABASE_URL", problem: "invalid" }],
    });
  });

  it("reports every problem setting once", () => {
    const result = validateEnv({ LOG_LEVEL: "loud", NODE_ENV: "staging" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual(
      expect.arrayContaining([
        { name: "DATABASE_URL", problem: "missing" },
        { name: "LOG_LEVEL", problem: "invalid" },
        { name: "NODE_ENV", problem: "invalid" },
      ]),
    );
    expect(result.problems).toHaveLength(3);
  });
});

describe("formatProblems", () => {
  it("names settings without printing their values", () => {
    const secretButInvalid = "mysql://f3:s3cret-password@db.internal/f3";
    const result = validateEnv({ DATABASE_URL: secretButInvalid });
    if (result.ok) throw new Error("expected invalid");
    const text = formatProblems(result.problems);
    expect(text).toContain("DATABASE_URL: invalid");
    expect(text).not.toContain("s3cret-password");
    expect(text).not.toContain("db.internal");
  });
});
