// Who may do what (specs/user-roles). The single source of truth for role rules: server
// checks and navigation both ask `can()`, never a role name directly.

export const ROLES = ["ESTIMATOR", "TECH_LEAD", "ARCHITECT", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ESTIMATOR: "Estimator",
  TECH_LEAD: "Tech Lead",
  ARCHITECT: "Architect",
  ADMIN: "Admin",
};

const ALL: readonly Role[] = ROLES;

const RULES = {
  "estimate.edit": ALL,
  "estimate.approve": ["TECH_LEAD", "ARCHITECT"],
  // Edit or delete someone else's request (specs/estimation-requests).
  "estimate.edit-any": ["ADMIN"],
  "people.manage": ["ADMIN"],
  "settings.manage": ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof RULES;
export const PERMISSIONS = Object.keys(RULES) as Permission[];

/** True when `role` grants `permission`. People without a role can do nothing. */
export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (RULES[permission] as readonly Role[]).includes(role);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
