import { can, type Role } from "@/server/auth/permissions";

export type NavItem = { label: string; href?: string; soon?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

/**
 * Navigation from the approved design (docs/design), filtered by role (specs/app-shell).
 * Entries for screens not built yet are shown as "Soon" without a link.
 */
export function navFor(role: Role | null): NavGroup[] {
  const work: NavItem[] = [
    { label: "Home", href: "/" },
    { label: "Estimates", soon: true },
  ];
  if (can(role, "estimate.approve")) work.push({ label: "Reviews", soon: true });

  const groups: NavGroup[] = [
    { items: work },
    {
      label: "Knowledge base",
      items: [
        { label: "Feature hours", soon: true },
        { label: "Import past projects", soon: true },
        { label: "Actual hours", soon: true },
      ],
    },
  ];
  if (can(role, "settings.manage")) {
    groups.push({ label: "Admin", items: [{ label: "Settings", href: "/settings/people" }] });
  }
  return groups;
}
