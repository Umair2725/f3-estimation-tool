import { defineConfig } from "prisma/config";

// Load .env for local CLI use (migrate, studio). In containers and CI the variables are
// already set and no .env file exists.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
