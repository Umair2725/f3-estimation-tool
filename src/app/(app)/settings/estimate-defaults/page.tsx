import type { Metadata } from "next";
import { requireRole } from "@/server/auth/session";
import { getDefaults } from "@/server/estimate-defaults";
import { DefaultsForm } from "./defaults-form";

export const metadata: Metadata = { title: "Estimate defaults · F3 Estimation Tool" };

export default async function EstimateDefaultsPage() {
  const user = await requireRole("/settings/estimate-defaults");
  if (!user) return null; // the layout shows the waiting page
  const defaults = await getDefaults(user);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          Settings <span aria-hidden="true">/</span> Estimate defaults
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Estimate defaults</h1>
        <p className="mt-1.5 text-foreground-2">
          What every new estimation request starts from. Estimators can change them per request;
          changes here apply to new requests only.
        </p>
      </div>
      <DefaultsForm initial={defaults} />
    </div>
  );
}
