import { describe, expect, it } from "vitest";
import { computeTotals, formatHours, formatRange, formatUsd, type TotalsInput } from "./totals";

const base: TotalsInput = {
  parts: [],
  qa: { enabled: true, percent: 25 },
  pm: { enabled: true, percent: 30 },
  bugFixPercent: 10,
  rate: 30,
};

// The spec example: Sub tasks 100–140 h, bug fixing 10%, Deployment 16–24, QA 25%, PM 30%, $30.
const specExample: TotalsInput = {
  ...base,
  parts: [
    {
      part: "BACKEND",
      tasks: [
        {
          subTasks: [
            { minTenths: 600, maxTenths: 800 },
            { minTenths: 400, maxTenths: 600 },
          ],
        },
        { subTasks: [] },
      ],
      deploymentMinTenths: 160,
      deploymentMaxTenths: 240,
    },
  ],
};

const close = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 9);

describe("computeTotals (specs/estimate-hours)", () => {
  it("matches the spec example", () => {
    const t = computeTotals(specExample);
    expect(t.parts[0].tasks).toEqual([
      { min: 100, max: 140 },
      { min: 0, max: 0 },
    ]);
    close(t.parts[0].bugFixing.min, 10);
    close(t.development.min, 126);
    close(t.development.max, 178);
    close(t.qa!.min, 31.5);
    close(t.qa!.max, 44.5);
    close(t.pm!.min, 37.8);
    close(t.pm!.max, 53.4);
    close(t.total.min, 195.3);
    close(t.total.max, 275.9);
    close(t.cost.min, 5859);
    close(t.cost.max, 8277);
    expect(t.hasHours).toBe(true);
  });

  it("leaves out QA or PM when turned off", () => {
    const t = computeTotals({ ...specExample, pm: { enabled: false, percent: 30 } });
    expect(t.pm).toBeNull();
    close(t.total.min, 126 + 31.5);
  });

  it("counts a part with Deployment only, without marking it as having hours", () => {
    const t = computeTotals({
      ...base,
      parts: [
        { part: "CLOUD_INFRA", tasks: [], deploymentMinTenths: 80, deploymentMaxTenths: 120 },
      ],
    });
    close(t.development.min, 8);
    expect(t.hasHours).toBe(false);
  });

  it("handles an empty estimate", () => {
    const t = computeTotals(base);
    expect(t.total).toEqual({ min: 0, max: 0 });
    expect(t.cost).toEqual({ min: 0, max: 0 });
    expect(t.hasHours).toBe(false);
  });
});

describe("formatting", () => {
  it("formats hours, ranges and money", () => {
    expect(formatHours(31.5)).toBe("31.5");
    expect(formatHours(126)).toBe("126");
    expect(formatHours(0.1 + 0.2)).toBe("0.3");
    expect(formatRange({ min: 195.3, max: 275.9 })).toBe("195–276");
    expect(formatRange({ min: 0, max: 0 }, false)).toBe("–");
    expect(formatUsd(8277)).toBe("$8,277");
  });
});
