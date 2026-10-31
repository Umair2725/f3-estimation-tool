// Which paths need a session (specs/authentication). Pure, so the proxy's rules are unit-tested.

export type RouteKind = "public" | "api" | "page";

const PUBLIC_EXACT = new Set(["/sign-in", "/api/health", "/robots.txt", "/favicon.ico"]);
const PUBLIC_PREFIXES = ["/api/auth/", "/_next/"];

export function classifyPath(pathname: string): RouteKind {
  if (PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return "public";
  }
  return pathname === "/api" || pathname.startsWith("/api/") ? "api" : "page";
}

/** The sign-in URL that brings the visitor back to where they were going. */
export function signInRedirectPath(pathname: string, search: string): string {
  const next = `${pathname}${search}`;
  return next === "/" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`;
}
