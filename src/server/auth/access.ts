// Turns "who is calling" into an allow / 401 / 403 decision. Kept free of Next.js and Better Auth
// imports so it can be unit-tested; session.ts wires it to the real request.
import { can, isRole, type Permission, type Role } from "./permissions";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  status: "ACTIVE" | "DEACTIVATED";
};

export type AccessResult =
  { ok: true; user: CurrentUser } | { ok: false; status: 401 | 403; message: string };

/** Maps Better Auth's session user (with our additional fields) to CurrentUser. */
export function toCurrentUser(
  user: Record<string, unknown> | null | undefined,
): CurrentUser | null {
  if (!user || typeof user.id !== "string") return null;
  return {
    id: user.id,
    name: typeof user.name === "string" ? user.name : "",
    email: typeof user.email === "string" ? user.email : "",
    role: isRole(user.role) ? user.role : null,
    status: user.status === "DEACTIVATED" ? "DEACTIVATED" : "ACTIVE",
  };
}

/**
 * Signed out → 401. Signed in but without a role, deactivated, or lacking the permission → 403.
 * With no permission given, any person with a role passes.
 */
export function checkAccess(user: CurrentUser | null, permission?: Permission): AccessResult {
  if (!user) return { ok: false, status: 401, message: "Sign in required" };
  if (user.status !== "ACTIVE") return { ok: false, status: 401, message: "Sign in required" };
  if (!user.role)
    return { ok: false, status: 403, message: "Waiting for an Admin to assign a role" };
  if (permission && !can(user.role, permission)) {
    return { ok: false, status: 403, message: "You don't have permission to do this" };
  }
  return { ok: true, user };
}

/** JSON error response for API routes. Contains no data beyond the message. */
export function accessErrorResponse(result: Extract<AccessResult, { ok: false }>): Response {
  return Response.json(
    { error: result.status === 401 ? "unauthorized" : "forbidden", message: result.message },
    { status: result.status, headers: { "Cache-Control": "no-store" } },
  );
}
