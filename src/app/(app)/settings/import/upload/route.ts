import { getCurrentUser } from "@/server/auth/session";
import { createBatch } from "@/server/import/import";
import { ServiceError } from "@/server/service-error";

// POST /settings/import/upload - a zip, or one estimate with an optional actuals file
// (specs/historical-import). Goes to the batch on success, back with the message otherwise.
export async function POST(request: Request) {
  const back = (path: string) => Response.redirect(new URL(path, request.url), 303);
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return Response.json(
      { error: "refused", message: "Cross-site upload refused" },
      { status: 403 },
    );
  }
  try {
    const form = await request.formData();
    const file = (name: string) => {
      const value = form.get(name);
      return value instanceof File && value.size > 0 ? value : null;
    };
    const read = async (f: File) => ({
      fileName: f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
    });
    const zip = file("zip");
    const estimate = file("estimate");
    const actuals = file("actuals");
    const actor = await getCurrentUser();
    let batchId: string;
    if (zip) {
      ({ batchId } = await createBatch(actor, { kind: "zip", file: await read(zip) }));
    } else if (estimate) {
      ({ batchId } = await createBatch(actor, {
        kind: "single",
        estimate: await read(estimate),
        actuals: actuals ? await read(actuals) : null,
      }));
    } else {
      throw new ServiceError("Choose a .zip, or an estimate file", 400);
    }
    return back(`/settings/import/${batchId}`);
  } catch (err) {
    if (!(err instanceof ServiceError)) throw err;
    if (err.status === 401) return back("/sign-in?next=%2Fsettings%2Fimport");
    if (err.status === 403)
      return Response.json({ error: "refused", message: err.message }, { status: 403 });
    return back(`/settings/import?error=${encodeURIComponent(err.message)}`);
  }
}
