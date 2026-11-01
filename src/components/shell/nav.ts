import { can, type Role } from "@/server/auth/permissions";

/** `match` is the path prefix that marks the entry as current (defaults to `href`). */
export type NavItem = {
  label: string;
  href?: string;
  match?: string;
  soon?: boolean;
  /** Shown next to the label, e.g. requests waiting for review. */
  count?: number;
};
export type NavGroup = { label?: string; items: NavItem[] };

/**
 * Navigation from the approved design (docs/design), filtered by role (specs/app-shell).
 * Entries for screens not built yet are shown as "Soon" without a link.
 */
export function navFor(role: Role | null, counts: { reviews?: number } = {}): NavGroup[] {
  const work: NavItem[] = [
    { label: "Home", href: "/" },
    { label: "Estimates", href: "/#requests", match: "/estimates" },
  ];
  // specs/estimate-review "Reviews page": Tech Leads and Architects only.
  if (can(role, "estimate.approve")) {
    work.push({ label: "Reviews", href: "/reviews", count: counts.reviews ?? 0 });
  }

  const groups: NavGroup[] = [
    { items: work },
    {
      label: "Knowledge base",
      items: [
        { label: "Feature hours", soon: true },
        // Admins only (specs/historical-import); hidden from everyone else.
        ...(can(role, "settings.manage")
          ? [{ label: "Import past projects", href: "/settings/import", match: "/settings/import" }]
          : []),
        { label: "Actual hours", soon: true },
      ],
    },
  ];
  if (can(role, "settings.manage")) {
    groups.push({
      label: "Admin",
      items: [{ label: "Settings", href: "/settings/people", match: "/settings" }],
    });
  }
  return groups;
}
