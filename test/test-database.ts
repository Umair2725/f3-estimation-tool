// Which database the automated tests use. Locally they never touch the database in
// DATABASE_URL (it holds people's real work): they use `f3_test` on the same server, or
// TEST_DATABASE_URL when it is set. CI gets a throwaway database, so it uses DATABASE_URL.

export const TEST_DATABASE_NAME = "f3_test";

export function testDatabaseUrl(env: Record<string, string | undefined>): string {
  if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;
  if (!env.DATABASE_URL) {
    throw new Error("Tests need DATABASE_URL (start the db with `docker compose up -d db`).");
  }
  if (env.CI) return env.DATABASE_URL;
  const url = new URL(env.DATABASE_URL);
  url.pathname = `/${TEST_DATABASE_NAME}`;
  return url.toString();
}
