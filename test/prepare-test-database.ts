// Creates (if missing), migrates and seeds the tests' own database before a run, so tests
// never write into the database that holds real work. Used by Vitest's and Playwright's
// global setup; safe to run repeatedly.
import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./test-database";

export async function prepareTestDatabase(): Promise<string> {
  try {
    process.loadEnvFile();
  } catch {
    // CI sets variables directly
  }
  const url = testDatabaseUrl(process.env);
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Unexpected test database name: ${name}`);

  const server = new URL(url);
  server.pathname = "/postgres";
  server.search = "";
  try {
    // Prisma 7 reads the address from prisma.config.ts, which takes DATABASE_URL.
    execSync("npx prisma db execute --stdin", {
      input: `CREATE DATABASE "${name}";`,
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: server.toString() },
    });
  } catch (err) {
    const output = String((err as { stderr?: Buffer }).stderr ?? err);
    if (!/already exists/i.test(output)) throw err;
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: url,
    NODE_ENV: "test",
    AUTH_DEV_LOGIN: "1",
    EMBEDDINGS_PROVIDER: "stub",
  };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npm run db:seed", { env, stdio: "pipe" });
  return url;
}

/** Vitest and Playwright global setup. */
export default async function globalSetup() {
  process.env.DATABASE_URL = await prepareTestDatabase();
}
