import { describe, expect, it } from "vitest";
import { matchActuals, MIN_MAX_DIFFER, type EstimatePart, type FileSheet } from "./match";
import { buildReport, variance } from "./report";

const estimate: EstimatePart[] = [
  {
    partId: "p-backend",
    kind: "BACKEND",
    label: "Backend (Node.js)",
    tasks: [
      {
        title: "Authentication",
        subTasks: [
          { id: "s-login", title: "User login", minTenths: 80, maxTenths: 120 },
          { id: "s-reset", title: "Password reset", minTenths: 40, maxTenths: 60 },
          { id: "s-upload", title: "Image uploader", minTenths: 60, maxTenths: 80 },
        ],
      },
      {
        title: "Booking",
        subTasks: [{ id: "s-book", title: "Booking API", minTenths: 400, maxTenths: 560 }],
      },
    ],
  },
  {
    partId: "p-mobile",
    kind: "MOBILE",
    label: "Mobile (Flutter)",
    tasks: [
      {
        title: "Booking",
        subTasks: [{ id: "s-screens", title: "Booking screens", minTenths: 140, maxTenths: 200 }],
      },
    ],
  },
];

const file: FileSheet[] = [
  {
    name: "Backend (Node.js)",
    kind: "BACKEND",
    tasks: [
      {
        title: "Authentication",
        subTasks: [
          { title: "User Login + OTP", min: 10, max: 10, row: 10 },
          { title: "Password reset", min: 5, max: 7, row: 11 },
          { title: "Data migration", min: 6, max: 6, row: 12 },
        ],
      },
      // The Task was renamed, but its Sub task still matches by name.
      {
        title: "Appointments",
        subTasks: [{ title: "Booking API", min: 38, max: 38, actual: 38, row: 14 }],
      },
    ],
  },
  {
    name: "MVP",
    kind: "UNKNOWN",
    tasks: [
      { title: "Booking", subTasks: [{ title: "Booking screens", min: 18, max: 18, row: 9 }] },
    ],
  },
];

const byTitle = (rows: ReturnType<typeof matchActuals>["rows"], title: string) =>
  rows.find((r) => r.title === title)!;

describe("matchActuals (specs/actual-hours)", () => {
  it("matches exact and similar names, and finds unplanned and dropped work", () => {
    const { rows, counts, sheets } = matchActuals(estimate, file);
    expect(sheets).toEqual([
      { name: "Backend (Node.js)", kind: "BACKEND", partId: "p-backend", needsAssignment: false },
      { name: "MVP", kind: "UNKNOWN", partId: null, needsAssignment: true },
    ]);
    expect(byTitle(rows, "User login")).toMatchObject({
      status: "MATCHED",
      subTaskId: "s-login",
      actual: 10,
      needsConfirmation: true,
    });
    expect(byTitle(rows, "Password reset")).toMatchObject({
      status: "MATCHED",
      actual: 5,
      needsConfirmation: false,
      flags: [MIN_MAX_DIFFER],
    });
    expect(byTitle(rows, "Booking API")).toMatchObject({
      status: "MATCHED",
      actual: 38,
      sourceRow: 14,
    });
    expect(byTitle(rows, "Data migration")).toMatchObject({
      status: "UNPLANNED",
      taskTitle: "Authentication",
      actual: 6,
    });
    expect(byTitle(rows, "Image uploader")).toMatchObject({ status: "DROPPED", actual: null });
    // The MVP sheet isn't assigned yet, so Mobile's estimate is dropped for now.
    expect(byTitle(rows, "Booking screens")).toMatchObject({
      status: "DROPPED",
      partId: "p-mobile",
    });
    expect(counts).toEqual({ matched: 3, unplanned: 1, dropped: 2, toConfirm: 1 });
  });

  it("applies the person's decisions: sheet assignment, rejected match and typed hours", () => {
    const { rows } = matchActuals(estimate, file, {
      sheetParts: { MVP: "p-mobile" },
      rejected: ["Backend (Node.js)!10>s-login"],
      hours: { "Backend (Node.js)!11": 6 },
    });
    expect(byTitle(rows, "Booking screens")).toMatchObject({
      status: "MATCHED",
      actual: 18,
      sourceSheet: "MVP",
    });
    expect(byTitle(rows, "User Login + OTP")).toMatchObject({ status: "UNPLANNED" });
    expect(byTitle(rows, "User login")).toMatchObject({ status: "DROPPED" });
    expect(byTitle(rows, "Password reset").actual).toBe(6);
  });

  it("drops everything for a part with no sheet, and skips non-development sheets", () => {
    const { rows, sheets } = matchActuals(estimate, [
      { name: "QA Estimates", kind: "QA", tasks: [] },
    ]);
    expect(sheets[0]).toMatchObject({ partId: null, needsAssignment: false });
    expect(rows.every((r) => r.status === "DROPPED")).toBe(true);
  });
});

describe("accuracy report", () => {
  it("computes variance against Min", () => {
    expect(variance(40, 38)).toBe(-5);
    expect(variance(40, 46)).toBe(15);
    expect(variance(0, 5)).toBeNull();
  });

  it("totals matched work by part and Task, plus unplanned and dropped", () => {
    const { rows } = matchActuals(estimate, file, { sheetParts: { MVP: "p-mobile" } });
    const report = buildReport(
      rows.map((r) => ({
        ...r,
        actualTenths: r.actual === null ? null : Math.round(r.actual * 10),
      })),
    );
    const backend = report.parts.find((p) => p.label === "Backend (Node.js)")!;
    expect(backend).toMatchObject({ estMin: 52, estMax: 74, actual: 53, variance: 2 });
    expect(backend.tasks.map((t) => t.title)).toEqual(["Authentication", "Booking"]);
    expect(report.unplanned).toEqual({ count: 1, actual: 6 });
    expect(report.dropped).toEqual({ count: 1, estMin: 6, estMax: 8 });
    expect(report.actualTotal).toBe(77);
  });
});
