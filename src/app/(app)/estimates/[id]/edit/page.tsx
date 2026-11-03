import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/server/auth/session";
import { listDocuments } from "@/server/documents/files";
import { getRequest } from "@/server/estimation-requests";
import { ServiceError } from "@/server/service-error";
import type { Step } from "@/lib/estimation/options";
import { wizardProps } from "../../wizard/load";
import { Wizard } from "../../wizard/wizard";
import { DocumentsPanel } from "../documents/documents-panel";

export const metadata: Metadata = { title: "Edit estimation request · F3 Estimation Tool" };

export default async function EditRequestPage({
  params,
  searchParams,
}: PageProps<"/estimates/[id]/edit">) {
  const { id } = await params;
  const { step: rawStep } = await searchParams;
  const user = await requireRole(`/estimates/${id}/edit`);
  if (!user) return null; // the layout shows the waiting page
  const request = await getRequest(user, id).catch((err) => {
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  });
  // People who may only view are shown the request page instead (the actions refuse anyway).
  if (!request.canEdit) redirect(`/estimates/${id}?notice=view-only`);

  const asked = Number(Array.isArray(rawStep) ? rawStep[0] : rawStep);
  const step = ([1, 2, 3, 4].includes(asked) ? asked : request.lastStep) as Step;
  const documents = await listDocuments(user, id);
  return (
    <Wizard
      key={id}
      {...await wizardProps(user, request, step)}
      documentsPanel={
        <DocumentsPanel
          requestId={id}
          canEdit
          documents={documents.map((d) => ({ ...d, addedAt: d.addedAt?.toISOString() ?? null }))}
        />
      }
    />
  );
}
