// Development and test users for the development sign-in (specs/authentication).
// Run with `npm run db:seed`. Refuses to run unless AUTH_DEV_LOGIN=1 outside production.
// Safe to run repeatedly: users are matched by email and brought back to the state below.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient, type ProjectPart, type Role } from "../src/generated/prisma/client";
import { readCsv } from "../src/lib/benchmarks/rows";
import { recalculated } from "../src/lib/benchmarks/recalc";
import { embedderFor } from "../src/server/matching/embedder";
import { reindexAll } from "../src/server/matching/knowledge";
import { backfillApproved, storeApprovedVersion } from "../src/server/review/snapshot-source";

try {
  process.loadEnvFile();
} catch {
  // no .env file (CI and containers set variables directly)
}

const { NODE_ENV, AUTH_DEV_LOGIN, DATABASE_URL } = process.env;
const password = process.env.DEV_USER_PASSWORD || "dev-password-not-for-production";

if (NODE_ENV === "production" || AUTH_DEV_LOGIN !== "1") {
  console.error("Refusing to seed: development users need AUTH_DEV_LOGIN=1 outside production.");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("Refusing to seed: DATABASE_URL is not set.");
  process.exit(1);
}

export const DEV_USERS: { email: string; name: string; role: Role | null }[] = [
  { email: "dev.estimator@folio3.com", name: "Dev Estimator", role: "ESTIMATOR" },
  { email: "dev.techlead@folio3.com", name: "Dev Tech Lead", role: "TECH_LEAD" },
  { email: "dev.architect@folio3.com", name: "Dev Architect", role: "ARCHITECT" },
  { email: "dev.admin@folio3.com", name: "Dev Admin", role: "ADMIN" },
  { email: "dev.newcomer@folio3.com", name: "Dev Newcomer", role: null },
];

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

async function main() {
  const hash = await hashPassword(password);
  for (const person of DEV_USERS) {
    const user = await db.user.upsert({
      where: { email: person.email },
      create: {
        id: randomUUID(),
        email: person.email,
        name: person.name,
        emailVerified: true,
        role: person.role,
      },
      update: { name: person.name, role: person.role, status: "ACTIVE" },
    });
    const credential = await db.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    });
    if (credential) {
      await db.account.update({ where: { id: credential.id }, data: { password: hash } });
    } else {
      await db.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: hash,
        },
      });
    }
    console.log(`seeded ${person.email} (${person.role ?? "no role"})`);
  }
  // Users only: tests that change people reset them without touching requests other tests use.
  if (process.env.SEED_USERS_ONLY === "1") return;
  await seedRequests();
  await seedBenchmarks();
  const backfilled = await backfillApproved(db);
  if (backfilled) console.log(`approved versions backfilled: ${backfilled}`);
  // The matching index (specs/feature-matching): stub vectors in tests, the local model otherwise.
  const index = await reindexAll(
    db,
    embedderFor({
      EMBEDDINGS_PROVIDER: process.env.EMBEDDINGS_PROVIDER === "stub" ? "stub" : "local",
      EMBEDDINGS_CACHE_DIR: process.env.EMBEDDINGS_CACHE_DIR,
    }),
  );
  console.log(`knowledge index: ${index.entries} entries`);
}

// Sample estimation requests with fictional clients (the same names as the design prototype;
// never real client names). Recreated on every run so they always look like this.
type SampleRequest = {
  projectName: string;
  client: string;
  owner: string;
  lastStep: number;
  daysAgo: number;
  parts: { part: ProjectPart; technologies: string[] }[];
  compliance: string[];
  features: {
    name: string;
    description?: string;
    parts: ProjectPart[];
    // Sample Sub tasks per part: [title, min hours, max hours].
    hours?: Partial<Record<ProjectPart, [string, number, number][]>>;
  }[];
  deployment?: Partial<Record<ProjectPart, [number, number]>>;
  assumptions?: Partial<Record<ProjectPart, string[]>>;
  // A won project with actual hours per Sub task title (specs/actual-hours).
  actuals?: Record<string, number>;
  /** Seeded as submitted and approved by this person (never the owner). */
  approvedBy?: string;
};

