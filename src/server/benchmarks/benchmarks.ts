import "server-only";
import type { CurrentUser } from "@/server/auth/access";
import { can } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { benchmarkSubTasks } from "@/lib/benchmarks/subtasks";
import { decide, projectsCount, recalculated, type Level } from "@/lib/benchmarks/recalc";
import { BENCHMARK_PARTS, type BenchmarkPart } from "@/lib/benchmarks/rows";
import { reindexBenchmarkSoftly } from "../matching/hooks";
import { assertAccess, ServiceError } from "../service-error";

// The benchmark library (specs/feature-benchmarks). Every function checks the caller itself; every
// change to AI-era hours is logged in BenchmarkChange.

type Tx = Prisma.TransactionClient;
type Status = "DRAFT" | "CONFIRMED" | "RETIRED";

const NOT_FOUND = "Benchmark not found";
/** Reference hours from Architects take codes from here up, apart from the seed list. */
export const REFERENCE_CODE_START = 9001;

// ---------- reads ----------

export type BenchmarkFilters = {
  q?: string;
  part?: string;
  status?: string;
  module?: string;
  withHours?: boolean;
};

export async function listBenchmarks(actor: CurrentUser | null, filters: BenchmarkFilters = {}) {
  assertAccess(actor);
  const where: Prisma.FeatureBenchmarkWhereInput = {};
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { feature: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { module: { contains: q, mode: "insensitive" } },
      { stack: { contains: q, mode: "insensitive" } },
    ];
  }
  if (filters.part && (BENCHMARK_PARTS as readonly string[]).includes(filters.part)) {
    where.part = filters.part as BenchmarkPart;
  }
  if (
    filters.status === "DRAFT" ||
    filters.status === "CONFIRMED" ||
    filters.status === "RETIRED"
  ) {
    where.status = filters.status;
  } else {
    where.status = { not: "RETIRED" };
  }
  if (filters.module) where.module = filters.module;
  if (filters.withHours) where.experiencedTenths = { not: null };
  const [rows, modules] = await Promise.all([
    getDb().featureBenchmark.findMany({
      where,
      orderBy: { code: "asc" },
      include: { confirmedBy: { select: { name: true } } },
      take: 500,
    }),
    getDb().featureBenchmark.findMany({
      distinct: ["module"],
      select: { module: true },
      orderBy: { module: "asc" },
    }),
  ]);
  // Codes sort by number, not text (FB-2 before FB-10).
  rows.sort((a, b) => codeNumber(a.code) - codeNumber(b.code));
  return { rows, modules: modules.map((m) => m.module).filter(Boolean) };
}

const codeNumber = (code: string) => Number(code.replace(/\D/g, "")) || 0;

export async function getBenchmark(actor: CurrentUser | null, id: string) {
  assertAccess(actor);
  const b = await getDb().featureBenchmark.findUnique({
    where: { id },
    include: {
      confirmedBy: { select: { name: true } },
      createdBy: { select: { name: true } },
      observations: {
        orderBy: { observedOn: "desc" },
        include: {
          createdBy: { select: { name: true } },
          request: { select: { id: true, projectName: true } },
        },
      },
      changes: { orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } },
    },
  });
  if (!b) throw new ServiceError(NOT_FOUND, 404);
  return {
    ...b,
    proposal: pendingProposal(b.changes),
    suggests: benchmarkSubTasks(b),
    can: {
      edit: can(actor.role, "benchmark.edit") && b.status !== "RETIRED",
      confirm:
        can(actor.role, "benchmark.confirm") &&
        b.status === "DRAFT" &&
        b.experiencedTenths !== null,
      retire: can(actor.role, "benchmark.retire") && b.status !== "RETIRED",
      observe: can(actor.role, "benchmark.confirm") && b.status !== "RETIRED",
      decide: can(actor.role, "benchmark.decide"),
    },
  };
}

