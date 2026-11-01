"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { approveProject, rejectProject, saveDecisions } from "@/server/import/import";
import { ServiceError } from "@/server/service-error";
import type { ImportDecisions } from "@/lib/import/preview";

export type ImportActionResult =
  { ok: true; requestId?: string | null } | { ok: false; message: string };

async function run(
  change: () => Promise<{ requestId?: string | null } | void>,
): Promise<ImportActionResult> {
  try {
    const result = await change();
    refresh();
    return { ok: true, requestId: result?.requestId };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}

// Admin only; the service checks (specs/historical-import).
export async function saveDecisionsAction(projectId: string, decisions: ImportDecisions) {
  return run(async () => saveDecisions(await getCurrentUser(), projectId, decisions));
}

export async function approveAction(projectId: string) {
  return run(async () => approveProject(await getCurrentUser(), projectId));
}

export async function rejectAction(projectId: string, status: "REJECTED" | "SKIPPED") {
  return run(async () => rejectProject(await getCurrentUser(), projectId, status));
}
