import "server-only";
import type { CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { assertAccess, ServiceError } from "@/server/service-error";
import { deliverOne } from "./deliver";
import { queueEmail } from "./queue";
import { emailConfigured } from "./transport";

// The Email page for Admins (specs/email-notifications "Email page for Admins").

export const NOT_SET_UP_MESSAGE = "Email isn't set up";

export async function listEmails(actor: CurrentUser | null) {
  assertAccess(actor, "settings.manage");
  return getDb().emailMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      kind: true,
      to: true,
      subject: true,
      status: true,
      attempts: true,
      lastError: true,
      sentAt: true,
      createdAt: true,
    },
  });
}

/** Sends a test to the Admin. Returns whether it went out. */
export async function sendTestEmail(actor: CurrentUser | null): Promise<boolean> {
  assertAccess(actor, "settings.manage");
  if (!emailConfigured()) throw new ServiceError(NOT_SET_UP_MESSAGE, 409);
  const id = await getDb().$transaction((tx) =>
    queueEmail(tx, {
      to: actor.email,
      userId: actor.id,
      content: { kind: "TEST", adminName: actor.name },
    }),
  );
  return deliverOne(id);
}

/** Gives a failed email a fresh set of attempts and sends it now. */
export async function retryEmail(actor: CurrentUser | null, id: string): Promise<boolean> {
  assertAccess(actor, "settings.manage");
  if (!emailConfigured()) throw new ServiceError(NOT_SET_UP_MESSAGE, 409);
  const reset = await getDb().emailMessage.updateMany({
    where: { id, status: "FAILED" },
    data: { status: "QUEUED", attempts: 0 },
  });
  if (reset.count === 0) throw new ServiceError("Only failed emails can be retried", 409);
  return deliverOne(id);
}