const SAMPLE_REQUESTS: SampleRequest[] = [
  {
    projectName: "Patient portal MVP",
    client: "Northwind Clinics",
    owner: "dev.estimator@folio3.com",
    lastStep: 4,
    daysAgo: 2,
    parts: [
      { part: "WEB_FRONTEND", technologies: ["React"] },
      { part: "BACKEND", technologies: ["Node.js"] },
      { part: "MOBILE", technologies: ["React Native"] },
    ],
    compliance: ["HIPAA"],
    features: [
      {
        name: "Patient sign up & sign in",
        description: "Email and Google sign-in, forgot password",
        parts: ["WEB_FRONTEND", "MOBILE", "BACKEND"],
        hours: {
          BACKEND: [
            ["Auth API and sessions", 10, 14],
            ["Google sign-in", 4, 6],
          ],
          WEB_FRONTEND: [["Sign-up and sign-in screens", 8, 12]],
          MOBILE: [["Sign-up and sign-in screens", 10, 14]],
        },
      },
      {
        name: "Appointment booking",
        description: "Doctor availability, reminders",
        parts: ["WEB_FRONTEND", "BACKEND"],
        hours: {
          BACKEND: [
            ["Booking API", 12, 16],
            ["Reminder emails", 6, 8],
          ],
          WEB_FRONTEND: [["Booking calendar", 14, 20]],
        },
      },
      {
        name: "Lab results",
        parts: ["MOBILE", "BACKEND"],
        hours: {
          BACKEND: [["Results API", 8, 12]],
          MOBILE: [["Results list and detail", 10, 14]],
        },
      },
    ],
    deployment: { BACKEND: [16, 24], WEB_FRONTEND: [4, 8], MOBILE: [8, 12] },
    assumptions: { BACKEND: ["Lab results come from the client's existing system via an API"] },
  },
  {
    projectName: "Fleet tracking dashboard",
    client: "Contoso Logistics",
    owner: "dev.techlead@folio3.com",
    lastStep: 2,
    daysAgo: 5,
    parts: [
      { part: "WEB_FRONTEND", technologies: ["Next.js"] },
      { part: "BACKEND", technologies: [".NET"] },
      { part: "CLOUD_INFRA", technologies: ["Azure"] },
    ],
    compliance: [],
    features: [],
  },
  {
    projectName: "Field service app",
    client: "Fabrikam Energy",
    owner: "dev.architect@folio3.com",
    lastStep: 4,
    daysAgo: 9,
    parts: [
      { part: "MOBILE", technologies: ["Flutter"] },
      { part: "BACKEND", technologies: ["Python"] },
    ],
    compliance: [],
    features: [
      {
        name: "Work orders",
        description: "Assign, update and close jobs offline",
        parts: ["MOBILE", "BACKEND"],
        hours: {
          BACKEND: [["Work order API and sync", 16, 24]],
          MOBILE: [
            ["Job list and detail", 12, 16],
            ["Offline sync", 16, 24],
          ],
        },
      },
      {
        name: "Photo capture",
        parts: ["MOBILE"],
        hours: { MOBILE: [["Camera and upload", 6, 10]] },
      },
    ],
    deployment: { BACKEND: [12, 16], MOBILE: [8, 12] },
    actuals: { "Work order API and sync": 18, "Job list and detail": 11, "Offline sync": 22 },
    approvedBy: "dev.techlead@folio3.com",
  },
];

const key = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

