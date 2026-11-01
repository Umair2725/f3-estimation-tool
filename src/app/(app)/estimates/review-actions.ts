"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import {
  addComment,
  approve,
  reopen,
  requestChanges,
  submitForReview,
  withdraw,
} from "@/server/review";
import { ServiceError } from "@/server/service-error";

// Server actions for review and approval (specs/estimate-review). The service re-checks the caller.
export type ActionResult = { ok: boolean; message?: string };

async function run(work: () => Promise<unknown>, done: string): Promise<ActionResult> {
  try {
    await work();
    refresh();
    return { ok: true, message: done };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function submitForReviewAction(id: string, reviewerId: string) {
  return run(
    async () => submitForReview(await getCurrentUser(), id, { reviewerId }),
    "Submitted for review.",
  );
}

export async function withdrawAction(id: string) {
  return run(async () => withdraw(await getCurrentUser(), id), "Withdrawn. It's a Draft again.");
}

export async function requestChangesAction(id: string, comment: string) {
  return run(
    async () => requestChanges(await getCurrentUser(), id, { comment }),
    "Changes requested.",
  );
}

export async function approveAction(id: string) {
  return run(async () => approve(await getCurrentUser(), id), "Approved.");
}

export async function reopenAction(id: string) {
  return run(async () => reopen(await getCurrentUser(), id), "Editing as a new version.");
}

export async function commentAction(
  id: string,
  input: { body: string; taskId?: string; subTaskId?: string },
) {
  return run(async () => addComment(await getCurrentUser(), id, input), "Comment posted.");
}
