import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { UpdateKind } from "@/lib/notifications/texts";
import { queueEmailToUser } from "@/server/email/queue";

// In-app notifications (specs/estimate-review, specs/feature-matching), each also queued as an
// email in the same transaction (specs/email-notifications). The caller's Server Action
// delivers queued emails after the response.

export type NotificationKind = UpdateKind;

export async function notify(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    requestId: string;
    kind: NotificationKind;
    actorId: string;
    /** The changes comment or decline reason, for the email. */
    detail?: string | null;
  },
) {
  if (input.userId === input.actorId) return;
  const { detail, ...data } = input;
  await tx.notification.create({ data });
  const actor = await tx.user.findUnique({ where: { id: input.actorId }, select: { name: true } });
  const request = await tx.estimationRequest.findUnique({
    where: { id: input.requestId },
    select: { projectName: true },
  });
  await queueEmailToUser(tx, input.userId, {
    requestId: input.requestId,
    content: {
      kind: input.kind,
      actorName: actor?.name ?? "Someone",
      projectName: request?.projectName ?? "an estimation request",
      requestId: input.requestId,
      detail,
    },
  });
}
