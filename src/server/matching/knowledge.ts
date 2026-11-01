// The knowledge index (specs/feature-matching "Knowledge index"): one entry per Task of each
// request's latest approved version, plus one per Architect reference, each with its embedding.
// No "server-only" import: the reindex script and the seed use it with their own Prisma client.
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import type { Part } from "../../lib/estimation/options";
import { entryText, type KnowledgeKind, type Match } from "../../lib/matching/suggest";
import { readSnapshot } from "../../lib/review/snapshot";
import { partLabel } from "../review/snapshot-source";
import { toVectorLiteral, type Embedder } from "./embedder";

type Db = PrismaClient | Prisma.TransactionClient;

type Entry = {
  kind: KnowledgeKind;
  requestId: string | null;
  version: number | null;
  referenceId: string | null;
  part: Part;
  partLabel: string;
  title: string;
  description?: string;
  subTasks: { title: string; minTenths: number; maxTenths: number; actualTenths?: number | null }[];
  projectName: string | null;
  clientName: string | null;
  authorName: string | null;
  sourceDate: Date;
};

const total = (subs: Entry["subTasks"], key: "minTenths" | "maxTenths") =>
  subs.reduce((n, s) => n + s[key], 0);

type Embedded = { entry: Entry; text: string; vector: number[]; model: string };

/** Embeds outside any transaction: it can take a moment and must not hold a connection. */
async function embedEntries(embedder: Embedder, entries: Entry[]): Promise<Embedded[]> {
  const texts = entries.map((e) =>
    entryText({
      partLabel: e.partLabel,
      title: e.title,
      description: e.description,
      subTaskTitles: e.subTasks.map((s) => s.title),
    }),
  );
  const vectors = await embedder.embed(texts);
  return entries.map((entry, i) => ({
    entry,
    text: texts[i],
    vector: vectors[i],
    model: embedder.name,
  }));
}

async function insert(db: Db, embedded: Embedded[]) {
  for (const { entry: e, text, vector, model } of embedded) {
    const actuals = e.subTasks.filter(
      (s) => s.actualTenths !== null && s.actualTenths !== undefined,
    );
    const actualTenths = actuals.length
      ? actuals.reduce((n, s) => n + (s.actualTenths ?? 0), 0)
      : null;
    await db.$executeRaw`
      INSERT INTO knowledge_item (id, kind, request_id, version, reference_id, part, part_label,
        title, sub_tasks, min_tenths, max_tenths, actual_tenths, project_name, client_name,
        author_name, source_date, text, model, embedding)
      VALUES (${randomUUID()}, ${e.kind}::"KnowledgeKind", ${e.requestId}, ${e.version},
        ${e.referenceId}, ${e.part}::"ProjectPart", ${e.partLabel}, ${e.title},
        ${JSON.stringify(e.subTasks)}::jsonb, ${total(e.subTasks, "minTenths")},
        ${total(e.subTasks, "maxTenths")}, ${actualTenths}, ${e.projectName}, ${e.clientName},
        ${e.authorName}, ${e.sourceDate}, ${text}, ${model}, ${toVectorLiteral(vector)}::vector)`;
  }
}

/**
 * Re-indexes one request from its latest approved version, with actual hours from its latest
 * actuals version. A request with no approved version ends up with no entries.
 */
export async function indexRequest(db: PrismaClient, embedder: Embedder, requestId: string) {
  const request = await db.estimationRequest.findUnique({
    where: { id: requestId },
    include: {
      client: { select: { name: true } },
      approved: { orderBy: { version: "desc" }, take: 1 },
      actuals: { orderBy: { number: "desc" }, take: 1, include: { rows: true } },
    },
  });
  const approved = request?.approved[0];
  const entries: Entry[] = [];
  if (request && approved) {
    const snapshot = readSnapshot(approved.snapshot);
    const actual = new Map(
      (request.actuals[0]?.rows ?? []).map((r) => [
        `${r.partLabel}|${r.taskTitle}|${r.title}`,
        r.actualTenths,
      ]),
    );
    for (const part of snapshot.parts) {
      for (const task of part.tasks) {
        entries.push({
          kind: request.baseline === "PRE_AI" ? "APPROVED_PRE_AI" : "APPROVED_AI_ERA",
          requestId,
          version: approved.version,
          referenceId: null,
          part: part.part,
          partLabel: part.label,
          title: task.title,
          subTasks: task.subTasks.map((s) => ({
            title: s.title,
            minTenths: s.minTenths,
            maxTenths: s.maxTenths,
            actualTenths: actual.get(`${part.label}|${task.title}|${s.title}`) ?? null,
          })),
          projectName: snapshot.projectName,
          clientName: request.client?.name ?? snapshot.clientName,
          authorName: null,
          sourceDate: approved.approvedAt,
        });
      }
    }
  }
  const embedded = await embedEntries(embedder, entries);
  await db.$transaction(async (tx) => {
    // Only this embedder's entries: tests (stub) and development (local) can share a database.
    await tx.knowledgeItem.deleteMany({ where: { requestId, model: embedder.name } });
    await insert(tx, embedded);
  });
  return entries.length;
}

