"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/people", label: "People and roles" },
  { href: "/settings/tech-stack", label: "Tech stack" },
  { href: "/settings/estimate-defaults", label: "Estimate defaults" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={pathname.startsWith(tab.href) ? "page" : undefined}
          className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-muted hover:text-foreground aria-[current=page]:border-brand-strong aria-[current=page]:text-foreground"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
