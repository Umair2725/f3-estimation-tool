"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { deliverOne, deliverQueuedSoftly } from "@/server/email/deliver";
import {
  deactivate,
  invite,
  PeopleError,
  reactivate,
  resendInvitation,
  revokeInvitation,
  setRole,
} from "@/server/people";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

// Each action re-checks the caller on the server through the people service (specs/user-roles).
async function run(change: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const message = await change();
    refresh();
    return { ok: true, message: message || undefined };
  } catch (err) {
    if (err instanceof PeopleError) return { ok: false, message: err.message };
    throw err;
  }
}

const INVITE_NOT_EMAILED =
  "Invitation saved. The email couldn't be sent, so share the sign-in link with them";

export async function setRoleAction(userId: string, role: string) {
  return run(async () => {
    await setRole(await getCurrentUser(), userId, role);
    // A first role queues the access email (specs/email-notifications).
    after(deliverQueuedSoftly);
  });
}

// The invitation email is sent before answering, so the Admin knows whether it went out.
export async function inviteAction(email: string, role: string) {
  return run(async () => {
    const { outcome, emailId } = await invite(await getCurrentUser(), email, role);
    if (outcome === "updated") {
      after(deliverQueuedSoftly);
      return "This person has already signed in, so their role was changed.";
    }
    return (await deliverOne(emailId))
      ? "Invitation saved and emailed. The role applies when they first sign in."
      : INVITE_NOT_EMAILED;
  });
}

export async function resendInvitationAction(email: string): Promise<ActionResult> {
  try {
    const sent = await deliverOne(await resendInvitation(await getCurrentUser(), email));
    refresh();
    return sent
      ? { ok: true, message: "Invitation email sent" }
      : { ok: false, message: "The email couldn't be sent. Check Settings → Email." };
  } catch (err) {
    if (err instanceof PeopleError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function revokeInvitationAction(email: string) {
  return run(async () => {
    await revokeInvitation(await getCurrentUser(), email);
  });
}

export async function deactivateAction(userId: string) {
  return run(async () => {
    await deactivate(await getCurrentUser(), userId);
  });
}

export async function reactivateAction(userId: string) {
  return run(async () => {
    await reactivate(await getCurrentUser(), userId);
  });
}
