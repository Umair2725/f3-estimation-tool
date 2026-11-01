import { getCurrentUser } from "@/server/auth/session";
import { getUploadedFile } from "@/server/import/import";
import { ServiceError } from "@/server/service-error";
import { contentDisposition } from "@/lib/estimation/export-name";

// GET /settings/import/files/:fileId - an imported file (Admins; anyone with a role once it
// belongs to a historical project).
export async function GET(_request: Request, ctx: RouteContext<"/settings/import/files/[fileId]">) {
  const { fileId } = await ctx.params;
  try {
    const { fileName, bytes } = await getUploadedFile(await getCurrentUser(), fileId);
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
