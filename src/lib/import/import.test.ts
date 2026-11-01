import { describe, expect, it } from "vitest";
import { groupZipEntries } from "./group";
import { buildPreview, type StoredParse } from "./preview";

const f = (path: string, size = 1000) => ({ path, size });

describe("groupZipEntries (specs/historical-import)", () => {
  it("groups folders, finds actuals by suffix and makes root files their own projects", () => {
    const { projects, notes } = groupZipEntries([
      f("Portal/estimate.xlsx"),
      f("Portal/estimate-actuals.xlsx"),
      f("Fleet/fleet.xlsx"),
      f("Fleet/notes.docx"),
      f("Shop/shop.xlsx"),
      f("Shop/shop_ACTUALS.xlsx"),
      f("loose estimate.xlsx"),
      f("__MACOSX/Portal/._estimate.xlsx"),
      f("Portal/~$estimate.xlsx"),
    ]);
    expect(projects).toEqual([
      { folder: "Fleet", estimatePath: "Fleet/fleet.xlsx", actualsPath: null, failure: null },
      {
        folder: "loose estimate",
        estimatePath: "loose estimate.xlsx",
        actualsPath: null,
        failure: null,
      },
      {
        folder: "Portal",
        estimatePath: "Portal/estimate.xlsx",
        actualsPath: "Portal/estimate-actuals.xlsx",
        failure: null,
      },
      {
        folder: "Shop",
        estimatePath: "Shop/shop.xlsx",
        actualsPath: "Shop/shop_ACTUALS.xlsx",
        failure: null,
      },
    ]);
    expect(notes).toEqual(['Ignored "Fleet/notes.docx": only .xlsx files are imported']);
  });

  it("fails folders with two estimates or only actuals, and notes nested or large files", () => {
    const { projects, notes } = groupZipEntries([
      f("Two/a.xlsx"),
      f("Two/b.xlsx"),
      f("Only/only actuals.xlsx"),
      f("Deep/sub/x.xlsx"),
      f("Big/big.xlsx", 11 * 1024 * 1024),
    ]);
    expect(projects.map((p) => [p.folder, p.failure])).toEqual([
      ["Only", "This folder has no estimate file"],
      ["Two", "This folder has more than one estimate file"],
    ]);
    expect(notes).toEqual([
      'Ignored "Deep/sub/x.xlsx": put each project\'s files directly in its own folder',
      'Ignored "Big/big.xlsx": larger than 10 MB',
    ]);
  });
});

const parsed: StoredParse = {
  fingerprint: "abc",
  templateVersion: "0.5",
  summary: {
    projectName: "Patient portal",
    clientName: "Northwind",
    projectManager: "Sara",
    date: { raw: "08/05/2025", iso: "2025-05-08" },
    qaPercent: 30,
    pmPercent: 25,
  },
  sheets: [
    {
      name: "BackEnd",
      kind: "BACKEND",
      status: "ok",
      stack: "Node",
      bugFixPercent: 25,
      tasks: [
        {
          title: "Auth",
          row: 9,
          research: false,
          subTasks: [
            { title: "Login", min: 8, max: 12, comment: "", row: 10 },
            { title: "Sample row", min: 1, max: 1, comment: "", row: 11 },
          ],
        },
      ],
    },
    {
      name: "MVP",
      kind: "UNKNOWN",
      status: "ok",
      bugFixPercent: null,
      tasks: [
        {
          title: "Pages",
          row: 9,
          research: false,
          subTasks: [{ title: "Home", min: 4, max: 6, comment: "", row: 10 }],
        },
      ],
    },
    { name: "GD Estimates", kind: "GD", status: "skipped", bugFixPercent: null, tasks: [] },
  ],
  warnings: [],
};

describe("buildPreview", () => {
  it("assigns parts from sheet kinds and lists unknown sheets as unassigned", () => {
    const p = buildPreview(parsed);
    expect(p).toMatchObject({
      projectName: "Patient portal",
      clientName: "Northwind",
      dateIso: "2025-05-08",
      qaPercent: 30,
    });
    expect(p.sheets.map((s) => [s.name, s.part, s.label])).toEqual([
      ["BackEnd", "BACKEND", "Backend (Node)"],
      ["MVP", null, null],
    ]);
    expect(p.unassigned).toEqual(["MVP"]);
  });

  it("applies part choices, skips, renames, exclusions and detail overrides", () => {
    const p = buildPreview(parsed, {
      projectName: " Patient portal v2 ",
      sheetParts: { MVP: "WEB_FRONTEND" },
      renames: { "BackEnd!10": "User login" },
      excluded: ["BackEnd!11"],
    });
    expect(p.projectName).toBe("Patient portal v2");
    expect(p.unassigned).toEqual([]);
    const backend = p.sheets[0].tasks[0].subTasks;
    expect(backend.map((s) => [s.title, s.originalTitle, s.excluded])).toEqual([
      ["User login", "Login", false],
      ["Sample row", "Sample row", true],
    ]);
    expect(p.counts).toEqual({ tasks: 2, subTasks: 2 });

    const skipped = buildPreview(parsed, { sheetParts: { MVP: "skip" }, excluded: ["BackEnd!9"] });
    expect(skipped.unassigned).toEqual([]);
    expect(skipped.sheets[0].tasks[0].subTasks.every((s) => s.excluded)).toBe(true);
    expect(skipped.counts).toEqual({ tasks: 0, subTasks: 0 });
  });
});
