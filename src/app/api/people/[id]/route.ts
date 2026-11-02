import { after } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { deliverQueuedSoftly } from "@/server/email/deliver";
import { deactivate, reactivate, setRole } from "@/server/people";
import { peopleErrorResponse } from "../errors";

// PATCH /api/people/:id with { role } or { status: "ACTIVE" | "DEACTIVATED" } - Admin only.
export async function PATCH(request: Request, ctx: RouteContext<"/api/people/[id]">) {
  const { id } = await ctx.params;
  try {
    const actor = await getCurrentUser();
    const body = (await request.json().catch(() => ({}))) as { role?: unknown; status?: unknown };
    if (body.role !== undefined) {
      await setRole(actor, id, body.role);
      // A first role queues the access email (specs/email-notifications).
      after(deliverQueuedSoftly);
    }
    if (body.status === "DEACTIVATED") await deactivate(actor, id);
    else if (body.status === "ACTIVE") await reactivate(actor, id);
    else if (body.role === undefined) {
      // Still check permission first, so non-Admins always get 403 rather than a hint.
      await setRole(actor, id, undefined);
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    return peopleErrorResponse(err);
  }
}
