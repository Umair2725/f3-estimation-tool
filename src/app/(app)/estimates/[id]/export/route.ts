import { getCurrentUser } from "@/server/auth/session";
import { exportInternal } from "@/server/export/export";
import { ServiceError } from "@/server/service-error";
import { contentDisposition } from "@/lib/estimation/export-name";

// GET /estimates/:id/export - the internal Excel export (specs/excel-export). Read-only apart
// from the export record; the session cookie is SameSite=Lax and the role is checked.
export async function GET(_request: Request, ctx: RouteContext<"/estimates/[id]/export">) {
  const { id } = await ctx.params;
  try {
    const { buffer, fileName } = await exportInternal(await getCurrentUser(), id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition(fileName),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (!(err instanceof ServiceError)) throw err;
    return Response.json(
      { error: err.status === 401 ? "unauthorized" : "refused", message: err.message },
      { status: err.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
