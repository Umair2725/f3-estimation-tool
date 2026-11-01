import { describe, expect, it } from "vitest";
import { navFor } from "./nav";

const labels = (role: Parameters<typeof navFor>[0]) =>
  navFor(role).flatMap((group) => group.items.map((item) => item.label));

describe("navFor (specs/app-shell: role-aware navigation)", () => {
  it("Estimator sees no Settings or Reviews", () => {
    expect(labels("ESTIMATOR")).not.toContain("Settings");
    expect(labels("ESTIMATOR")).not.toContain("Reviews");
    expect(labels("ESTIMATOR")).toContain("Home");
  });

  it("Tech Lead and Architect see Reviews but not Settings", () => {
    for (const role of ["TECH_LEAD", "ARCHITECT"] as const) {
      expect(labels(role)).toContain("Reviews");
      expect(labels(role)).not.toContain("Settings");
    }
  });

  it("Admin sees Settings linking to people and roles", () => {
    const settings = navFor("ADMIN")
      .flatMap((g) => g.items)
      .find((i) => i.label === "Settings");
    expect(settings?.href).toBe("/settings/people");
  });
});

describe("navFor links (specs/estimation-requests)", () => {
  it("Estimates links to the request list and is current on request pages", () => {
    const estimates = navFor("ESTIMATOR")
      .flatMap((g) => g.items)
      .find((i) => i.label === "Estimates");
    expect(estimates).toMatchObject({ href: "/#requests", match: "/estimates" });
    expect(estimates?.soon).toBeUndefined();
  });
});

describe("import entry (specs/historical-import)", () => {
  const item = (role: Parameters<typeof navFor>[0]) =>
    navFor(role)
      .flatMap((g) => g.items)
      .find((i) => i.label === "Import past projects");
  it("links Admins to the import and hides it from everyone else", () => {
    expect(item("ADMIN")).toMatchObject({ href: "/settings/import" });
    expect(item("ESTIMATOR")).toBeUndefined();
    expect(item("ARCHITECT")).toBeUndefined();
  });
});

describe("Reviews entry (specs/estimate-review)", () => {
  const item = (role: Parameters<typeof navFor>[0], reviews?: number) =>
    navFor(role, { reviews })
      .flatMap((g) => g.items)
      .find((i) => i.label === "Reviews");
  it("links Tech Leads and Architects to /reviews with the waiting count", () => {
    expect(item("TECH_LEAD", 2)).toEqual({ label: "Reviews", href: "/reviews", count: 2 });
    expect(item("ARCHITECT")).toMatchObject({ href: "/reviews", count: 0 });
    expect(item("ESTIMATOR", 3)).toBeUndefined();
    expect(item("ADMIN", 3)).toBeUndefined();
  });
});
