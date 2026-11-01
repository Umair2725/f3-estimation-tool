import { getVersionFile } from "@/server/actuals";
import { getCurrentUser } from "@/server/auth/session";
import { ServiceError } from "@/server/service-error";
import { contentDisposition } from "@/lib/estimation/export-name";

// GET /estimates/:id/actuals/versions/:versionId/file - the original uploaded actuals file.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/estimates/[id]/actuals/versions/[versionId]/file">,
) {
  const { id, versionId } = await ctx.params;
  try {
    const { fileName, bytes } = await getVersionFile(await getCurrentUser(), id, versionId);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition(fileName),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (!(err instanceof ServiceError)) throw err;
    return Response.json({ error: "refused", message: err.message }, { status: err.status });
  }
}
