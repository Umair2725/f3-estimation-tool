import { describe, expect, it } from "vitest";
import {
  cellText,
  isPlaceholder,
  percentFromFormula,
  readDate,
  readHours,
  readPeople,
  readStack,
} from "./cells";

describe("cellText", () => {
  it("flattens rich text, formula results and spaces", () => {
    expect(cellText({ richText: [{ text: "Login " }, { text: "API" }] })).toBe("Login API");
    expect(cellText({ formula: "A1", result: "Total" })).toBe("Total");
    expect(cellText("  two   spaces ")).toBe("two spaces");
    expect(cellText(null)).toBe("");
  });
});

describe("readHours", () => {
  it("reads numbers, numeric text and saved formula results, rounded to 0.1", () => {
    expect(readHours(12.04)).toEqual({ hours: 12 });
    expect(readHours("8")).toEqual({ hours: 8 });
    expect(readHours({ formula: "SUM(D1:D2)", result: 166 })).toEqual({
      hours: 166,
      formula: "SUM(D1:D2)",
    });
  });
  it("flags formulas without results and invalid values", () => {
    expect(readHours({ formula: "SUM(D1:D2)" } as never)).toEqual({
      hours: 0,
      formula: "SUM(D1:D2)",
      missingResult: true,
    });
    expect(readHours("lots").invalid).toBe(true);
    expect(readHours(-3).invalid).toBe(true);
  });
});

describe("percentFromFormula", () => {
  it.each([
    ["D31*0.25", 25],
    ["D31*25%", 25],
    ["SUM(C11:C12)*0.3", 30],
    ["D31*25/100", 25],
    ["0.1*D31", 10],
    ["SUM(D1:D9)", null],
    [undefined, null],
  ])("%s → %s", (formula, percent) => {
    expect(percentFromFormula(formula)).toBe(percent);
  });
});

describe("isPlaceholder", () => {
  it("recognises template placeholders only", () => {
    for (const t of [
      "Task -1",
      "Task -23",
      "Sub task -4",
      "<Research Task …1>",
      "<List down assumption and constraints>",
    ]) {
      expect(isPlaceholder(t), t).toBe(true);
    }
    for (const t of ["Login API", "Task management", "Sub tasks review"])
      expect(isPlaceholder(t), t).toBe(false);
  });
});

describe("readDate", () => {
  it.each([
    ["5th May 2025", "2025-05-05"],
    ["08/05/2025", "2025-05-08"],
    ["2025-05-08", "2025-05-08"],
    ["May 8, 2025", "2025-05-08"],
  ])("%s → %s", (raw, iso) => {
    expect(readDate(raw)).toEqual({ raw, iso });
  });
  it("keeps text it can't read, and ignores the placeholder", () => {
    expect(readDate("08/05/2.25")).toEqual({ raw: "08/05/2.25" });
    expect(readDate("dd/mm/yyyy")).toBeNull();
  });
});

describe("header details", () => {
  it("reads estimator and reviewer", () => {
    expect(readPeople("By: Ali / Reviewed by: Sara")).toEqual({
      estimator: "Ali",
      reviewer: "Sara",
    });
    expect(readPeople("by Dev Estimator")).toEqual({ estimator: "Dev Estimator" });
    expect(readPeople("by <Name>")).toEqual({});
  });
  it("reads the stack from the last brackets", () => {
    expect(readStack("Patient Portal (React Native)")).toBe("React Native");
    expect(readStack("Flutter (mobile app)")).toBe("mobile app");
    expect(readStack("No stack here")).toBeUndefined();
  });
});
