import type { Metadata } from "next";
import Link from "next/link";
import { ui } from "@/components/ui";
import { previewUpload } from "@/server/actuals";
import { requireRole } from "@/server/auth/session";
import { ServiceError } from "@/server/service-error";
import { PreviewEditor } from "./preview-editor";

export const metadata: Metadata = { title: "Check uploaded actual hours · F3 Estimation Tool" };

export default async function ReviewUploadPage({
  params,
}: PageProps<"/estimates/[id]/actuals/review/[uploadId]">) {
  const { id, uploadId } = await params;
  const user = await requireRole(`/estimates/${id}/actuals`);
  if (!user) return null; // the layout shows the waiting page
  const preview = await previewUpload(user, id, uploadId).catch((err) => {
    if (err instanceof ServiceError) return err;
    throw err;
  });
  if (preview instanceof ServiceError) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Check uploaded actual hours</h1>
        <p role="alert" className="rounded-lg bg-err-bg px-3.5 py-3 text-sm text-err">
          {preview.message}
        </p>
        <Link href={`/estimates/${id}/actuals`} className={ui.secondaryButton}>
          Back to actual hours
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href={`/estimates/${id}/actuals`} className="hover:underline">
            Actual hours
          </Link>{" "}
          <span aria-hidden="true">/</span> Check upload
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight break-words">
          Check uploaded actual hours: {preview.fileName}
        </h1>
        <p className="mt-1.5 text-foreground-2">
          Nothing is saved until you click &ldquo;Save as a new version&rdquo;.
        </p>
      </div>
      <PreviewEditor requestId={id} uploadId={uploadId} preview={preview} />
    </div>
  );
}
