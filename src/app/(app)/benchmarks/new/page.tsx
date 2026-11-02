import type { Metadata } from "next";
import Link from "next/link";
import { ui } from "@/components/ui";
import { can } from "@/server/auth/permissions";
import { requireRole } from "@/server/auth/session";
import { BenchmarkForm } from "../benchmark-form";

export const metadata: Metadata = { title: "New benchmark · F3 Estimation Tool" };

export default async function NewBenchmarkPage() {
  const user = await requireRole("/benchmarks/new");
  if (!user) return null;
  if (!can(user.role, "benchmark.edit")) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <h1 className="text-2xl font-bold tracking-tight">
          You don&apos;t have access to this page
        </h1>
        <p className="mt-2 text-foreground-2">Tech Leads, Architects and Admins add benchmarks.</p>
      </div>
    );
  }
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/benchmarks" className="hover:underline">
            Feature hours
          </Link>{" "}
          <span aria-hidden="true">/</span> New
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">New benchmark</h1>
        <p className="mt-1.5 text-foreground-2">
          It starts as a Draft. A Tech Lead or Architect confirms it once the hours are right.
        </p>
      </div>
      <section className={`${ui.card} p-5`}>
        <BenchmarkForm
          initial={{
            feature: "",
            module: "",
            part: "",
            stack: "Any",
            included: "",
            experienced: "",
            junior: "",
            aiTools: "",
            notes: "",
          }}
        />
      </section>
    </div>
  );
}
