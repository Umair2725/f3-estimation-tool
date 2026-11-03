import { describe, expect, it } from "vitest";
import { classifyPath, signInRedirectPath } from "./route-rules";

describe("classifyPath", () => {
  it("keeps sign-in, auth callbacks, health and static files public", () => {
    for (const path of [
      "/sign-in",
      "/api/auth/callback/google",
      "/api/auth/sign-in/email",
      "/api/health",
      "/robots.txt",
      "/favicon.ico",
      "/folio3-logo.png",
      "/_next/static/chunks/app.js",
    ]) {
      expect(classifyPath(path)).toBe("public");
    }
  });

  it("protects everything else: pages and APIs", () => {
    expect(classifyPath("/")).toBe("page");
    expect(classifyPath("/settings/people")).toBe("page");
    expect(classifyPath("/sign-in-other")).toBe("page");
    expect(classifyPath("/api/people")).toBe("api");
    expect(classifyPath("/api/healthz")).toBe("api");
    expect(classifyPath("/api/authx")).toBe("api");
  });
});

describe("signInRedirectPath", () => {
  it("adds the original path (with query) as next", () => {
    expect(signInRedirectPath("/settings/people", "")).toBe("/sign-in?next=%2Fsettings%2Fpeople");
    expect(signInRedirectPath("/estimates", "?status=draft")).toBe(
      "/sign-in?next=%2Festimates%3Fstatus%3Ddraft",
    );
    expect(signInRedirectPath("/", "")).toBe("/sign-in");
  });
});
