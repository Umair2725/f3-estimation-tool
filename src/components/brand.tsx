import Image from "next/image";
import Link from "next/link";

/**
 * The official Folio3 logo, plus the product name. The PNG has a white background, so it sits on a
 * white tile that stays white in dark mode. `unoptimized` serves the file exactly as supplied.
 */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-foreground no-underline">
      <span className="inline-flex rounded-md bg-white px-1 py-0.5">
        <Image
          src="/folio3-logo.png"
          alt=""
          width={135}
          height={65}
          unoptimized
          loading="eager"
          className="h-7 w-auto"
        />
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
