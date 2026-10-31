import { getCurrentUser } from "@/server/auth/session";
import { listPeople } from "@/server/people";
import { peopleErrorResponse } from "./errors";

// GET /api/people - Admin only (specs/user-roles). The settings page uses server actions;
// this API exists so the server-side check can be called and tested directly.
export async function GET() {
  try {
    const result = await listPeople(await getCurrentUser());
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return peopleErrorResponse(err);
  }
}
