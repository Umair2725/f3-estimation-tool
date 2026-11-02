"use server";

import { refresh } from "next/cache";
import {
  discardUpload,
  saveManualVersion,
  saveUploadVersion,
  type ManualInput,
} from "@/server/actuals";
import { getCurrentUser } from "@/server/auth/session";
import { ServiceError } from "@/server/service-error";
import type { MatchDecisions } from "@/lib/actuals/match";
import type { TeamLevel } from "@/server/actuals";

export type ActualsResult = { ok: true; versionNumber?: number } | { ok: false; message: string };

async function run(change: () => Promise<{ number: number } | void>): Promise<ActualsResult> {
  try {
    const version = await change();
    refresh();
    return { ok: true, versionNumber: version?.number };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}

// The service checks the caller, the outcome and the Delivered lock (specs/actual-hours).
export async function saveManualAction(id: string, input: ManualInput) {
  return run(async () => saveManualVersion(await getCurrentUser(), id, input));
}

export async function saveUploadAction(
  id: string,
  uploadId: string,
  decisions: MatchDecisions,
  teamLevel?: TeamLevel | null,
) {
  return run(async () =>
    saveUploadVersion(await getCurrentUser(), id, uploadId, decisions, teamLevel),
  );
}

export async function discardUploadAction(id: string, uploadId: string) {
  return run(async () => discardUpload(await getCurrentUser(), id, uploadId));
}
