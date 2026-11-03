import { after } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { MAX_DOCUMENT_BYTES, TOO_LARGE, uploadDocument } from "@/server/documents/files";
import { readDocumentSoftly } from "@/server/documents/read";
import { ServiceError } from "@/server/service-error";

// POST /estimates/:id/documents - a requirement document from the Requirements step
// (specs/requirement-documents "Upload requirement documents"). Answers JSON; reading starts
// once the response is sent.
export async function POST(request: Request, ctx: RouteContext<"/estimates/[id]/documents">) {
  const { id } = await ctx.params;

  // Same-origin form posts only (route handlers don't get Next's server-action origin check).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return Response.json({ ok: false, message: "Cross-site upload refused" }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new ServiceError("Choose a PDF or Word (.docx) file", 400);
    }
    if (file.size > MAX_DOCUMENT_BYTES) throw new ServiceError(TOO_LARGE, 400);
    const doc = await uploadDocument(await getCurrentUser(), id, {
      fileName: file.name,
      kind: form.get("kind"),
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    if (doc.status === "READING") after(() => readDocumentSoftly(doc.id));
    return Response.json({
      ok: true,
      message:
        doc.status === "READING"
          ? `${file.name} uploaded. Reading it now…`
          : `${file.name} uploaded. AI reading isn't set up; add the features by hand.`,
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ ok: false, message: err.message }, { status: err.status });
    }
    throw err;
  }
}
