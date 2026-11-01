import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/session";
import { getEstimate } from "@/server/estimates";
import { getReviewPanel, listComments } from "@/server/review";
import { ServiceError } from "@/server/service-error";
import { EstimateEditor } from "./estimate-editor";

export const metadata: Metadata = { title: "Estimate hours · F3 Estimation Tool" };

export default async function EstimatePage({ params }: PageProps<"/estimates/[id]/estimate">) {
  const { id } = await params;
  const user = await requireRole(`/estimates/${id}/estimate`);
  if (!user) return null; // the layout shows the waiting page
  const view = await getEstimate(user, id).catch((err) => {
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  });
  const [panel, comments] = await Promise.all([getReviewPanel(user, id), listComments(user, id)]);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/" className="hover:underline">
            Home
          </Link>{" "}
          <span aria-hidden="true">/</span>{" "}
          <Link href={`/estimates/${id}`} className="hover:underline">
            {view.request.projectName}
          </Link>{" "}
          <span aria-hidden="true">/</span> Estimate
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight break-words">
          {view.request.canEdit ? "Estimate hours" : "Hours"}: {view.request.projectName}
        </h1>
        <p className="mt-1.5 text-foreground-2">
          {view.request.clientName ?? "No client yet"} · Owner: {view.request.ownerName}
        </p>
        {!view.request.canEdit && (
          <p role="status" className="mt-3 rounded-lg bg-info-bg px-3.5 py-3 text-sm text-info">
            {panel.status === "IN_REVIEW" ||
            panel.status === "APPROVED" ||
            panel.status === "EXPORTED"
              ? "These hours are locked while the request is in review or approved."
              : "You can view these hours. Only the owner or an Admin can change them while the request is a draft."}
          </p>
        )}
      </div>
      <EstimateEditor
        key={id}
        view={view}
        review={{ requestId: id, comments, canComment: panel.can.comment }}
      />
    </div>
  );
}
