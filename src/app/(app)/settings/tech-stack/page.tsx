import type { Metadata } from "next";
import { requireRole } from "@/server/auth/session";
import { listTechnologies } from "@/server/tech-stack";
import { TechStackManager } from "./tech-stack-manager";

export const metadata: Metadata = { title: "Tech stack · F3 Estimation Tool" };

export default async function TechStackPage() {
  const user = await requireRole("/settings/tech-stack");
  if (!user) return null; // the layout shows the waiting page
  const technologies = await listTechnologies(user, { includeRetired: true });
  return (
    <div className="flex flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          Settings <span aria-hidden="true">/</span> Tech stack
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Tech stack</h1>
        <p className="mt-1.5 text-foreground-2">
          Technologies estimators pick for each part of a project. Retired ones are no longer
          offered, but requests that use them keep them.
        </p>
      </div>
      <TechStackManager technologies={technologies} />
    </div>
  );
}
