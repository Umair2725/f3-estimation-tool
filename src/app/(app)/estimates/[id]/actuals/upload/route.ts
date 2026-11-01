import { createPendingUpload, MAX_UPLOAD_BYTES } from "@/server/actuals";
import { getCurrentUser } from "@/server/auth/session";
import { ServiceError } from "@/server/service-error";

// POST /estimates/:id/actuals/upload - an actuals file from the form on the actual hours page
// (specs/actual-hours). On success, goes to the preview; on a problem, back with the message.
export async function POST(request: Request, ctx: RouteContext<"/estimates/[id]/actuals/upload">) {
  const { id } = await ctx.params;
  const back = (path: string) => Response.redirect(new URL(path, request.url), 303);

  // Same-origin form posts only (route handlers don't get Next's server-action origin check).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return Response.json(
      { error: "refused", message: "Cross-site upload refused" },
      { status: 403 },
    );
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0)
      throw new ServiceError("Choose an .xlsx file to upload", 400);
    if (file.size > MAX_UPLOAD_BYTES) throw new ServiceError("The file is larger than 10 MB", 400);
    const { uploadId } = await createPendingUpload(await getCurrentUser(), id, {
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return back(`/estimates/${id}/actuals/review/${uploadId}`);
  } catch (err) {
    if (!(err instanceof ServiceError)) throw err;
    if (err.status === 401)
      return back(`/sign-in?next=${encodeURIComponent(`/estimates/${id}/actuals`)}`);
    return back(`/estimates/${id}/actuals?error=${encodeURIComponent(err.message)}`);
  }
}
