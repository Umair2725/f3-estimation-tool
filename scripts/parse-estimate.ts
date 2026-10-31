// Prints what the estimate parser reads from a local .xlsx file (specs/estimate-file-parsing).
// Nothing is uploaded or stored. Usage: npm run parse-estimate -- <file.xlsx> [--json]
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseEstimateFile } from "../src/server/estimate-parser/core";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const json = args.includes("--json");

if (!file || !existsSync(file)) {
  console.error(
    file ? `File not found: ${file}` : "Usage: npm run parse-estimate -- <file.xlsx> [--json]",
  );
  process.exit(2);
}

async function main(file: string) {
  const result = await parseEstimateFile(readFileSync(file), basename(file));
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.ok) {
    console.log(`${result.fileName}: ${result.error}`);
    return;
  }

  const s = result.summary;
  const h = (n: number) => String(Math.round(n * 10) / 10);
  console.log(`File:        ${result.fileName} (template v${result.templateVersion ?? "?"})`);
  console.log(`Fingerprint: ${result.fingerprint.slice(0, 16)}…`);
  console.log(
    `Project:     ${s.projectName ?? "–"} · client ${s.clientName ?? "–"} · PM ${s.projectManager ?? "–"} · date ${s.date?.iso ?? s.date?.raw ?? "–"}`,
  );
  console.log(`QA / PM:     ${s.qaPercent ?? "–"}% / ${s.pmPercent ?? "–"}%`);
  console.log("");
  for (const sheet of result.sheets) {
    const subTasks = sheet.tasks.reduce((n, t) => n + t.subTasks.length, 0);
    const details = [
      sheet.stack && `stack ${sheet.stack}`,
      sheet.estimator && `by ${sheet.estimator}`,
      sheet.reviewer && `reviewed by ${sheet.reviewer}`,
    ].filter(Boolean);
    console.log(
      `- ${sheet.name} → ${sheet.kind} (${sheet.status})${details.length ? ` · ${details.join(", ")}` : ""}`,
    );
    if (sheet.status === "ok") {
      console.log(
        `    ${sheet.tasks.length} Tasks, ${subTasks} Sub tasks, development ${h(sheet.development.min)}–${h(sheet.development.max)} h` +
          (sheet.bugFixPercent !== null ? `, bug fixing ${sheet.bugFixPercent}%` : "") +
          (sheet.activities.length ? `, ${sheet.activities.length} other activities` : "") +
          (sheet.assumptions.length ? `, ${sheet.assumptions.length} assumptions` : "") +
          (sheet.risks.length ? `, ${sheet.risks.length} risks` : ""),
      );
    }
  }
  console.log("");
  console.log(result.warnings.length ? `Warnings (${result.warnings.length}):` : "No warnings.");
  for (const w of result.warnings) {
    const where = [w.sheet, w.cell ?? (w.row ? `row ${w.row}` : undefined)]
      .filter(Boolean)
      .join(" ");
    console.log(`  - ${where ? `${where}: ` : ""}${w.message}`);
  }
}

void main(file);
