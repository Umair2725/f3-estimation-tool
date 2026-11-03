"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import {
  addClientQuestion,
  editClientQuestion,
  removeClientQuestion,
} from "@/server/client-questions";
import { applyDocument } from "@/server/documents/apply";
import { removeDocument } from "@/server/documents/files";
import { readDocumentSoftly, startReading } from "@/server/documents/read";
import { ServiceError } from "@/server/service-error";
import { addedMessage, estimateHrefAfterAdding } from "@/lib/documents/added-notice";

// Server actions for requirement documents and client questions (specs/requirement-documents,
// specs/client-questions). The services re-check the caller.
export type ActionResult = { ok: boolean; message?: string };

async function run(work: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const message = await work();
    refresh();
    return { ok: true, message: message || undefined };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function readAgainAction(documentId: string) {
  return run(async () => {
    const { reading } = await startReading(await getCurrentUser(), documentId);
    if (reading) after(() => readDocumentSoftly(documentId));
    return reading ? "Reading it again…" : "AI reading isn't set up";
  });
}

export async function removeDocumentAction(documentId: string) {
  return run(async () => {
    await removeDocument(await getCurrentUser(), documentId);
    return "Document removed.";
  });
}

/** On success, `href` is the Estimate tab with the "Added …" notice (specs/requirement-documents). */
export async function applyDocumentAction(
  requestId: string,
  documentId: string,
  selection: unknown,
): Promise<ActionResult & { href?: string }> {
  let href: string | undefined;
  const result = await run(async () => {
    const counts = await applyDocument(await getCurrentUser(), requestId, documentId, selection);
    href = estimateHrefAfterAdding(requestId, counts);
    return addedMessage(counts);
  });
  return { ...result, href };
}

export async function addQuestionAction(requestId: string, text: string) {
  return run(async () => {
    await addClientQuestion(await getCurrentUser(), requestId, text);
    return "Question added.";
  });
}

export async function editQuestionAction(id: string, text: string) {
  return run(async () => {
    await editClientQuestion(await getCurrentUser(), id, text);
    return "Question saved.";
  });
}

export async function removeQuestionAction(id: string) {
  return run(async () => {
    await removeClientQuestion(await getCurrentUser(), id);
    return "Question removed.";
  });
}
