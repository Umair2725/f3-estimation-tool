"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import {
  deactivate,
  invite,
  PeopleError,
  reactivate,
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

export async function setRoleAction(userId: string, role: string) {
  return run(async () => {
    await setRole(await getCurrentUser(), userId, role);
  });
}

export async function inviteAction(email: string, role: string) {
  return run(async () => {
    const outcome = await invite(await getCurrentUser(), email, role);
    return outcome === "updated"
      ? "This person has already signed in, so their role was changed."
      : "Invitation saved. The role applies when they first sign in.";
  });
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
