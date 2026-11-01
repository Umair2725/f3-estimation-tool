import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { NOT_A_WORKBOOK, parseEstimateFile } from "./core";
import type { ParsedEstimate, ParsedSheet } from "./types";

// Synthetic workbooks reproducing each finding from the sample past estimates (brief section 15).

type Rows = Record<number, Record<string, ExcelJS.CellValue>>;

async function workbook(sheets: Record<string, Rows>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    for (const [r, cells] of Object.entries(rows)) {
      for (const [col, value] of Object.entries(cells)) ws.getCell(`${col}${r}`).value = value;
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const header = { B: "S.No", C: "Task", D: "Minimum", E: "Maximum", F: "Comments" };

async function parse(sheets: Record<string, Rows>, fileName = "test.xlsx") {
  const result = await parseEstimateFile(await workbook(sheets), fileName);
  if (!result.ok) throw new Error(result.error);
  return result;
}
const sheet = (r: Extract<ParsedEstimate, { ok: true }>, name: string) =>
  r.sheets.find((s) => s.name === name) as ParsedSheet;
const messages = (r: Extract<ParsedEstimate, { ok: true }>) => r.warnings.map((w) => w.message);

describe("sheets (specs/estimate-file-parsing)", () => {
  it("classifies renamed sheets and warns about unknown ones", async () => {
    const names = ["BackEnd", "React Web", "MobileApp", "Admin Panel", "GD Estimates (Web)", "MVP"];
    const r = await parse(Object.fromEntries(names.map((n) => [n, { 8: header }])));
    expect(r.sheets.map((s) => s.kind)).toEqual([
      "BACKEND",
      "WEB_FRONTEND",
      "MOBILE",
      "ADMIN_PANEL",
      "GD",
      "UNKNOWN",
    ]);
    expect(messages(r)).toContain(
      'The kind of sheet "MVP" is unknown; assign it a part or skip it',
    );
  });

  it("finds a header on row 10 with shifted columns and keeps sources", async () => {
    const r = await parse({
      "Dev Backend Estimates": {
        10: { C: "S.No", D: "Task", E: "Minimum", F: "Maximum", G: "Comments" },
        11: { C: 1, D: "Authentication" },
        12: { D: "Login API", E: 8, F: 12, G: "JWT" },
        19: { D: "Password reset", E: 4, F: 6 },
      },
    });
    const backend = sheet(r, "Dev Backend Estimates");
    expect(backend.status).toBe("ok");
    expect(backend.tasks).toEqual([
      {
        title: "Authentication",
        row: 11,
        research: false,
        comment: "",
        min: 12,
        max: 18,
        subTasks: [
          { title: "Login API", min: 8, max: 12, comment: "JWT", row: 12 },
          { title: "Password reset", min: 4, max: 6, comment: "", row: 19 },
        ],
      },
    ]);
  });

  it("recalculates from Sub tasks when Task rows have no SUM (26–34 vs 166–254)", async () => {
    const rows: Rows = { 8: header, 9: { B: 1, C: "Users" } };
    const subs: [number, number][] = [
      [100, 150],
      [66, 104],
    ];
    subs.forEach(([min, max], i) => (rows[10 + i] = { C: `Piece ${i + 1}`, D: min, E: max }));
    rows[20] = {
      C: "Development Total Efforts (in hours)",
      D: { formula: "SUM(D9)", result: 26 },
      E: { formula: "SUM(E9)", result: 34 },
    };
    const r = await parse({ BackEnd: rows });
    expect(sheet(r, "BackEnd").development).toEqual({ min: 166, max: 254 });
    expect(messages(r)).toContain(
      "The file's development total is 26–34 h, but its Sub tasks add up to 166–254 h",
    );
  });

  it("warns about formulas without saved results", async () => {
    const r = await parse({
      Web: {
        8: header,
        9: { B: 1, C: "Pages" },
        10: { C: "Home", D: 4, E: { formula: "D10*2" } as ExcelJS.CellValue },
      },
    });
    expect(messages(r)).toContain(
      "Some formulas have no saved results; totals were recalculated from the Sub tasks",
    );
  });

  it("reports skeleton sheets and the unfilled template as having no data", async () => {
    const r = await parse({
      "Admin Panel": { 8: header, 9: { B: 1 }, 10: { B: 2 }, 11: { B: 3 } },
    });
    expect(sheet(r, "Admin Panel").status).toBe("no-data");
    expect(messages(r)).toContain("Skeleton sheet: numbered rows but no Task text or hours");

    const template = readFileSync(
      path.join(process.cwd(), "docs/templates/Empty_Estimation_Sheet.xlsx"),
    );
    const t = await parseEstimateFile(template, "Empty_Estimation_Sheet.xlsx");
    if (!t.ok) throw new Error(t.error);
    const dev = t.sheets.filter((s) => ["BACKEND", "ADMIN_PANEL", "MOBILE"].includes(s.kind));
    expect(dev.map((s) => s.status)).toEqual(["no-data", "no-data", "no-data"]);
    expect(t.sheets.flatMap((s) => s.tasks)).toEqual([]);
    expect(t.summary.projectName).toBeNull();
    expect(t.templateVersion).toBe("0.5");
  });

  it("reads other activities, bug fixing %, research, assumptions and risks; skips notes", async () => {
    const r = await parse({
      "Dev Mobile Estimates": {
        2: { B: "Patient Portal (React Native)" },
        3: { B: "5th May 2025" },
        4: { B: "By: Ali / Reviewed by: Sara" },
        8: header,
        9: { B: 1, C: "Booking" },
        10: { C: "Calendar", D: 20, E: 30 },
        12: {
          C: "Development Total Efforts (in hours)",
          D: { formula: "SUM(D9)", result: 20 },
          E: 30,
        },
        14: { B: "S.No", C: "Other Development Activities", D: "Minimum", E: "Maximum" },
        15: {
          B: 1,
          C: "Bug Fixing",
          D: { formula: "D12*0.25", result: 5 },
          E: { formula: "E12*0.25", result: 7.5 },
        },
        16: { B: 2, C: "Deployment", D: 8, E: 0, F: "App store submission" },
        17: { C: "Staging" },
        18: { C: "App Store" },
        21: { B: "S.No", C: "Research Task (if any)", D: "Minimum", E: "Maximum" },
        22: { B: 1, C: "<Research Task …1>", D: 0, E: 0 },
        23: { B: 2, C: "Payments SDK spike", D: 8, E: 12 },
        26: { B: "S.No", C: "Assumptions & Constraints" },
        27: { B: 1, C: "<List down assumption and constraints for the Project.>" },
        28: { B: 2, C: "Client provides the API" },
        30: { B: "S.No", C: "Risks" },
        31: { B: 1, C: "App store review delays" },
        34: { C: "Notes" },
        35: { C: "Web Applications", F: "Mobile Applications" },
      },
    });
    const mobile = sheet(r, "Dev Mobile Estimates");
    expect(mobile).toMatchObject({
      title: "Patient Portal (React Native)",
      stack: "React Native",
      estimator: "Ali",
      reviewer: "Sara",
      date: { raw: "5th May 2025", iso: "2025-05-05" },
      bugFixPercent: 25,
      environments: ["Staging", "App Store"],
      development: { min: 20, max: 30 },
      assumptions: ["Client provides the API"],
      risks: ["App store review delays"],
    });
    expect(mobile.activities).toEqual([
      { title: "Deployment", min: 8, max: 0, comment: "App store submission", row: 16 },
    ]);
    // The research row has its hours on the Task row itself; the placeholder is skipped.
    expect(mobile.tasks.filter((t) => t.research).map((t) => [t.title, t.min, t.max])).toEqual([
      ["Payments SDK spike", 8, 12],
    ]);
    expect(messages(r)).toContain('Min is more than Max (8 > 0) for "Deployment"');
    expect(JSON.stringify(mobile)).not.toContain("Web Applications");
  });

  it("warns about duplicate S.No and notes outside the table", async () => {
    const r = await parse({
      Server: {
        8: header,
        9: { A: "Can we reuse the old API?", B: 1, C: "Auth" },
        10: { C: "Login", D: 2, E: 3 },
        11: { B: 1, C: "Profile" },
        12: { C: "Edit profile", D: 2, E: 4 },
      },
    });
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        'Note outside the table: "Can we reuse the old API?"',
        "Duplicate S.No 1 (also on row 9)",
      ]),
    );
  });
});

