// Startup check: run before the server starts. Exits with code 1 and names each
// missing or invalid setting, without printing values.
// Run with Node directly (type stripping): npm run check-env
import { formatProblems, validateEnv } from "../src/lib/env-schema.ts";

const result = validateEnv(process.env);

if (!result.ok) {
  console.error(formatProblems(result.problems));
  process.exit(1);
}

console.log("Configuration OK");
