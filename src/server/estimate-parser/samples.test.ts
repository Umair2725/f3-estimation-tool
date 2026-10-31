import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEstimateFile } from "./core";

// Optional: real past estimates placed in the git-ignored samples/ folder (never committed).
// Each must parse without throwing; counts are printed to help compare with the brief's notes.
// Skipped when the folder is missing or empty, as in CI.

const dir = path.join(process.cwd(), "samples");
const files = existsSync(dir)
  ? readdirSync(dir).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$"))
  : [];

describe.skipIf(files.length === 0)("local sample estimates", () => {
  it.each(files)("%s parses without throwing", async (file) => {
    const result = await parseEstimateFile(readFileSync(path.join(dir, file)), file);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    if (result.ok) {
      const subTasks = result.sheets.reduce(
        (n, s) => n + s.tasks.reduce((m, t) => m + t.subTasks.length, 0),
        0,
      );
      console.info(
        `${file}: ${result.sheets.length} sheets, ${subTasks} Sub tasks, ${result.warnings.length} warnings`,
      );
    } else {
      console.info(`${file}: ${result.error}`);
    }
  });
});
