import { describe, expect, it } from "vitest";
import { createLogger, type LogLevel } from "./logger";

function capture(level?: string) {
  const lines: { line: string; level: LogLevel }[] = [];
  const log = createLogger({ level, write: (line, lvl) => lines.push({ line, level: lvl }) });
  return { log, lines };
}

describe("createLogger", () => {
  it("writes one JSON line with level, msg, time and context", () => {
    const { log, lines } = capture("debug");
    log.info("health check", { component: "database" });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0].line);
    expect(entry).toMatchObject({ level: "info", msg: "health check", component: "database" });
    expect(new Date(entry.time).toISOString()).toBe(entry.time);
  });

  it("drops messages below the configured level", () => {
    const { log, lines } = capture("warn");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(lines.map((l) => l.level)).toEqual(["warn", "error"]);
  });

  it("defaults to info for a missing or unknown level", () => {
    for (const level of [undefined, "verbose"]) {
      const { log, lines } = capture(level);
      log.debug("hidden");
      log.info("shown");
      expect(lines.map((l) => JSON.parse(l.line).msg)).toEqual(["shown"]);
    }
  });

  it("serializes errors with name, message and stack", () => {
    const { log, lines } = capture();
    log.error("failed", { err: new Error("boom") });
    const entry = JSON.parse(lines[0].line);
    expect(entry.err).toMatchObject({ name: "Error", message: "boom" });
    expect(typeof entry.err.stack).toBe("string");
  });
});
