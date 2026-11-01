import "server-only";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getDb } from "@/server/db";
import { embedderFor } from "./embedder";
import { indexRequest } from "./knowledge";

// Keeps the knowledge index current after approvals and new actual hours (specs/feature-matching
// "Knowledge index"). A failure is logged and never undoes the change; the reindex script repairs.

export async function reindexRequestSoftly(requestId: string) {
  try {
    await indexRequest(getDb(), embedderFor(getEnv()), requestId);
  } catch (err) {
    logger.error("knowledge index update failed; run npm run reindex-knowledge", {
      requestId,
      err,
    });
  }
}
