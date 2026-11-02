// The knowledge index (specs/feature-matching "Knowledge index"): one entry per Task of each
// request's latest approved version, plus one per usable benchmark, each with its embedding.
// No "server-only" import: the reindex script and the seed use it with their own Prisma client.
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import type { Part } from "../../lib/estimation/options";
import { entryText, type KnowledgeKind, type Match } from "../../lib/matching/suggest";
import { readSnapshot } from "../../lib/review/snapshot";
import { benchmarkPartLabel, benchmarkSubTasks } from "../../lib/benchmarks/subtasks";
import { toVectorLiteral, type Embedder } from "./embedder";

type Db = PrismaClient | Prisma.TransactionClient;

type Entry = {
  kind: KnowledgeKind;
  requestId: string | null;
  version: number | null;
  benchmarkId: string | null;
  /** Null for a benchmark whose part is Any: it matches every part. */
  part: Part | null;
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
      INSERT INTO knowledge_item (id, kind, request_id, version, benchmark_id, part, part_label,
        title, sub_tasks, min_tenths, max_tenths, actual_tenths, project_name, client_name,
        author_name, source_date, text, model, embedding)
      VALUES (${randomUUID()}, ${e.kind}::"KnowledgeKind", ${e.requestId}, ${e.version},
        ${e.benchmarkId}, ${e.part}::"ProjectPart", ${e.partLabel}, ${e.title},
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
          benchmarkId: null,
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

/**
 * Re-indexes one benchmark (specs/feature-matching "Knowledge index"): an entry only while it is
 * usable (AI-era hours, not Retired) and on a part estimates have (Design has none yet).
 */
export async function indexBenchmark(db: PrismaClient, embedder: Embedder, benchmarkId: string) {
  const b = await db.featureBenchmark.findUnique({
    where: { id: benchmarkId },
    include: { confirmedBy: { select: { name: true } } },
  });
  const subTasks = b ? benchmarkSubTasks(b) : null;
  const usable = b && subTasks && b.status !== "RETIRED" && b.part !== "DESIGN";
  const embedded = usable
    ? await embedEntries(embedder, [
        {
          kind: b.status === "CONFIRMED" ? "BENCHMARK_CONFIRMED" : "BENCHMARK_DRAFT",
          requestId: null,
          version: null,
          benchmarkId,
          part: b.part === "ANY" ? null : (b.part as Part),
          partLabel: benchmarkPartLabel(b.part, b.stack),
          title: b.feature,
          description: b.included,
          subTasks,
          projectName: null,
          clientName: null,
          authorName: b.confirmedBy?.name ?? null,
          sourceDate: b.updatedAt,
        },
      ])
    : [];
  await db.$transaction(async (tx) => {
    await tx.knowledgeItem.deleteMany({ where: { benchmarkId, model: embedder.name } });
    await insert(tx, embedded);
  });
  return embedded.length;
}

/** Rebuilds the whole index: every latest approved version and every usable benchmark. */
export async function reindexAll(db: PrismaClient, embedder: Embedder) {
  const requests = await db.estimationRequest.findMany({
    where: { approved: { some: {} } },
    select: { id: true },
  });
  const benchmarks = await db.featureBenchmark.findMany({ select: { id: true } });
  await db.knowledgeItem.deleteMany({
    where: {
      model: embedder.name,
      requestId: { notIn: requests.map((r) => r.id) },
      benchmarkId: null,
    },
  });
  let entries = 0;
  for (const r of requests) entries += await indexRequest(db, embedder, r.id);
  let usable = 0;
  for (const b of benchmarks) usable += await indexBenchmark(db, embedder, b.id);
  return { requests: requests.length, benchmarks: usable, entries: entries + usable };
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
  benchmark_id: string | null;
  b_code: string | null;
  b_status: "DRAFT" | "CONFIRMED" | "RETIRED" | null;
  b_confirmed_by: string | null;
  b_projects: number | null;
  b_updated_at: Date | null;
};

/**
 * Up to `limit` entries on the same part (or a benchmark for any part), most similar first, never
 * from `excludeRequestId`.
 */
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
    SELECT k.id, k.kind, 1 - (k.embedding <=> ${q}::vector) AS similarity, k.request_id,
      k.version, k.project_name, k.client_name, k.author_name, k.part_label, k.title,
      k.sub_tasks, k.min_tenths, k.max_tenths, k.actual_tenths, k.source_date, k.benchmark_id,
      b.code AS b_code, b.status::text AS b_status, u.name AS b_confirmed_by,
      b.projects_count AS b_projects, b.updated_at AS b_updated_at
    FROM knowledge_item k
    LEFT JOIN feature_benchmark b ON b.id = k.benchmark_id
    LEFT JOIN "user" u ON u.id = b.confirmed_by_id
    WHERE k.model = ${input.model}
      AND (k.part = ${input.part}::"ProjectPart" OR k.part IS NULL)
      AND (k.request_id IS NULL OR k.request_id <> ${input.excludeRequestId})
    ORDER BY k.embedding <=> ${q}::vector
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
    benchmark:
      r.benchmark_id && r.b_code && r.b_status
        ? {
            id: r.benchmark_id,
            code: r.b_code,
            status: r.b_status,
            confirmedByName: r.b_confirmed_by,
            projectsCount: r.b_projects ?? 0,
            updatedAt: (r.b_updated_at ?? r.source_date).toISOString().slice(0, 10),
          }
        : null,
  }));
}
