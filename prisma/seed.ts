// Development and test users for the development sign-in (specs/authentication).
// Run with `npm run db:seed`. Refuses to run unless AUTH_DEV_LOGIN=1 outside production.
// Safe to run repeatedly: users are matched by email and brought back to the state below.
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient, type Role } from "../src/generated/prisma/client";

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
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
