import { describe, expect, it } from "vitest";
import { can, isRole, PERMISSIONS, ROLES, type Permission, type Role } from "./permissions";

// The full role × permission matrix from specs/user-roles.
const expected: Record<Role, Record<Permission, boolean>> = {
  ESTIMATOR: {
    "estimate.edit": true,
    "estimate.approve": false,
    "estimate.edit-any": false,
    "actuals.record": false,
    "outcome.set": false,
    "reference.provide": false,
    "benchmark.edit": false,
    "benchmark.confirm": false,
    "benchmark.decide": false,
    "benchmark.retire": false,
    "people.manage": false,
    "settings.manage": false,
  },
  TECH_LEAD: {
    "estimate.edit": true,
    "estimate.approve": true,
    "estimate.edit-any": false,
    "actuals.record": true,
    "outcome.set": true,
    "reference.provide": false,
    "benchmark.edit": true,
    "benchmark.confirm": true,
    "benchmark.decide": false,
    "benchmark.retire": false,
    "people.manage": false,
    "settings.manage": false,
  },
  ARCHITECT: {
    "estimate.edit": true,
    "estimate.approve": true,
    "estimate.edit-any": false,
    "actuals.record": true,
    "outcome.set": true,
    "reference.provide": true,
    "benchmark.edit": true,
    "benchmark.confirm": true,
    "benchmark.decide": true,
    "benchmark.retire": true,
    "people.manage": false,
    "settings.manage": false,
  },
  ADMIN: {
    "estimate.edit": true,
    "estimate.approve": false,
    "estimate.edit-any": true,
    "actuals.record": true,
    "outcome.set": true,
    "reference.provide": false,
    "benchmark.edit": true,
    "benchmark.confirm": false,
    "benchmark.decide": false,
    "benchmark.retire": true,
    "people.manage": true,
    "settings.manage": true,
  },
};

describe("can", () => {
  for (const role of ROLES) {
    for (const permission of PERMISSIONS) {
      it(`${role} ${expected[role][permission] ? "can" : "cannot"} ${permission}`, () => {
        expect(can(role, permission)).toBe(expected[role][permission]);
      });
    }
  }

  it("grants nothing to people without a role", () => {
    for (const permission of PERMISSIONS) {
      expect(can(null, permission)).toBe(false);
      expect(can(undefined, permission)).toBe(false);
    }
  });

  it("only Tech Lead and Architect can approve", () => {
    expect(ROLES.filter((role) => can(role, "estimate.approve"))).toEqual([
      "TECH_LEAD",
      "ARCHITECT",
    ]);
  });
});

describe("isRole", () => {
  it("accepts known roles only", () => {
    expect(isRole("ADMIN")).toBe(true);
    expect(isRole("admin")).toBe(false);
    expect(isRole("OWNER")).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});