/** The latest PROPOSED change, unless a decision came after it. */
function pendingProposal<T extends { kind: string; createdAt: Date }>(changes: T[]): T | null {
  const sorted = [...changes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const c of sorted) {
    if (c.kind === "PROPOSAL_ACCEPTED" || c.kind === "PROPOSAL_REJECTED") return null;
    if (c.kind === "PROPOSED") return c;
  }
  return null;
}

// ---------- writes ----------

type BenchmarkInput = {
  feature?: unknown;
  module?: unknown;
  part?: unknown;
  stack?: unknown;
  included?: unknown;
  experienced?: unknown; // hours
  junior?: unknown;
  aiTools?: unknown;
  notes?: unknown;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function hoursField(v: unknown, label: string): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 9999)
    throw new ServiceError(`${label}: enter hours from 0 to 9999`, 400);
  return Math.round(n * 10);
}

function parseInput(input: BenchmarkInput) {
  const feature = str(input.feature, 200);
  if (!feature) throw new ServiceError("Enter the feature name", 400);
  const part = typeof input.part === "string" ? input.part : "";
  if (!(BENCHMARK_PARTS as readonly string[]).includes(part))
    throw new ServiceError("Choose a part", 400);
  const experienced = hoursField(input.experienced, "Experienced hours");
  const junior = hoursField(input.junior, "Junior hours");
  if (experienced === null && junior !== null)
    throw new ServiceError("Enter experienced hours too", 400);
  if (experienced !== null && junior !== null && experienced > junior) {
    throw new ServiceError("Experienced hours can't be more than junior hours", 400);
  }
  return {
    feature,
    module: str(input.module, 100),
    part: part as BenchmarkPart,
    stack: str(input.stack, 100) || "Any",
    included: str(input.included, 1000),
    experiencedTenths: experienced,
    juniorTenths: junior,
    aiTools: str(input.aiTools, 200),
    notes: str(input.notes, 1000),
  };
}

/** The next free code: below the reference range for the library, from 9001 for references. */
async function nextCode(tx: Tx, forReference: boolean) {
  const codes = await tx.featureBenchmark.findMany({ select: { code: true } });
  const numbers = codes.map((c) => codeNumber(c.code));
  const inRange = numbers.filter((n) =>
    forReference ? n >= REFERENCE_CODE_START : n < REFERENCE_CODE_START,
  );
  const start = forReference ? REFERENCE_CODE_START : 1;
  const next = inRange.length ? Math.max(...inRange) + 1 : start;
  return `FB-${String(next).padStart(3, "0")}`;
}

async function log(
  tx: Tx,
  input: {
    benchmarkId: string;
    kind: Prisma.BenchmarkChangeCreateManyInput["kind"];
    from?: { experienced: number | null; junior: number | null };
    to?: { experienced: number | null; junior: number | null };
    observationIds?: string[];
    note?: string;
    actorId: string | null;
  },
) {
  await tx.benchmarkChange.create({
    data: {
      benchmarkId: input.benchmarkId,
      kind: input.kind,
      fromExperienced: input.from?.experienced ?? null,
      fromJunior: input.from?.junior ?? null,
      toExperienced: input.to?.experienced ?? null,
      toJunior: input.to?.junior ?? null,
      observationIds: input.observationIds ?? [],
      note: input.note ?? "",
      actorId: input.actorId,
    },
  });
}

export async function createBenchmark(actor: CurrentUser | null, input: BenchmarkInput) {
  assertAccess(actor, "benchmark.edit");
  const data = parseInput(input);
  const created = await getDb().$transaction(async (tx) => {
    const b = await tx.featureBenchmark.create({
      data: { ...data, code: await nextCode(tx, false), createdById: actor.id },
    });
    if (data.experiencedTenths !== null) {
      await log(tx, {
        benchmarkId: b.id,
        kind: "EDIT",
        to: { experienced: data.experiencedTenths, junior: data.juniorTenths },
        note: "Created",
        actorId: actor.id,
      });
    }
    return b;
  });
  await reindexBenchmarkSoftly(created.id);
  return created;
}

