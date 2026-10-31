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
  features: { name: string; description?: string; parts: ProjectPart[] }[];
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
      },
      {
        name: "Appointment booking",
        description: "Doctor availability, reminders",
        parts: ["WEB_FRONTEND", "BACKEND"],
      },
      { name: "Lab results", parts: ["MOBILE", "BACKEND"] },
    ],
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
      },
      { name: "Photo capture", parts: ["MOBILE"] },
    ],
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
    await db.estimationRequest.create({
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
          create: sample.features.map((f, position) => ({ ...f, position })),
        },
      },
    });
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
