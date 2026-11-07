"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { deliverQueuedSoftly } from "@/server/email/deliver";
import {
  askArchitect,
  decideSuggestion,
  findMatches,
  requestAiGuess,
} from "@/server/matching/matching";
import { ServiceError } from "@/server/service-error";

// Server actions for matching on the estimate page (specs/feature-matching). The service
// re-checks the caller.
export type ActionResult = { ok: boolean; message?: string };

async function run(work: () => Promise<unknown>, done: string): Promise<ActionResult> {
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

export async function findMatchesAction(requestId: string, taskId?: string) {
  return run(
    async () => findMatches(await getCurrentUser(), requestId, taskId),
    taskId ? "Matches found." : "Matches found for every Task.",
  );
}

export async function decideAction(
  requestId: string,
  taskId: string,
  decision: "ACCEPTED" | "ADJUSTED" | "REJECTED",
  reason?: string,
) {
  const done = {
    ACCEPTED: "Suggestion accepted.",
    ADJUSTED: "Suggestion accepted. Adjust the hours, then save.",
    REJECTED: "Suggestion rejected.",
  }[decision];
  return run(
    async () => decideSuggestion(await getCurrentUser(), requestId, taskId, { decision, reason }),
    done,
  );
}

export async function askArchitectAction(
  requestId: string,
  taskId: string,
  architectId: string,
  note: string,
) {
  return run(
    async () => askArchitect(await getCurrentUser(), requestId, taskId, { architectId, note }),
    "Architect asked.",
  );
}

export async function aiGuessAction(requestId: string, taskId: string, minutesPerRound: number) {
  return run(
    async () => requestAiGuess(await getCurrentUser(), requestId, taskId, minutesPerRound),
    "AI guess ready.",
  );
}