export async function updateBenchmark(
  actor: CurrentUser | null,
  id: string,
  input: BenchmarkInput,
) {
  assertAccess(actor, "benchmark.edit");
  const data = parseInput(input);
  await getDb().$transaction(async (tx) => {
    const b = await tx.featureBenchmark.findUnique({ where: { id } });
    if (!b) throw new ServiceError(NOT_FOUND, 404);
    if (b.status === "RETIRED") throw new ServiceError("A retired benchmark can't be edited", 409);
    const hoursChanged =
      b.experiencedTenths !== data.experiencedTenths || b.juniorTenths !== data.juniorTenths;
    await tx.featureBenchmark.update({
      where: { id },
      data: {
        ...data,
        // Hand-edited hours need confirming again (specs/feature-benchmarks "Edit, confirm and retire").
        ...(hoursChanged && b.status === "CONFIRMED"
          ? { status: "DRAFT", confirmedById: null, confirmedAt: null }
          : {}),
      },
    });
    if (hoursChanged) {
      await log(tx, {
        benchmarkId: id,
        kind: "EDIT",
        from: { experienced: b.experiencedTenths, junior: b.juniorTenths },
        to: { experienced: data.experiencedTenths, junior: data.juniorTenths },
        note: b.status === "CONFIRMED" ? "Back to Draft: hours edited by hand" : "",
        actorId: actor.id,
      });
    }
  });
  await reindexBenchmarkSoftly(id);
}

export async function confirmBenchmark(actor: CurrentUser | null, id: string) {
  assertAccess(actor, "benchmark.confirm");
  await getDb().$transaction(async (tx) => {
    const b = await tx.featureBenchmark.findUnique({ where: { id } });
    if (!b) throw new ServiceError(NOT_FOUND, 404);
    if (b.status !== "DRAFT") throw new ServiceError("Only a Draft can be confirmed", 409);
    if (b.experiencedTenths === null)
      throw new ServiceError("Add AI-era hours before confirming", 400);
    await tx.featureBenchmark.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedById: actor.id, confirmedAt: new Date() },
    });
    await log(tx, { benchmarkId: id, kind: "CONFIRMED", actorId: actor.id });
  });
  await reindexBenchmarkSoftly(id);
}

export async function retireBenchmark(actor: CurrentUser | null, id: string) {
  assertAccess(actor, "benchmark.retire");
  await getDb().$transaction(async (tx) => {
    const b = await tx.featureBenchmark.findUnique({ where: { id } });
    if (!b) throw new ServiceError(NOT_FOUND, 404);
    if (b.status === "RETIRED") throw new ServiceError("Already retired", 409);
    await tx.featureBenchmark.update({ where: { id }, data: { status: "RETIRED" } });
    await log(tx, { benchmarkId: id, kind: "RETIRED", actorId: actor.id });
  });
  await reindexBenchmarkSoftly(id);
}

// ---------- observations and recalculation ----------

/**
 * Recalculates from all observations (specs/feature-benchmarks "Recalculation"): applies, proposes
 * (a Confirmed benchmark moving more than 15%) or does nothing. Returns what happened.
 */
export async function recalculate(tx: Tx, id: string, now = new Date()) {
  const b = await tx.featureBenchmark.findUniqueOrThrow({
    where: { id },
    include: { observations: true, changes: true },
  });
  const observations = b.observations.map((o) => ({
    id: o.id,
    level: o.level as Level,
    hoursTenths: o.hoursTenths,
    observedOn: o.observedOn,
    requestId: o.requestId,
  }));
  const current = { experienced: b.experiencedTenths, junior: b.juniorTenths };
  const next = recalculated(current, observations, now);
  const used = observations.filter((o) => o.level !== "MIXED").map((o) => o.id);
  const projects = projectsCount(observations);
  if (projects !== b.projectsCount) {
    await tx.featureBenchmark.update({ where: { id }, data: { projectsCount: projects } });
  }
  const action = decide(current, next, b.status as Status);
  if (action === "apply") {
    await tx.featureBenchmark.update({
      where: { id },
      data: { experiencedTenths: next.experienced, juniorTenths: next.junior },
    });
    await log(tx, {
      benchmarkId: id,
      kind: "RECALCULATED",
      from: current,
      to: next,
      observationIds: used,
      actorId: null,
    });
  } else if (action === "propose") {
    const pending = pendingProposal(b.changes);
    const same =
      pending && pending.toExperienced === next.experienced && pending.toJunior === next.junior;
    if (!same) {
      await log(tx, {
        benchmarkId: id,
        kind: "PROPOSED",
        from: current,
        to: next,
        observationIds: used,
        actorId: null,
      });
    }
  }
  return action;
}

