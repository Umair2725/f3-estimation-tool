import { NextResponse, type NextRequest } from "next/server";

// Test-only routes (used by the end-to-end tests) exist only when ENABLE_TEST_ROUTES=1.
// Otherwise they are rewritten to a path that does not exist, *before* rendering starts,
// so the response is a real 404 with the normal "Page not found" page (app-shell spec).
export function proxy(request: NextRequest) {
  if (process.env.ENABLE_TEST_ROUTES === "1") return NextResponse.next();
  return NextResponse.rewrite(new URL("/__not-found", request.url));
}

export const config = {
  matcher: ["/test-error"],
};
