import Link from "next/link";

/**
 * Folio3 text wordmark with the three brand dots, plus the product name. A text wordmark is used
 * until the official logo file is approved for the repository (docs/design open question 1).
 */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-foreground no-underline">
      <span className="relative inline-flex items-baseline pr-3" aria-hidden="true">
        <span className="text-[22px] leading-none font-bold tracking-tight text-brand">folio3</span>
        <span className="absolute -top-1 right-0 flex gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-yellow" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#2f6fed]" />
        </span>
      </span>
      <span className="sr-only">Folio3</span>
      <span className="max-w-[92px] border-l border-border-strong pl-2.5 text-xs leading-tight font-semibold text-muted">
        F3 Estimation Tool
      </span>
    </Link>
  );
}

/** Header for pages outside the signed-in app shell (sign-in, waiting, not found, errors). */
export function PublicHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Brand />
        {children}
      </div>
    </header>
  );
}
