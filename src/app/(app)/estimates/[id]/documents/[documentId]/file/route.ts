import { getCurrentUser } from "@/server/auth/session";
import { getDocumentFile } from "@/server/documents/files";
import { ServiceError } from "@/server/service-error";

// GET /estimates/:id/documents/:documentId/file - the uploaded file, for anyone who can view the
// request (specs/requirement-documents). PDFs open inline so "#page=N" links land on the page.
export async function GET(
  request: Request,
  ctx: RouteContext<"/estimates/[id]/documents/[documentId]/file">,
) {
  const { documentId } = await ctx.params;
  try {
    const file = await getDocumentFile(await getCurrentUser(), documentId);
    const inline =
      file.contentType === "application/pdf" && !new URL(request.url).searchParams.has("download");
    const name = encodeURIComponent(file.fileName);
    return new Response(file.bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof ServiceError) return new Response(err.message, { status: err.status });
    throw err;
  }
}
