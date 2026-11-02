import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ui } from "@/components/ui";
import { lastActiveLabel } from "@/lib/relative-time";
import { requireRole } from "@/server/auth/session";
import { getReferenceRequest } from "@/server/matching/matching";
import { ServiceError } from "@/server/service-error";
import { ReferenceForm } from "./reference-form";

export const metadata: Metadata = { title: "Reference hours · F3 Estimation Tool" };

// The Architect's answer to a request for reference hours (specs/feature-matching).
export default async function ReferencePage({ params }: PageProps<"/references/[id]">) {
  const { id } = await params;
  const user = await requireRole(`/references/${id}`);
  if (!user) return null;
  const ask = await getReferenceRequest(user, id).catch((err) => {
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  });
  const now = new Date();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/reviews" className="hover:underline">
            Reviews
          </Link>{" "}
          <span aria-hidden="true">/</span> Reference hours
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight break-words">
          Reference hours: {ask.featureName}
        </h1>
        <p className="mt-1.5 text-foreground-2">
          {ask.partLabel} · for {ask.projectName} · asked by {ask.askedByName}{" "}
          {lastActiveLabel(ask.createdAt, now).toLowerCase()} · to {ask.architectName}
        </p>
      </div>

      <section aria-labelledby="asked-title" className={`${ui.card} p-5 text-sm`}>
        <h2 id="asked-title" className="font-bold">
          What was asked
        </h2>
        <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-[140px_1fr]">
          <dt className="text-muted">Feature</dt>
          <dd>{ask.featureName}</dd>
          <dt className="text-muted">Description</dt>
          <dd>{ask.featureDescription || "–"}</dd>
          <dt className="text-muted">Part and stack</dt>
          <dd>{ask.partLabel}</dd>
          <dt className="text-muted">Note</dt>
          <dd>{ask.note || "–"}</dd>
        </dl>
        <p className="mt-3 text-muted">
          Your hours become a Draft benchmark in Feature hours, used for this feature and every
          similar one in later requests. The client isn&apos;t stored with them.
        </p>
      </section>

      {ask.status === "OPEN" && ask.canAnswer && (
        <ReferenceForm id={ask.id} featureName={ask.featureName} />
      )}
      {ask.status === "OPEN" && !ask.canAnswer && (
        <p role="status" className="rounded-lg bg-info-bg px-3.5 py-3 text-sm text-info">
          Waiting for {ask.architectName} to add reference hours.
        </p>
      )}
      {ask.status === "ANSWERED" && (
        <p role="status" className="rounded-lg bg-ok-bg px-3.5 py-3 text-sm text-ok">
          {ask.architectName} added reference hours. They&apos;re now a Draft benchmark used for
          matching.
        </p>
      )}
      {ask.status === "DECLINED" && (
        <p role="status" className="rounded-lg bg-warn-bg px-3.5 py-3 text-sm text-warn">
          {ask.architectName} declined: “{ask.declineReason}”
        </p>
      )}
    </div>
  );
}
