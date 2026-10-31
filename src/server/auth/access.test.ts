import { describe, expect, it } from "vitest";
import { accessErrorResponse, checkAccess, toCurrentUser, type CurrentUser } from "./access";

const person = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  id: "u1",
  name: "Sara",
  email: "sara.a@folio3.com",
  role: "ESTIMATOR",
  status: "ACTIVE",
  ...overrides,
});

describe("checkAccess", () => {
  it("401 when signed out or deactivated", () => {
    expect(checkAccess(null)).toMatchObject({ ok: false, status: 401 });
    expect(checkAccess(person({ status: "DEACTIVATED" }))).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("403 for people waiting for a role", () => {
    expect(checkAccess(person({ role: null }))).toMatchObject({ ok: false, status: 403 });
  });

  it("403 when the role lacks the permission", () => {
    expect(checkAccess(person({ role: "ESTIMATOR" }), "people.manage")).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(checkAccess(person({ role: "ADMIN" }), "estimate.approve")).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("allows people with the permission, or any role when none is required", () => {
    expect(checkAccess(person({ role: "ADMIN" }), "people.manage").ok).toBe(true);
    expect(checkAccess(person({ role: "ARCHITECT" }), "estimate.approve").ok).toBe(true);
    expect(checkAccess(person()).ok).toBe(true);
  });
});

describe("accessErrorResponse", () => {
  it("returns JSON with the status and no data", async () => {
    const res401 = accessErrorResponse({ ok: false, status: 401, message: "Sign in required" });
    expect(res401.status).toBe(401);
    expect(await res401.json()).toEqual({ error: "unauthorized", message: "Sign in required" });
    const res403 = accessErrorResponse({ ok: false, status: 403, message: "nope" });
    expect(res403.status).toBe(403);
    expect((await res403.json()).error).toBe("forbidden");
  });
});

describe("toCurrentUser", () => {
  it("maps known fields and ignores unknown roles", () => {
    expect(
      toCurrentUser({
        id: "u1",
        name: "Sara",
        email: "s@folio3.com",
        role: "ADMIN",
        status: "ACTIVE",
      }),
    ).toEqual({ id: "u1", name: "Sara", email: "s@folio3.com", role: "ADMIN", status: "ACTIVE" });
    expect(toCurrentUser({ id: "u2", role: "OWNER" })?.role).toBeNull();
    expect(toCurrentUser(null)).toBeNull();
  });
});