async function seedRequests() {
  for (const sample of SAMPLE_REQUESTS) {
    const owner = await db.user.findUniqueOrThrow({ where: { email: sample.owner } });
    const client = await db.client.upsert({
      where: { nameKey: key(sample.client) },
      create: { name: sample.client, nameKey: key(sample.client) },
      update: {},
    });
    await db.estimationRequest.deleteMany({
      where: { projectName: sample.projectName, ownerId: owner.id },
    });
    const technologies = await db.technology.findMany();
    const techId = (name: string) => {
      const found = technologies.find((t) => t.nameKey === key(name));
      if (!found) throw new Error(`Technology ${name} is missing from the catalog`);
      return found.id;
    };
    const request = await db.estimationRequest.create({
      data: {
        projectName: sample.projectName,
        clientId: client.id,
        projectManager: owner.name,
        projectDate: new Date(),
        ownerId: owner.id,
        lastStep: sample.lastStep,
        // In the past, so requests people create are always newer (e2e relies on this).
        createdAt: new Date(Date.now() - sample.daysAgo * 86_400_000),
        updatedAt: new Date(Date.now() - sample.daysAgo * 86_400_000),
        applicationTypes: sample.parts.some((p) => p.part === "MOBILE")
          ? ["Web", "Mobile"]
          : ["Web"],
        operatingSystems: sample.parts.some((p) => p.part === "MOBILE") ? ["iOS", "Android"] : [],
        browsers: ["Chrome", "Safari", "Edge"],
        considerations: {
          v: 1,
          hosting: ["AWS"],
          environments: ["Staging", "Production"],
          compliance: sample.compliance,
        },
        parts: {
          create: sample.parts.map((p) => ({
            part: p.part,
            technologies: { create: p.technologies.map((t) => ({ technologyId: techId(t) })) },
          })),
        },
        features: {
          create: sample.features.map(({ name, description, parts }, position) => ({
            name,
            description,
            parts,
            position,
          })),
        },
      },
    });
    await seedHours(request.id, sample);
    if (sample.actuals) await seedActuals(request.id, owner.id, sample.actuals);
    if (sample.approvedBy)
      await seedApproval(request.id, owner.id, sample.approvedBy, sample.daysAgo);
    console.log(`seeded request "${sample.projectName}" (${sample.client})`);
  }
}

/** Submitted, then approved by another person: version 1 with its history (specs/estimate-review). */
async function seedApproval(
  requestId: string,
  ownerId: string,
  approverEmail: string,
  daysAgo: number,
) {
  const approver = await db.user.findUniqueOrThrow({ where: { email: approverEmail } });
  const submitted = new Date(Date.now() - (daysAgo - 1) * 86_400_000);
  await db.$transaction(async (tx) => {
    await tx.statusChange.create({
      data: {
        requestId,
        fromStatus: "DRAFT",
        toStatus: "IN_REVIEW",
        version: 1,
        actorId: ownerId,
        createdAt: submitted,
      },
    });
    await tx.estimationRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED", reviewerId: approver.id, submittedAt: submitted },
    });
    await storeApprovedVersion(tx, requestId, approver.id, {
      fromStatus: "IN_REVIEW",
      at: new Date(submitted.getTime() + 3_600_000),
    });
  });
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });

/** Tasks for every feature × part, with the sample's Sub tasks, deployment and assumptions. */
async function seedHours(requestId: string, sample: SampleRequest) {
  const parts = await db.requestPart.findMany({ where: { requestId } });
  const features = await db.feature.findMany({ where: { requestId } });
  for (const part of parts) {
    const deployment = sample.deployment?.[part.part];
    await db.requestPart.update({
      where: { id: part.id },
      data: {
        deploymentMinTenths: (deployment?.[0] ?? 0) * 10,
        deploymentMaxTenths: (deployment?.[1] ?? 0) * 10,
        assumptions: sample.assumptions?.[part.part] ?? [],
      },
    });
    for (const feature of features.filter((f) => f.parts.includes(part.part))) {
      const rows = sample.features.find((f) => f.name === feature.name)?.hours?.[part.part] ?? [];
      await db.estimateTask.create({
        data: {
          featureId: feature.id,
          requestPartId: part.id,
          subTasks: {
            create: rows.map(([title, min, max], position) => ({
              title,
              minTenths: min * 10,
              maxTenths: max * 10,
              position,
            })),
          },
        },
      });
    }
  }
}

const PART_NAMES: Record<ProjectPart, string> = {
  BACKEND: "Backend",
  WEB_FRONTEND: "Web/Frontend",
  ADMIN_PANEL: "Admin Panel",
  MOBILE: "Mobile",
  CLOUD_INFRA: "Cloud/Infrastructure",
};

/** Marks the request won and records one manual version of actual hours. */
async function seedActuals(requestId: string, userId: string, actuals: Record<string, number>) {
  await db.estimationRequest.update({
    where: { id: requestId },
    data: { outcome: "IN_DELIVERY", outcomeChangedAt: new Date(), outcomeChangedById: userId },
  });
  const subTasks = await db.subTask.findMany({
    where: { task: { requestPart: { requestId } } },
    include: {
      task: {
        include: {
          feature: true,
          requestPart: { include: { technologies: { include: { technology: true } } } },
        },
      },
    },
  });
  await db.actualsVersion.create({
    data: {
      requestId,
      number: 1,
      source: "MANUAL",
      createdById: userId,
      rows: {
        create: subTasks.map((s, position) => {
          const actual = actuals[s.title];
          return {
            subTaskId: s.id,
            requestPartId: s.task.requestPartId,
            partLabel: `${PART_NAMES[s.task.requestPart.part]} (${s.task.requestPart.technologies.map((t) => t.technology.name).join(", ")})`,
            taskTitle: s.task.feature.name,
            title: s.title,
            estMinTenths: s.minTenths,
            estMaxTenths: s.maxTenths,
            actualTenths: actual === undefined ? null : actual * 10,
            status: actual === undefined ? "DROPPED" : "MATCHED",
            position,
          };
        }),
      },
    },
  });
}