const LEVELS: Level[] = ["EXPERIENCED", "JUNIOR", "MIXED"];

export async function addObservation(
  actor: CurrentUser | null,
  id: string,
  input: {
    hours?: unknown;
    level?: unknown;
    observedOn?: unknown;
    aiTools?: unknown;
    note?: unknown;
    requestId?: unknown;
  },
) {
  assertAccess(actor, "benchmark.confirm");
  const hoursTenths = hoursField(input.hours, "Hours");
  if (hoursTenths === null || hoursTenths === 0)
    throw new ServiceError("Enter the hours spent", 400);
  const level =
    typeof input.level === "string" && LEVELS.includes(input.level as Level)
      ? (input.level as Level)
      : null;
  if (!level) throw new ServiceError("Choose the developer level", 400);
  const dateText = typeof input.observedOn === "string" ? input.observedOn : "";
  const observedOn = /^\d{4}-\d{2}-\d{2}$/.test(dateText)
    ? new Date(`${dateText}T00:00:00Z`)
    : new Date();
  if (observedOn.getTime() > Date.now() + 86_400_000)
    throw new ServiceError("The date can't be in the future", 400);
  const requestId = typeof input.requestId === "string" && input.requestId ? input.requestId : null;
  const result = await getDb().$transaction(async (tx) => {
    const b = await tx.featureBenchmark.findUnique({ where: { id } });
    if (!b) throw new ServiceError(NOT_FOUND, 404);
    if (b.status === "RETIRED")
      throw new ServiceError("A retired benchmark takes no observations", 409);
    await tx.benchmarkObservation.create({
      data: {
        benchmarkId: id,
        level,
        hoursTenths,
        observedOn,
        source: "MANUAL",
        aiTools: str(input.aiTools, 200),
        note: str(input.note, 500),
        requestId,
        createdById: actor.id,
      },
    });
    return recalculate(tx, id);
  });
  await reindexBenchmarkSoftly(id);
  return { result };
}

export async function decideProposal(actor: CurrentUser | null, id: string, accept: boolean) {
  assertAccess(actor, "benchmark.decide");
  await getDb().$transaction(async (tx) => {
    const b = await tx.featureBenchmark.findUnique({ where: { id }, include: { changes: true } });
    if (!b) throw new ServiceError(NOT_FOUND, 404);
    const proposal = pendingProposal(b.changes);
    if (!proposal) throw new ServiceError("There is no proposal to decide", 409);
    const from = { experienced: b.experiencedTenths, junior: b.juniorTenths };
    const to = { experienced: proposal.toExperienced, junior: proposal.toJunior };
    if (accept) {
      await tx.featureBenchmark.update({
        where: { id },
        data: { experiencedTenths: to.experienced, juniorTenths: to.junior },
      });
    }
    await log(tx, {
      benchmarkId: id,
      kind: accept ? "PROPOSAL_ACCEPTED" : "PROPOSAL_REJECTED",
      from,
      to: accept ? to : from,
      observationIds: proposal.observationIds,
      actorId: actor.id,
    });
  });
  await reindexBenchmarkSoftly(id);
}

