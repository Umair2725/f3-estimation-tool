"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { deliverQueuedSoftly } from "@/server/email/deliver";
import { answerReference, declineReference } from "@/server/matching/matching";
import { ServiceError } from "@/server/service-error";

// Server actions for an Architect's answer (specs/feature-matching). The service re-checks.
async function run(work: () => Promise<unknown>, done: string) {
  try {
    await work();
    // Emails queued by the change go out once the response is sent (specs/email-notifications).
    after(deliverQueuedSoftly);
    refresh();
    return { ok: true, message: done };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function answerReferenceAction(
  id: string,
  input: {
    title: string;
    description: string;
    subTasks: { title: string; min: string; max: string }[];
  },
) {
  return run(
    async () => answerReference(await getCurrentUser(), id, input),
    "Reference hours saved as a Draft benchmark. They're now used for matching.",
  );
}

export async function declineReferenceAction(id: string, reason: string) {
  return run(async () => declineReference(await getCurrentUser(), id, { reason }), "Declined.");
}
