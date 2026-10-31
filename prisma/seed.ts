// Development and test users for the development sign-in (specs/authentication).
// Run with `npm run db:seed`. Refuses to run unless AUTH_DEV_LOGIN=1 outside production.
// Safe to run repeatedly: users are matched by email and brought back to the state below.
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient, type ProjectPart, type Role } from "../src/generated/prisma/client";

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
  await seedRequests();
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
      { name: "Photo capture", parts: ["MOBILE"], hours: { MOBILE: [["Camera and upload", 6, 10]] } },
    ],
    deployment: { BACKEND: [12, 16], MOBILE: [8, 12] },
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
    console.log(`seeded request "${sample.projectName}" (${sample.client})`);
  }
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
