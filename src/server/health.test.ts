import { describe, expect, it } from "vitest";
import { createLogger } from "@/lib/logger";
import { checkHealth, type DatabaseProbe } from "./health";

const fixedNow = () => new Date("2026-10-29T12:00:00.000Z");

function setup(probe: Partial<DatabaseProbe> | (() => DatabaseProbe), timeoutMs = 3000) {
  const logs: string[] = [];
  const log = createLogger({ level: "debug", write: (line) => logs.push(line) });
  const getProbe =
    typeof probe === "function"
      ? probe
      : () => ({
          ping: async () => {},
          hasExtension: async () => true,
          ...probe,
        });
  const run = () => checkHealth({ getProbe, version: "0.1.0", timeoutMs, now: fixedNow, log });
  return { run, logs };
}

const secret = 'connect ECONNREFUSED db.internal:5432 password "s3cret" at Socket.<anonymous>';

describe("checkHealth", () => {
  it("returns 200 and ok when the database answers and the extension exists", async () => {
    const { run } = setup({});
    expect(await run()).toEqual({
      httpStatus: 200,
      body: {
        status: "ok",
        version: "0.1.0",
        time: "2026-10-29T12:00:00.000Z",
        database: { status: "ok" },
      },
    });
  });

  it("returns 503 with a generic message when the database is unreachable", async () => {
    const { run, logs } = setup({
      ping: async () => {
        throw new Error(secret);
      },
    });
    const result = await run();
    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe("error");
    expect(result.body.database).toEqual({ status: "error", message: "database unavailable" });
    // Raw error only in the server log, never in the response.
    expect(JSON.stringify(result.body)).not.toContain("s3cret");
    expect(JSON.stringify(result.body)).not.toContain("db.internal");
    expect(logs.join("\n")).toContain("ECONNREFUSED");
  });

  it("returns 503 when creating the client fails (e.g. bad configuration)", async () => {
    const { run } = setup(() => {
      throw new Error("Invalid configuration: DATABASE_URL missing");
    });
    const result = await run();
    expect(result.httpStatus).toBe(503);
    expect(result.body.database).toEqual({ status: "error", message: "database unavailable" });
  });

  it("returns 503 when the database does not answer within the timeout", async () => {
    const { run } = setup({ ping: () => new Promise<void>(() => {}) }, 50);
    const started = Date.now();
    const result = await run();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.httpStatus).toBe(503);
    expect(result.body.database).toEqual({ status: "error", message: "database unavailable" });
  });

  it("returns 503 when the vector extension is missing", async () => {
    const { run } = setup({ hasExtension: async () => false });
    const result = await run();
    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe("error");
    expect(result.body.database).toEqual({
      status: "error",
      message: "required extension missing",
    });
  });

  it("asks for the vector extension", async () => {
    const asked: string[] = [];
    const { run } = setup({
      hasExtension: async (name) => {
        asked.push(name);
        return true;
      },
    });
    await run();
    expect(asked).toEqual(["vector"]);
  });
});
