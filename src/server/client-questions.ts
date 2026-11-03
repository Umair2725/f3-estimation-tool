import "server-only";
import type { CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { canEditRequest, loadForEdit } from "@/server/estimation-requests";
import { assertAccess, ServiceError } from "@/server/service-error";

// Questions for the client on a request (specs/client-questions). Everyone with a role sees them;
// people who may edit the request change them.

export const QUESTION_REQUIRED = "Write the question";
const MAX_QUESTION = 1000;

export type QuestionSource = {
  documentId: string;
  fileName: string;
  page: number | null;
  section: string | null;
  quote: string;
};

export type ClientQuestionRow = { id: string; text: string; source: QuestionSource | null };

function cleanText(text: unknown): string {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) throw new ServiceError(QUESTION_REQUIRED, 400);
  if (value.length > MAX_QUESTION) {
    throw new ServiceError(`Keep the question under ${MAX_QUESTION} characters`, 400);
  }
  return value;
}

export async function listClientQuestions(
  actor: CurrentUser | null,
  requestId: string,
): Promise<{ questions: ClientQuestionRow[]; canEdit: boolean }> {
  assertAccess(actor);
  const db = getDb();
  const request = await db.estimationRequest.findUnique({
    where: { id: requestId },
    select: { ownerId: true, status: true },
  });
  if (!request) throw new ServiceError("Request not found", 404);
  const rows = await db.clientQuestion.findMany({
    where: { requestId },
    orderBy: { position: "asc" },
    select: { id: true, text: true, source: true },
  });
  return {
    questions: rows.map((q) => ({
      id: q.id,
      text: q.text,
      source: (q.source as QuestionSource | null) ?? null,
    })),
    canEdit: canEditRequest(actor, request),
  };
}

export async function addClientQuestion(
  actor: CurrentUser | null,
  requestId: string,
  text: unknown,
) {
  assertAccess(actor, "estimate.edit");
  const value = cleanText(text);
  return getDb().$transaction(async (tx) => {
    await loadForEdit(tx, actor, requestId);
    const last = await tx.clientQuestion.aggregate({
      where: { requestId },
      _max: { position: true },
    });
    return tx.clientQuestion.create({
      data: {
        requestId,
        text: value,
        position: (last._max.position ?? -1) + 1,
        createdById: actor.id,
      },
      select: { id: true },
    });
  });
}

async function loadQuestion(actor: CurrentUser, id: string) {
  const db = getDb();
  const question = await db.clientQuestion.findUnique({
    where: { id },
    select: { requestId: true },
  });
  if (!question) throw new ServiceError("Question not found", 404);
  return question;
}

export async function editClientQuestion(actor: CurrentUser | null, id: string, text: unknown) {
  assertAccess(actor, "estimate.edit");
  const value = cleanText(text);
  const { requestId } = await loadQuestion(actor, id);
  await getDb().$transaction(async (tx) => {
    await loadForEdit(tx, actor, requestId);
    await tx.clientQuestion.update({ where: { id }, data: { text: value } });
  });
}

export async function removeClientQuestion(actor: CurrentUser | null, id: string) {
  assertAccess(actor, "estimate.edit");
  const { requestId } = await loadQuestion(actor, id);
  await getDb().$transaction(async (tx) => {
    await loadForEdit(tx, actor, requestId);
    await tx.clientQuestion.delete({ where: { id } });
  });
}
