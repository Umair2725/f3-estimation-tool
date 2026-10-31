import { describe, expect, it } from "vitest";
import { checkCompleteness, type CompletenessInput } from "./completeness";

const complete: CompletenessInput = {
  clientName: "Northwind Clinics",
  parts: [{ part: "BACKEND", technologyCount: 1 }],
  features: [{ name: "Booking", parts: ["BACKEND"] }],
};

describe("checkCompleteness", () => {
  it("passes a complete request", () => {
    expect(checkCompleteness(complete)).toEqual([]);
  });

  it("names each missing item with its step", () => {
    expect(checkCompleteness({ clientName: " ", parts: [], features: [] })).toEqual([
      { step: 1, message: "Choose the client" },
      { step: 2, message: "Choose at least one part" },
      { step: 4, message: "Add at least one feature" },
    ]);
  });

  it("flags a part without a technology and a feature without a part", () => {
    expect(
      checkCompleteness({
        ...complete,
        parts: [{ part: "MOBILE", technologyCount: 0 }],
        features: [{ name: "Photo capture", parts: [] }],
      }),
    ).toEqual([
      { step: 2, message: "Choose a technology for Mobile" },
      { step: 4, message: 'Choose a part for "Photo capture"' },
    ]);
  });
});
