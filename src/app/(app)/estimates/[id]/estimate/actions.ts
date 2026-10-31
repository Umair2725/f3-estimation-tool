"use server";

import { getCurrentUser } from "@/server/auth/session";
import { saveEstimate } from "@/server/estimates";
import { ServiceError } from "@/server/service-error";

export type SaveEstimateResult =
  { ok: true; savedAt: string } | { ok: false; message: string; fields: Record<string, string> };

// The service checks the caller (owner or Admin, editable status) and validates the input.
export async function saveEstimateAction(id: string, input: unknown): Promise<SaveEstimateResult> {
  try {
    const { savedAt } = await saveEstimate(await getCurrentUser(), id, input);
    return { ok: true, savedAt: savedAt.toISOString() };
  } catch (err) {
    if (err instanceof ServiceError)
      return { ok: false, message: err.message, fields: err.fields ?? {} };
    throw err;
  }
}
