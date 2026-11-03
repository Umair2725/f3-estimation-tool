import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/session";
import { getDocumentReview } from "@/server/documents/apply";
import { ServiceError } from "@/server/service-error";
import { Refresher } from "./refresher";
import { ReviewShell } from "./review-editor";

export const metadata: Metadata = { title: "Review document · F3 Estimation Tool" };

// The review of one requirement document (specs/requirement-documents "Review before adding").
// Everyone who can view the request sees the proposals; only editors can add them.
export default async function DocumentReviewPage({
  params,
}: PageProps<"/estimates/[id]/documents/[documentId]">) {
  const { id, documentId } = await params;
  const user = await requireRole(`/estimates/${id}/documents/${documentId}`);
  if (!user) return null;
  const data = await getDocumentReview(user, id, documentId).catch((err) => {
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  });
  const { document: doc } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href={`/estimates/${id}`} className="underline">
            {data.projectName}
          </Link>{" "}
          <span aria-hidden="true">/</span> Requirement documents
        </nav>
        <h1 className="mt-1 break-all text-2xl font-bold tracking-tight">{doc.fileName}</h1>
        <p className="mt-1.5 max-w-3xl text-foreground-2">
          Claude&apos;s proposals from this document. Tick what to keep, edit anything, then add it
          to the request. Nothing changes until you click &ldquo;Add to request&rdquo;.
          {doc.addedAt &&
            ` Items were last added on ${doc.addedAt.toLocaleDateString("en-GB", { dateStyle: "medium" })}.`}
        </p>
      </div>

      {doc.status === "READING" && (
        <p role="status" className="rounded-lg bg-info-bg px-3.5 py-3 text-sm text-info">
          Reading the document… This page updates by itself.
          <Refresher />
        </p>
      )}
      {doc.status === "FAILED" && (
        <p role="alert" className="rounded-lg bg-err-bg px-3.5 py-3 text-sm text-err">
          Reading failed: {doc.error ?? "it didn't finish"}. Use &ldquo;Read again&rdquo; on the
          Requirements step.
        </p>
      )}
      {doc.status === "NOT_SET_UP" && (
        <p className="rounded-lg bg-info-bg px-3.5 py-3 text-sm text-info">
          AI reading isn&apos;t set up; add the features by hand.
        </p>
      )}

      {data.review && (
        <ReviewShell
          version={doc.addedAt?.toISOString() ?? "new"}
          doc={{ requestId: id, id: doc.id, fileName: doc.fileName, format: doc.format }}
          review={data.review}
          canEdit={data.canEdit}
        />
      )}
    </div>
  );
}
