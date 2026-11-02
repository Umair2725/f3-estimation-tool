import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { getDb } from "@/server/db";
import { getMailTransport, safeError } from "./transport";

// Sends queued emails after commit (specs/email-notifications "Failed emails are retried").
// Rows are claimed with SKIP LOCKED, so two requests delivering at once never send the same
// email twice. A failure is recorded on the row and never thrown at the action.

export const MAX_ATTEMPTS = 3;
const BATCH = 20;

type Claimed = { id: string; to: string; subject: string; text: string; html: string };

async function claim(onlyId?: string): Promise<Claimed[]> {
  const only = onlyId ? Prisma.sql`AND id = ${onlyId}` : Prisma.empty;
  return getDb().$queryRaw<Claimed[]>`
    UPDATE email_message SET status = 'SENDING', claimed_at = now()
    WHERE id IN (
      SELECT id FROM email_message
      WHERE (
        status = 'QUEUED'
        OR (status = 'FAILED' AND attempts < ${MAX_ATTEMPTS})
        OR (status = 'SENDING' AND claimed_at < now() - interval '10 minutes')
      ) ${only}
      ORDER BY created_at
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "to", subject, text, html`;
}

/** Sends what it claimed; returns how many were sent and how many failed. */
async function send(rows: Claimed[]): Promise<{ sent: number; failed: number }> {
  const db = getDb();
  const transport = getMailTransport();
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    if (!transport) {
      await db.emailMessage.update({ where: { id: row.id }, data: { status: "NOT_SENT" } });
      continue;
    }
    try {
      await transport.send({ to: row.to, subject: row.subject, text: row.text, html: row.html });
      await db.emailMessage.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
      sent++;
    } catch (err) {
      const lastError = safeError(err);
      await db.emailMessage.update({
        where: { id: row.id },
        data: { status: "FAILED", attempts: { increment: 1 }, lastError },
      });
      logger.warn("email not sent", { emailId: row.id, error: lastError });
      failed++;
    }
  }
  return { sent, failed };
}

/** Sends every queued email and retries failed ones that have attempts left. */
export async function deliverQueued(): Promise<{ sent: number; failed: number }> {
  let total = { sent: 0, failed: 0 };
  for (;;) {
    const rows = await claim();
    if (rows.length === 0) return total;
    const result = await send(rows);
    total = { sent: total.sent + result.sent, failed: total.failed + result.failed };
    if (rows.length < BATCH) return total;
  }
}

/** For `after()`: never throws. */
export async function deliverQueuedSoftly() {
  try {
    await deliverQueued();
  } catch (err) {
    logger.error("email delivery failed", { error: safeError(err) });
  }
}

/** Sends one email now and says whether it went out. Never throws. */
export async function deliverOne(id: string | null): Promise<boolean> {
  if (!id) return false;
  try {
    const rows = await claim(id);
    if (rows.length === 0) return false;
    return (await send(rows)).sent === 1;
  } catch (err) {
    logger.error("email delivery failed", { emailId: id, error: safeError(err) });
    return false;
  }
}
