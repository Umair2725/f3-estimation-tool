import { describe, expect, it } from "vitest";
import { contentDisposition, exportFileName } from "./export-name";

describe("exportFileName", () => {
  it("follows the spec format", () => {
    expect(exportFileName("Patient portal MVP", "2026-10-31")).toBe(
      "Patient portal MVP – Estimate (internal) – 2026-10-31.xlsx",
    );
  });
  it("removes characters not allowed in file names", () => {
    expect(exportFileName('Phase 2: "Web/Mobile" <beta>?', "2026-10-31")).toBe(
      "Phase 2 Web Mobile beta – Estimate (internal) – 2026-10-31.xlsx",
    );
    expect(exportFileName("///", "2026-10-31")).toBe(
      "Estimate – Estimate (internal) – 2026-10-31.xlsx",
    );
  });
});

describe("contentDisposition", () => {
  it("has an ASCII fallback and the UTF-8 name", () => {
    expect(contentDisposition("Portal – Estimate.xlsx")).toBe(
      "attachment; filename=\"Portal - Estimate.xlsx\"; filename*=UTF-8''Portal%20%E2%80%93%20Estimate.xlsx",
    );
  });
});
