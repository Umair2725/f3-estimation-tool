import { describe, expect, it } from "vitest";
import { can, isRole, PERMISSIONS, ROLES, type Permission, type Role } from "./permissions";

// The full role × permission matrix from specs/user-roles.
const expected: Record<Role, Record<Permission, boolean>> = {
  ESTIMATOR: {
    "estimate.edit": true,
    "estimate.approve": false,
    "estimate.edit-any": false,
    "people.manage": false,
    "settings.manage": false,
  },
  TECH_LEAD: {
    "estimate.edit": true,
    "estimate.approve": true,
    "estimate.edit-any": false,
    "people.manage": false,
    "settings.manage": false,
  },
  ARCHITECT: {
    "estimate.edit": true,
    "estimate.approve": true,
    "estimate.edit-any": false,
    "people.manage": false,
    "settings.manage": false,
  },
  ADMIN: {
    "estimate.edit": true,
    "estimate.approve": false,
    "estimate.edit-any": true,
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
