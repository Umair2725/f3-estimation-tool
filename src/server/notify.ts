import "server-only";
import type { Prisma } from "@/generated/prisma/client";

// In-app notifications (specs/estimate-review, specs/feature-matching). The one place a
// notification is created, so email can be added here later.

export type NotificationKind =
  | "SUBMITTED"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "REFERENCE_REQUESTED"
  | "REFERENCE_ADDED"
  | "REFERENCE_DECLINED";

export async function notify(
  tx: Prisma.TransactionClient,
  input: { userId: string; requestId: string; kind: NotificationKind; actorId: string },
) {
  if (input.userId === input.actorId) return;
  await tx.notification.create({ data: input });
}
