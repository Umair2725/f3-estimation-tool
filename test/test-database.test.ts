import { describe, expect, it } from "vitest";
import { testDatabaseUrl } from "./test-database";

const real = "postgresql://f3:secret@localhost:5432/f3_estimation?schema=public";

describe("testDatabaseUrl", () => {
  it("uses f3_test on the same server locally, never the database in DATABASE_URL", () => {
    expect(testDatabaseUrl({ DATABASE_URL: real })).toBe(
      "postgresql://f3:secret@localhost:5432/f3_test?schema=public",
    );
  });

  it("prefers TEST_DATABASE_URL when set", () => {
    expect(
      testDatabaseUrl({ DATABASE_URL: real, TEST_DATABASE_URL: "postgresql://x@h/other" }),
    ).toBe("postgresql://x@h/other");
  });

  it("uses DATABASE_URL in CI, which has its own throwaway database", () => {
    expect(testDatabaseUrl({ DATABASE_URL: real, CI: "true" })).toBe(real);
  });

  it("explains a missing DATABASE_URL", () => {
    expect(() => testDatabaseUrl({})).toThrow("Tests need DATABASE_URL");
  });
});
