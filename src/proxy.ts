import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { classifyPath, signInRedirectPath } from "@/server/auth/route-rules";

// Runs before every request (except static files, see `config`). Two jobs:
//
// 1. Fast, optimistic sign-in gate (specs/authentication): requests without a session cookie go
//    to sign-in (pages) or get 401 (APIs). This only checks that a cookie exists; the
//    authoritative check is on the server (requireUser / authorize), because cookies can be
//    stale or forged.
// 2. Test-only routes (used by the end-to-end tests) exist only when ENABLE_TEST_ROUTES=1.
//    Otherwise they are rewritten to a path that does not exist, *before* rendering starts, so
//    the response is a real 404 with the normal "Page not found" page (app-shell spec).
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/test-error" && process.env.ENABLE_TEST_ROUTES !== "1") {
    return NextResponse.rewrite(new URL("/__not-found", request.url));
  }

  const kind = classifyPath(pathname);
  if (kind === "public" || getSessionCookie(request)) return NextResponse.next();

  if (kind === "api") {
    return NextResponse.json(
      { error: "unauthorized", message: "Sign in required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.redirect(new URL(signInRedirectPath(pathname, search), request.url));
}

export const config = {
  // Everything except Next.js static assets and image optimization.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
