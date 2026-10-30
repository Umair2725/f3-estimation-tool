import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

// One client (and connection pool) per server process. In development, Next.js reloads
// modules on every change, so the client is kept on globalThis to avoid leaking pools.
const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForDb.prisma) {
    const adapter = new PrismaPg({
      connectionString: getEnv().DATABASE_URL,
      connectionTimeoutMillis: 3000,
    });
    globalForDb.prisma = new PrismaClient({ adapter });
  }
  return globalForDb.prisma;
}
