import { describe, expect, it } from "vitest";
import { buildChecklist, mentionsName, type ChecklistInput } from "./checklist";

const clean: ChecklistInput = {
  parts: [
    {
      part: "BACKEND",
      assumptions: [],
      risks: [],
      tasks: [
        {
          taskId: "t1",
          featureName: "Booking",
          subTasks: [{ title: "API", min: 12, max: 16, comment: "" }],
        },
      ],
    },
  ],
  features: [{ name: "Booking" }],
  otherConsiderations: "",
  overheads: { hourlyRate: 30, rateConfirmed: true },
  approvedRates: [25, 30, 35],
  otherClients: ["Contoso Logistics"],
};

const codes = (input: ChecklistInput) => buildChecklist(input).map((i) => i.code);

describe("buildChecklist (specs/excel-export)", () => {
  it("is empty for a clean estimate", () => {
    expect(buildChecklist(clean)).toEqual([]);
  });

  it("flags Min over Max and 0-hour Sub tasks with where to fix them", () => {
    const items = buildChecklist({
      ...clean,
      parts: [
        {
          ...clean.parts[0],
          tasks: [
            {
              taskId: "t1",
              featureName: "Booking",
              subTasks: [
                { title: "API", min: 20, max: 12, comment: "" },
                { title: "Docs", min: 0, max: 0, comment: "" },
              ],
            },
          ],
        },
      ],
    });
    expect(items).toEqual([
      {
        code: "min-over-max",
        message: 'Min is more than Max: Backend → "Booking" → "API"',
        part: "BACKEND",
        taskId: "t1",
      },
      {
        code: "zero-hours",
        message: 'No hours: Backend → "Booking" → "Docs"',
        part: "BACKEND",
        taskId: "t1",
      },
    ]);
  });

  it("flags Tasks without Sub tasks and features without hours", () => {
    expect(
      codes({
        ...clean,
        parts: [
          { ...clean.parts[0], tasks: [{ taskId: "t1", featureName: "Booking", subTasks: [] }] },
        ],
      }),
    ).toEqual(["task-without-subtasks", "feature-without-hours"]);
  });

  it("flags an unconfirmed or no-longer-approved rate", () => {
    expect(codes({ ...clean, overheads: { hourlyRate: 30, rateConfirmed: false } })).toEqual([
      "rate-unconfirmed",
    ]);
    expect(codes({ ...clean, overheads: { hourlyRate: 50, rateConfirmed: true } })).toEqual([
      "rate-not-approved",
    ]);
  });

  it("flags another client named anywhere in the request", () => {
    const named = {
      ...clean,
      parts: [
        {
          ...clean.parts[0],
          tasks: [
            {
              taskId: "t1",
              featureName: "Booking",
              subTasks: [
                { title: "API", min: 1, max: 2, comment: "Same as the contoso logistics portal" },
              ],
            },
          ],
        },
      ],
    };
    expect(buildChecklist(named)).toEqual([
      {
        code: "other-client-named",
        message: "The request names another client: Contoso Logistics",
      },
    ]);
    expect(codes({ ...clean, otherConsiderations: "Reuse Contoso Logistics designs" })).toEqual([
      "other-client-named",
    ]);
  });
});

describe("mentionsName", () => {
  it("matches whole words regardless of case", () => {
    expect(mentionsName("built for ACME corp.", "Acme")).toBe(true);
    expect(mentionsName("acmetools", "Acme")).toBe(false);
  });
  it("ignores names shorter than 4 characters", () => {
    expect(mentionsName("the IBM portal", "IBM")).toBe(false);
  });
});
