import "server-only";
import { getDb } from "@/server/db";

export const ACTIVITY_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Records that a person was active, at most once per 15 minutes. A single conditional update, so
 * concurrent requests can't write twice and fresh timestamps cost no write at all.
 */
export async function touchLastActive(userId: string, now = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - ACTIVITY_INTERVAL_MS);
  const result = await getDb().user.updateMany({
    where: { id: userId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: cutoff } }] },
    data: { lastActiveAt: now },
  });
  return result.count > 0;
}
