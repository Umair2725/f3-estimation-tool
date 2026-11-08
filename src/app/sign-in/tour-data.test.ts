import { describe, expect, it } from "vitest";
import { ROWS, aiRounds, range, rowHours, tabTotals } from "./tour-data";

describe("sign-in product tour data", () => {
  it("sizes the demo AI estimate in rounds with 15% integration", () => {
    expect(aiRounds()).toEqual({ total: [13, 17], integration: [2, 2] });
  });

  it("turns rounds into hours at the chosen minutes per round", () => {
    const ai = ROWS.backend[2];
    expect(rowHours(ai, 60)).toEqual([13, 17]);
    expect(rowHours(ai, 90)).toEqual([20, 26]);
    expect(rowHours(ROWS.backend[0], 90)).toEqual([32, 40]);
  });

  it("adds bugs, QA and PM overheads to the tab's development hours", () => {
    expect(tabTotals("backend", 60)).toEqual({
      dev: [73, 95],
      overheads: [47, 62],
      total: [120, 157],
    });
  });

  it("writes a range, or one number when both ends match", () => {
    expect(range([3, 3])).toBe("3");
    expect(range([2, 4])).toBe("2–4");
  });
});