describe("summary", () => {
  it("reads project details, QA/PM percentages, considerations and the template version", async () => {
    const r = await parse({
      Summary: {
        1: { B: "Folio3 Project Estimation Template v 0.4" },
        2: { B: "Field service app" },
        5: { B: "Client Name", C: "Fabrikam Energy" },
        6: { B: "Project Manager", C: "Sara" },
        7: { B: "Date", C: "08/05/2025" },
        10: { B: "Task Summary", C: "Minimum", D: "Maximum", E: "Comments" },
        11: { B: "Development Estimates", C: { formula: "'Web'!D6", result: 100 }, D: 140 },
        12: { B: "QA Estimates", C: { formula: "C11*0.3", result: 30 }, D: 42 },
        13: { B: "PM Estimates", C: 25, D: 35 },
        14: { B: "Total Estimates", C: 155, D: 217 },
        19: { B: "Overall Estimations" },
        20: { B: "Discovery", C: 40 },
        21: { B: "Build", C: 300 },
        22: { B: "Launch", C: 28 },
        25: { B: "List of Special Considerations, where applicable:" },
        26: { B: "Tasks", C: "Action", E: "Comments" },
        27: { B: "Application type (mobile, desktop, web)", C: "Mobile" },
        28: { B: "Platforms/OS supported", C: "<Single/Multiple>", E: "<List of Platforms/OS>" },
      },
      Web: { 8: header },
    });
    expect(r.templateVersion).toBe("0.4");
    expect(r.summary).toMatchObject({
      projectName: "Field service app",
      clientName: "Fabrikam Energy",
      projectManager: "Sara",
      date: { raw: "08/05/2025", iso: "2025-05-08" },
      qaPercent: 30,
      pmPercent: 25,
    });
    expect(r.summary.considerations).toEqual([
      { label: "Application type (mobile, desktop, web)", action: "Mobile", comments: "" },
      { label: "Platforms/OS supported", action: "", comments: "" },
    ]);
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        "The file uses template v0.4, not v0.5",
        "Free-form table on rows 20–22; map it by hand if it holds estimates",
      ]),
    );
  });
});

