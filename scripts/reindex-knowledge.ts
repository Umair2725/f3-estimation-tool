// Rebuilds the matching index from every latest approved version and every Architect reference
// (specs/feature-matching "Local embeddings"). Safe to run repeatedly; the seed runs it too.
// Usage: npm run reindex-knowledge
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { embedderFor } from "../src/server/matching/embedder";
import { reindexAll } from "../src/server/matching/knowledge";

try {
  process.loadEnvFile();
} catch {
  // no .env file (CI and containers set variables directly)
}
const { DATABASE_URL, EMBEDDINGS_PROVIDER, EMBEDDINGS_CACHE_DIR } = process.env;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
const embedder = embedderFor({
  EMBEDDINGS_PROVIDER: EMBEDDINGS_PROVIDER === "stub" ? "stub" : "local",
  EMBEDDINGS_CACHE_DIR,
});
reindexAll(db, embedder)
  .then(async (result) => {
    console.log(
      `knowledge index rebuilt with ${embedder.name} embeddings: ${result.requests} requests, ${result.references} references, ${result.entries} entries`,
    );
    await db.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
