import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./check-env.ts", import.meta.url));

function run(env: Record<string, string>) {
  // Only pass what is needed, so the developer's own settings don't leak into the test.
  const result = spawnSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", script],
    {
      env: {
        PATH: process.env.PATH ?? "",
        SystemRoot: process.env.SystemRoot ?? "",
        NODE_ENV: "test",
        ...env,
      },
      encoding: "utf8",
    },
  );
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/f3",
  AUTH_SECRET: "test-only-secret-0123456789abcdefghijklmnop",
  AUTH_URL: "http://localhost:3000",
  AUTH_DEV_LOGIN: "1",
};

describe("scripts/check-env.ts", () => {
  it("exits 0 with a valid configuration", () => {
    const { code, output } = run(valid);
    expect(code).toBe(0);
    expect(output).toContain("Configuration OK");
  });

  it("exits 1 and names a missing setting", () => {
    const withoutDb = Object.fromEntries(
      Object.entries(valid).filter(([name]) => name !== "DATABASE_URL"),
    );
    const { code, output } = run(withoutDb);
    expect(code).toBe(1);
    expect(output).toContain("DATABASE_URL: missing");
  });

  it("exits 1 and names an invalid setting without printing its value", () => {
    const { code, output } = run({ ...valid, DATABASE_URL: "http://admin:t0p-secret@example.com" });
    expect(code).toBe(1);
    expect(output).toContain("DATABASE_URL: invalid");
    expect(output).not.toContain("t0p-secret");
  });

  it("refuses to start in production with development sign-in on", () => {
    const { code, output } = run({
      ...valid,
      NODE_ENV: "production",
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
    });
    expect(code).toBe(1);
    expect(output).toContain("AUTH_DEV_LOGIN: invalid");
  });
});