describe("files", () => {
  it("returns an error for a file that isn't a workbook", async () => {
    const result = await parseEstimateFile(Buffer.from("%PDF-1.7 not a workbook"), "rfp.xlsx");
    expect(result).toMatchObject({ ok: false, error: NOT_A_WORKBOOK });
  });

  it("gives the same fingerprint to the same bytes under different names", async () => {
    const bytes = await workbook({ Web: { 8: header } });
    const a = await parseEstimateFile(bytes, "Estimation_Sheet.xlsx");
    const b = await parseEstimateFile(bytes, "Copy of estimate.xlsx");
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("actual-hours files (specs/actual-hours)", () => {
  it("reads an optional Actual column", async () => {
    const r = await parse({
      Web: {
        8: { B: "S.No", C: "Task", D: "Minimum", E: "Maximum", F: "Actual", G: "Comments" },
        9: { B: 1, C: "Pages" },
        10: { C: "Home", D: 4, E: 6, F: 5, G: "Done" },
        11: { C: "About", D: 2, E: 3 },
      },
    });
    const subTasks = sheet(r, "Web").tasks[0].subTasks;
    expect(subTasks[0]).toMatchObject({
      title: "Home",
      min: 4,
      max: 6,
      actual: 5,
      comment: "Done",
    });
    expect(subTasks[1].actual).toBeUndefined();
  });
});