/** Benchmarks with a pending proposal, for Architects (Reviews page). */
export async function listProposals(actor: CurrentUser | null) {
  assertAccess(actor, "benchmark.decide");
  const proposed = await getDb().featureBenchmark.findMany({
    where: { changes: { some: { kind: "PROPOSED" } } },
    include: { changes: true },
  });
  return proposed.flatMap((b) => {
    const p = pendingProposal(b.changes);
    return p
      ? [
          {
            id: b.id,
            code: b.code,
            feature: b.feature,
            from: { experienced: b.experiencedTenths, junior: b.juniorTenths },
            to: { experienced: p.toExperienced, junior: p.toJunior },
            observations: p.observationIds.length,
            createdAt: p.createdAt,
          },
        ]
      : [];
  });
}

export async function proposalCount(actor: CurrentUser | null) {
  if (!actor || !can(actor.role, "benchmark.decide")) return 0;
  return (await listProposals(actor)).length;
}

// ---------- links from matching and actual hours ----------

/** An Architect's reference hours become a Draft benchmark (specs/feature-matching). */
export async function createReferenceBenchmark(
  tx: Tx,
  input: {
    title: string;
    description: string;
    part: BenchmarkPart;
    stack: string[];
    subTasks: { title: string; minTenths: number; maxTenths: number }[];
    authorId: string;
  },
) {
  const experienced = input.subTasks.reduce((n, s) => n + s.minTenths, 0);
  const junior = input.subTasks.reduce((n, s) => n + s.maxTenths, 0);
  const b = await tx.featureBenchmark.create({
    data: {
      code: await nextCode(tx, true),
      module: "From requests",
      feature: input.title,
      part: input.part,
      stack: input.stack.join(", ") || "Any",
      included: input.description,
      experiencedTenths: experienced,
      juniorTenths: junior,
      notes: "Added as reference hours by an Architect",
      breakdown: input.subTasks as unknown as Prisma.InputJsonValue,
      createdById: input.authorId,
    },
  });
  await log(tx, {
    benchmarkId: b.id,
    kind: "REFERENCE",
    to: { experienced, junior },
    note: "Reference hours from an Architect",
    actorId: input.authorId,
  });
  return b;
}

/**
 * Observations from a saved actuals version (specs/actual-hours "Linked Sub tasks become
 * observations"): the request's older versions' observations are replaced. Returns the benchmark
 * ids to re-index after the transaction.
 */
export async function observationsFromActuals(tx: Tx, versionId: string): Promise<string[]> {
  const version = await tx.actualsVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: {
      rows: { include: { subTask: { select: { benchmarkId: true } } } },
      request: { select: { baseline: true } },
    },
  });
  const old = await tx.benchmarkObservation.findMany({
    where: {
      requestId: version.requestId,
      source: "ACTUALS",
      actualsVersionId: { not: versionId },
    },
    select: { benchmarkId: true },
  });
  await tx.benchmarkObservation.deleteMany({
    where: {
      requestId: version.requestId,
      source: "ACTUALS",
      actualsVersionId: { not: versionId },
    },
  });
  const touched = new Set(old.map((o) => o.benchmarkId));
  if (version.request.baseline === "AI_ERA" && version.teamLevel) {
    // Sum per benchmark: several Sub tasks may come from one benchmark.
    const byBenchmark = new Map<string, number>();
    for (const r of version.rows) {
      const benchmarkId = r.subTask?.benchmarkId;
      if (!benchmarkId || r.actualTenths === null) continue;
      byBenchmark.set(benchmarkId, (byBenchmark.get(benchmarkId) ?? 0) + r.actualTenths);
    }
    for (const [benchmarkId, hoursTenths] of byBenchmark) {
      await tx.benchmarkObservation.create({
        data: {
          benchmarkId,
          level: version.teamLevel,
          hoursTenths,
          observedOn: version.createdAt,
          source: "ACTUALS",
          requestId: version.requestId,
          actualsVersionId: versionId,
          createdById: version.createdById,
          note: `Actual hours, version ${version.number}`,
        },
      });
      touched.add(benchmarkId);
    }
  }
  for (const id of touched) await recalculate(tx, id);
  return [...touched];
}