export async function indexReference(db: PrismaClient, embedder: Embedder, referenceId: string) {
  const reference = await db.featureReference.findUniqueOrThrow({
    where: { id: referenceId },
    include: { author: { select: { name: true } } },
  });
  const subTasks = reference.subTasks as Entry["subTasks"];
  const embedded = await embedEntries(embedder, [
    {
      kind: "ARCHITECT_REFERENCE",
      requestId: null,
      version: null,
      referenceId,
      part: reference.part,
      partLabel: partLabel(reference.part, reference.stack),
      title: reference.title,
      description: reference.description,
      subTasks,
      projectName: null,
      clientName: null,
      authorName: reference.author.name,
      sourceDate: reference.createdAt,
    },
  ]);
  await db.$transaction(async (tx) => {
    await tx.knowledgeItem.deleteMany({ where: { referenceId, model: embedder.name } });
    await insert(tx, embedded);
  });
}

/** Rebuilds the whole index: every latest approved version and every Architect reference. */
export async function reindexAll(db: PrismaClient, embedder: Embedder) {
  const requests = await db.estimationRequest.findMany({
    where: { approved: { some: {} } },
    select: { id: true },
  });
  const references = await db.featureReference.findMany({ select: { id: true } });
  await db.knowledgeItem.deleteMany({
    where: {
      model: embedder.name,
      requestId: { notIn: requests.map((r) => r.id) },
      referenceId: null,
    },
  });
  let entries = 0;
  for (const r of requests) entries += await indexRequest(db, embedder, r.id);
  for (const r of references) await indexReference(db, embedder, r.id);
  return {
    requests: requests.length,
    references: references.length,
    entries: entries + references.length,
  };
}

type Row = {
  id: string;
  kind: KnowledgeKind;
  similarity: number;
  request_id: string | null;
  version: number | null;
  project_name: string | null;
  client_name: string | null;
  author_name: string | null;
  part_label: string;
  title: string;
  sub_tasks: Match["subTasks"];
  min_tenths: number;
  max_tenths: number;
  actual_tenths: number | null;
  source_date: Date;
};

/** Up to `limit` entries on the same part, most similar first, never from `excludeRequestId`. */
export async function searchKnowledge(
  db: Db,
  input: {
    vector: number[];
    model: string;
    part: Part;
    excludeRequestId: string;
    limit?: number;
  },
): Promise<Match[]> {
  const q = toVectorLiteral(input.vector);
  const rows = await db.$queryRaw<Row[]>`
    SELECT id, kind, 1 - (embedding <=> ${q}::vector) AS similarity, request_id, version,
      project_name, client_name, author_name, part_label, title, sub_tasks, min_tenths,
      max_tenths, actual_tenths, source_date
    FROM knowledge_item
    WHERE model = ${input.model} AND part = ${input.part}::"ProjectPart"
      AND (request_id IS NULL OR request_id <> ${input.excludeRequestId})
    ORDER BY embedding <=> ${q}::vector
    LIMIT ${input.limit ?? 5}`;
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    similarity: Math.round(Number(r.similarity) * 1000) / 1000,
    requestId: r.request_id,
    version: r.version,
    projectName: r.project_name,
    clientName: r.client_name,
    authorName: r.author_name,
    partLabel: r.part_label,
    title: r.title,
    subTasks: r.sub_tasks,
    minTenths: r.min_tenths,
    maxTenths: r.max_tenths,
    actualTenths: r.actual_tenths,
    sourceDate: r.source_date.toISOString().slice(0, 10),
  }));
}