// Feature benchmarks (specs/feature-benchmarks): the 166-row seed list, plus three development
// sample values (clearly labelled, not real data) so matching can show benchmarks in the demo.
const SAMPLE_NOTE = "Development sample, not real data";
const SAMPLES: { code: string; experienced: number; junior: number; confirm: boolean }[] = [
  { code: "FB-023", experienced: 3, junior: 5, confirm: true }, // Sign up API, Backend (Node.js)
  { code: "FB-012", experienced: 4, junior: 6, confirm: false }, // Sign up form, Web/Frontend
  { code: "FB-027", experienced: 2, junior: 3, confirm: false }, // Forgot password API, Backend
];

async function seedBenchmarks() {
  const { rows, problems } = readCsv(readFileSync("data/feature-benchmarks.csv", "utf8"));
  if (problems.length) throw new Error(`data/feature-benchmarks.csv: ${problems[0].message}`);
  for (const r of rows) {
    const data = {
      module: r.module,
      feature: r.feature,
      part: r.part,
      stack: r.stack,
      included: r.included,
      preAiMinTenths: r.preAiMinTenths,
      preAiMaxTenths: r.preAiMaxTenths,
      preAiSource: r.preAiSource || null,
    };
    await db.featureBenchmark.upsert({
      where: { code: r.code },
      create: { ...data, code: r.code },
      update: data,
    });
  }
  const architect = await db.user.findUniqueOrThrow({
    where: { email: "dev.architect@folio3.com" },
  });
  const lead = await db.user.findUniqueOrThrow({ where: { email: "dev.techlead@folio3.com" } });
  for (const sample of SAMPLES) {
    const b = await db.featureBenchmark.findUniqueOrThrow({ where: { code: sample.code } });
    // Back to the sample state on every run.
    await db.benchmarkObservation.deleteMany({ where: { benchmarkId: b.id } });
    await db.benchmarkChange.deleteMany({ where: { benchmarkId: b.id } });
    const observedOn = new Date(Date.now() - 20 * 86_400_000);
    const observations = await Promise.all(
      (
        [
          ["EXPERIENCED", sample.experienced],
          ["JUNIOR", sample.junior],
        ] as const
      ).map(([level, hours]) =>
        db.benchmarkObservation.create({
          data: {
            benchmarkId: b.id,
            level,
            hoursTenths: hours * 10,
            observedOn,
            source: "SURVEY",
            aiTools: "Claude Code",
            note: SAMPLE_NOTE,
            createdById: lead.id,
          },
        }),
      ),
    );
    const next = recalculated(
      { experienced: null, junior: null },
      observations.map((o) => ({ ...o, level: o.level })),
      new Date(),
    );
    await db.featureBenchmark.update({
      where: { id: b.id },
      data: {
        experiencedTenths: next.experienced,
        juniorTenths: next.junior,
        aiTools: "Claude Code",
        projectsCount: 1,
        notes: SAMPLE_NOTE,
        status: sample.confirm ? "CONFIRMED" : "DRAFT",
        confirmedById: sample.confirm ? architect.id : null,
        confirmedAt: sample.confirm ? new Date() : null,
      },
    });
    await db.benchmarkChange.create({
      data: {
        benchmarkId: b.id,
        kind: "RECALCULATED",
        toExperienced: next.experienced,
        toJunior: next.junior,
        observationIds: observations.map((o) => o.id),
        note: SAMPLE_NOTE,
      },
    });
    if (sample.confirm) {
      await db.benchmarkChange.create({
        data: { benchmarkId: b.id, kind: "CONFIRMED", actorId: architect.id },
      });
    }
  }
  console.log(`seeded ${rows.length} feature benchmarks (${SAMPLES.length} with sample hours)`);
}
