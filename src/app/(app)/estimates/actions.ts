"use server";

import { getCurrentUser } from "@/server/auth/session";
import { createRequest, deleteRequest, getRequest, saveStep } from "@/server/estimation-requests";
import { setOutcome, type Outcome } from "@/server/outcome";
import { ServiceError } from "@/server/service-error";
import { refresh } from "next/cache";
import type { MissingItem } from "@/lib/estimation/completeness";
import type { Step } from "@/lib/estimation/options";

export type SaveResult =
  | {
      ok: true;
      id: string;
      savedAt: string;
      missing: MissingItem[];
      /** Step 4 only: the saved feature ids, in the order the form sent them. */
      featureIds?: string[];
    }
  | { ok: false; message: string; fields: Record<string, string> };

function refused(err: unknown): SaveResult {
  if (err instanceof ServiceError)
    return { ok: false, message: err.message, fields: err.fields ?? {} };
  throw err;
}

// Server actions for the wizard (specs/estimation-requests). The service re-checks the caller.
export async function createRequestAction(input: unknown): Promise<SaveResult> {
  try {
    const actor = await getCurrentUser();
    const { id, savedAt } = await createRequest(actor, input);
    return { ok: true, id, savedAt: savedAt.toISOString(), missing: [] };
  } catch (err) {
    return refused(err);
  }
}

export async function saveStepAction(id: string, step: Step, input: unknown): Promise<SaveResult> {
  try {
    const actor = await getCurrentUser();
    const { savedAt, featureIds } = await saveStep(actor, id, step, input);
    const { missing } = await getRequest(actor, id);
    return { ok: true, id, savedAt: savedAt.toISOString(), missing, featureIds };
  } catch (err) {
    return refused(err);
  }
}

export async function deleteRequestAction(id: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await deleteRequest(await getCurrentUser(), id);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function setOutcomeAction(
  id: string,
  outcome: Outcome,
  reason?: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    await setOutcome(await getCurrentUser(), id, { outcome, reason });
    refresh();
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}
