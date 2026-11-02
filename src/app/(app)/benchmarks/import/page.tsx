import type { Metadata } from "next";
import Link from "next/link";
import { ui } from "@/components/ui";
import { can } from "@/server/auth/permissions";
import { requireRole } from "@/server/auth/session";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import feature hours · F3 Estimation Tool" };

// Admins import the seed list or the filled-in survey (specs/feature-benchmarks).
export default async function ImportBenchmarksPage() {
  const user = await requireRole("/benchmarks/import");
  if (!user) return null;
  if (!can(user.role, "settings.manage")) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <h1 className="text-2xl font-bold tracking-tight">
          You don&apos;t have access to this page
        </h1>
        <p className="mt-2 text-foreground-2">Only Admins import feature hours.</p>
      </div>
    );
  }
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/benchmarks" className="hover:underline">
            Feature hours
          </Link>{" "}
          <span aria-hidden="true">/</span> Import
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Import feature hours</h1>
        <p className="mt-1.5 text-foreground-2">
          Upload <code>data/feature-benchmarks.csv</code> or the filled-in{" "}
          <code>feature-hours-survey.xlsx</code>. Rows are matched by ID: new IDs are added,
          existing ones updated. You see a preview first; nothing is saved until you apply it.
        </p>
      </div>
      <section className={`${ui.card} p-5`}>
        <ImportForm />
      </section>
    </div>
  );
}
