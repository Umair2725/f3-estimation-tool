import "server-only";
import { headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { logger } from "@/lib/logger";
import { checkAccess, toCurrentUser, type AccessResult, type CurrentUser } from "./access";
import { touchLastActive } from "./activity";
import { getAuth } from "./auth";
import type { Permission } from "./permissions";
import { safeNextPath } from "./policy";

/** The signed-in person for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Read the request first: this marks the page as per-request (never prerendered at build,
  // where the sign-in settings don't exist) before the auth instance is created.
  const requestHeaders = await headers();
  await connection(); // sessions read the clock; never part of a prerender
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  const user = toCurrentUser(session?.user as Record<string, unknown> | undefined);
  if (user) {
    touchLastActive(user.id).catch((err) => logger.warn("lastActiveAt update failed", { err }));
  }
  return user;
});

/** For pages: sends signed-out visitors to sign-in, then back to `nextPath`. */
export async function requireUser(nextPath = "/"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") {
    redirect(`/sign-in?next=${encodeURIComponent(safeNextPath(nextPath))}`);
  }
  return user;
}

/** For API routes and server actions: 401 / 403 / ok, checked on the server. */
export async function authorize(permission?: Permission): Promise<AccessResult> {
  return checkAccess(await getCurrentUser(), permission);
}

/**
 * For pages inside the signed-in layout: the person with their role, or null when they have
 * none. Next.js renders a page alongside its layout, so a page must not load data for someone
 * the layout is about to show the waiting page to; it renders nothing instead.
 */
export async function requireRole(
  nextPath = "/",
): Promise<(CurrentUser & { role: NonNullable<CurrentUser["role"]> }) | null> {
  const user = await requireUser(nextPath);
  return user.role ? { ...user, role: user.role } : null;
}
