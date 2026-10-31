"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import type { NavGroup } from "./nav";
import { SignOutButton } from "./sign-out-button";

type Person = { name: string; email: string; roleLabel: string };

/** Signed-in frame from the approved design: left sidebar + top bar (specs/app-shell). */
export function AppShell(props: { nav: NavGroup[]; person: Person; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const initials = props.person.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-full flex-1 md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <nav
        id="app-nav"
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col gap-4 overflow-y-auto border-r border-border bg-surface px-3.5 py-4 transition-transform md:sticky md:top-0 md:h-screen md:w-auto md:translate-x-0 ${
          open ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
      >
        <div className="px-2">
          <Brand />
        </div>
        {props.nav.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-0.5">
            {group.label && (
              <div className="px-2.5 pt-2 pb-1 text-[11px] font-bold tracking-wider text-muted uppercase">
                {group.label}
              </div>
            )}
            {group.items.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2.5 py-2 font-medium text-foreground-2 hover:bg-surface-2 hover:text-foreground aria-[current=page]:bg-brand/10 aria-[current=page]:font-semibold aria-[current=page]:text-brand-strong"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  aria-disabled="true"
                  className="flex items-center justify-between rounded-lg px-2.5 py-2 font-medium text-muted"
                >
                  {item.label}
                  <span className="rounded-full border border-border-strong px-2 text-[11px] font-semibold">
                    Soon
                  </span>
                </span>
              ),
            )}
          </div>
        ))}
      </nav>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/35 md:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-surface px-4 py-3 md:px-7">
          <button
            type="button"
            className="inline-grid h-9 w-9 place-items-center rounded-full border border-border md:hidden"
            aria-label="Open menu"
            aria-controls="app-nav"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span className="font-semibold">
            F3 Estimation Tool <span className="sr-only">· Folio3</span>
          </span>
          <span className="flex-1" />
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-8 w-8 place-items-center rounded-full bg-brand-yellow text-[13px] font-bold text-[#171819]"
              aria-hidden="true"
            >
              {initials || "?"}
            </span>
            <span className="hidden text-sm leading-tight sm:block">
              <span className="block font-semibold" data-testid="person-name">
                {props.person.name}
              </span>
              <span className="block text-muted" data-testid="person-role">
                {props.person.roleLabel}
              </span>
            </span>
            <span className="sr-only sm:hidden">
              {props.person.name}, {props.person.roleLabel}
            </span>
            <SignOutButton />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 md:px-7 md:py-7">
          {props.children}
        </main>
      </div>
    </div>
  );
}

function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
