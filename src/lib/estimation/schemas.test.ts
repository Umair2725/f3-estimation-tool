import { describe, expect, it } from "vitest";
import { nameKey } from "./options";
import {
  fieldErrors,
  HOURS_MESSAGE,
  hoursSchema,
  readConsiderations,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
} from "./schemas";

describe("step 1", () => {
  it("requires a project name", () => {
    const result = step1Schema.safeParse({ projectName: "  ", projectDate: "2026-10-31" });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!)).toMatchObject({ projectName: "Enter a project name" });
  });

  it("trims and defaults optional fields", () => {
    expect(step1Schema.parse({ projectName: " Portal ", projectDate: "2026-10-31" })).toEqual({
      projectName: "Portal",
      clientName: "",
      projectManager: "",
      projectDate: "2026-10-31",
    });
  });

  it("rejects an invalid date", () => {
    expect(step1Schema.safeParse({ projectName: "P", projectDate: "31/10/2026" }).success).toBe(
      false,
    );
  });
});

describe("step 2", () => {
  const base = { applicationTypes: ["Web"], operatingSystems: [], browsers: ["Chrome"], parts: [] };

  it("accepts known options and removes duplicates", () => {
    const parsed = step2Schema.parse({
      ...base,
      applicationTypes: ["Web", "Web", "Mobile"],
      parts: [{ part: "BACKEND", technologyIds: ["a", "a"] }],
    });
    expect(parsed.applicationTypes).toEqual(["Web", "Mobile"]);
    expect(parsed.parts[0].technologyIds).toEqual(["a"]);
  });

  it("rejects unknown options and repeated parts", () => {
    expect(step2Schema.safeParse({ ...base, browsers: ["Netscape"] }).success).toBe(false);
    expect(
      step2Schema.safeParse({
        ...base,
        parts: [
          { part: "MOBILE", technologyIds: [] },
          { part: "MOBILE", technologyIds: [] },
        ],
      }).success,
    ).toBe(false);
    expect(
      step2Schema.safeParse({ ...base, parts: [{ part: "QA", technologyIds: [] }] }).success,
    ).toBe(false);
  });
});

describe("step 3", () => {
  it("fills defaults and keeps notes", () => {
    const parsed = step3Schema.parse({
      compliance: ["HIPAA"],
      nfr: { security: { enabled: true, note: " Pen test before launch " } },
    });
    expect(parsed).toMatchObject({
      v: 1,
      hosting: [],
      compliance: ["HIPAA"],
      nfr: { security: { enabled: true, note: "Pen test before launch" } },
      other: "",
    });
  });

  it("rejects unknown compliance standards", () => {
    expect(step3Schema.safeParse({ compliance: ["ISO 9001"] }).success).toBe(false);
  });

  it("reads unreadable stored values as empty", () => {
    expect(readConsiderations("garbage").compliance).toEqual([]);
    expect(readConsiderations(null).v).toBe(1);
  });
});

describe("step 4", () => {
  it("requires a name and at least one part per feature", () => {
    const result = step4Schema.safeParse({
      features: [
        { name: "Booking", parts: ["WEB_FRONTEND"] },
        { name: "", parts: [] },
      ],
    });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!)).toMatchObject({
      "features.1.name": "Enter a feature name",
      "features.1.parts": "Choose at least one part",
    });
  });
});

describe("nameKey", () => {
  it("ignores case and spacing", () => {
    expect(nameKey("  Northwind   Clinics ")).toBe("northwind clinics");
    expect(nameKey("northwind clinics ")).toBe(nameKey("Northwind Clinics"));
  });
});

describe("hours", () => {
  it("accepts 0–9999 with one decimal", () => {
    for (const h of [0, 12, 12.5, 9999])
      expect(hoursSchema.safeParse(h).success, String(h)).toBe(true);
  });
  it("refuses negatives, two decimals and too many hours", () => {
    for (const h of [-3, 2.25, 10000]) {
      const result = hoursSchema.safeParse(h);
      expect(result.success, String(h)).toBe(false);
      expect(result.error?.issues[0].message).toBe(HOURS_MESSAGE);
    }
  });
});
