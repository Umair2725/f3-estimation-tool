import "server-only";
import type { EmailKind, Prisma } from "@/generated/prisma/client";
import { renderEmail, type EmailContent } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";
import { isFolio3Email, normalizeEmail } from "@/server/auth/policy";
import { emailConfigured } from "./transport";

// Queues an email in the caller's transaction (specs/email-notifications "Emails are sent only
// after the action is saved"): a rolled-back action takes its email with it. Delivery happens
// after commit (./deliver.ts).

type Tx = Prisma.TransactionClient;

export type QueueInput = {
  to: string;
  content: EmailContent;
  userId?: string | null;
  requestId?: string | null;
};

/** Returns the email's id, or null when nothing may be sent to that address. */
export async function queueEmail(tx: Tx, input: QueueInput): Promise<string | null> {
  const to = normalizeEmail(input.to);
  if (!isFolio3Email(to)) return null;
  const rendered = renderEmail(input.content, getEnv().AUTH_URL);
  const row = await tx.emailMessage.create({
    data: {
      kind: input.content.kind as EmailKind,
      to,
      ...rendered,
      userId: input.userId ?? null,
      requestId: input.requestId ?? null,
      status: emailConfigured() ? "QUEUED" : "NOT_SENT",
    },
    select: { id: true },
  });
  return row.id;
}

/** Queues an email to a person, unless they are deactivated. */
export async function queueEmailToUser(
  tx: Tx,
  userId: string,
  input: Omit<QueueInput, "to" | "userId">,
): Promise<string | null> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { email: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return queueEmail(tx, { ...input, to: user.email, userId });
}
