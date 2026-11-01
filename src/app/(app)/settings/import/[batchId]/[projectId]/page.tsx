import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/session";
import { getImportedProject } from "@/server/import/import";
import { ServiceError } from "@/server/service-error";
import { ImportPreviewEditor } from "./preview-editor";

export const metadata: Metadata = { title: "Check imported project · F3 Estimation Tool" };

export default async function ImportedProjectPage({
  params,
}: PageProps<"/settings/import/[batchId]/[projectId]">) {
  const { batchId, projectId } = await params;
  const user = await requireRole("/settings/import");
  if (!user) return null; // the layout shows the waiting page
  const project = await getImportedProject(user, projectId).catch((err) => {
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  });
  if (project.batchId !== batchId) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/settings/import" className="hover:underline">
            Import past projects
          </Link>{" "}
          <span aria-hidden="true">/</span>{" "}
          <Link href={`/settings/import/${batchId}`} className="hover:underline">
            Batch
          </Link>{" "}
          <span aria-hidden="true">/</span> {project.folder}
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight break-words">
          {project.preview?.projectName || project.folder}
        </h1>
        <p className="mt-1.5 text-foreground-2">
          Uploaded by {project.uploadedBy} · {project.estimateFile?.fileName ?? "no estimate"}
          {project.actualsFile ? ` + ${project.actualsFile.fileName}` : ""}
          {project.templateVersion ? ` · template v${project.templateVersion}` : ""}
        </p>
      </div>
      <ImportPreviewEditor project={project} />
    </div>
  );
}
