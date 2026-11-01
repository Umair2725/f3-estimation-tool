// Gives approved requests from before the review workflow their approved version 1
// (specs/estimate-review "Knowledge-base sources"). Safe to run repeatedly.
// Usage: npm run backfill-approved
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { backfillApproved } from "../src/server/review/snapshot-source";

try {
  process.loadEnvFile();
} catch {
  // no .env file (CI and containers set variables directly)
}
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
backfillApproved(db)
  .then(async (count) => {
    console.log(`approved versions created: ${count}`);
    await db.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
