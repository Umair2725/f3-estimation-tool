"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { retryEmail, sendTestEmail } from "@/server/email/admin";
import { ServiceError } from "@/server/service-error";

// Server actions for the Email page (specs/email-notifications). The service re-checks.
export type ActionResult = { ok: boolean; message: string };

const NOT_SENT = "The email couldn't be sent. See the reason in the list below.";

async function run(work: () => Promise<boolean>, done: string): Promise<ActionResult> {
  try {
    const sent = await work();
    refresh();
    return sent ? { ok: true, message: done } : { ok: false, message: NOT_SENT };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function sendTestEmailAction(): Promise<ActionResult> {
  const user = await getCurrentUser();
  return run(() => sendTestEmail(user), `Test email sent to ${user?.email ?? "you"}`);
}

export async function retryEmailAction(id: string): Promise<ActionResult> {
  return run(async () => retryEmail(await getCurrentUser(), id), "Sent.");
}
