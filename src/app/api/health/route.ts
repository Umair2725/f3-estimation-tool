import { connection } from "next/server";
import packageJson from "../../../../package.json";
import { getDb } from "@/server/db";
import { checkHealth, type DatabaseProbe } from "@/server/health";

function prismaProbe(): DatabaseProbe {
  const db = getDb();
  return {
    async ping() {
      await db.$queryRaw`SELECT 1`;
    },
    async hasExtension(name) {
      const rows = await db.$queryRaw<{ found: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = ${name}) AS "found"`;
      return rows[0]?.found === true;
    },
  };
}

// GET /api/health - unauthenticated; reports app and database status. See specs/system-health.
export async function GET() {
  // Always run at request time, never prerendered or cached.
  await connection();
  const { httpStatus, body } = await checkHealth({
    getProbe: prismaProbe,
    version: packageJson.version,
  });
  return Response.json(body, { status: httpStatus, headers: { "Cache-Control": "no-store" } });
}
