import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` throws outside a React Server Components build; tests run server code directly.
  "server-only": fileURLToPath(new URL("./test/empty-module.ts", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "test/**/*.test.ts"],
          exclude: ["**/*.int.test.ts"],
        },
      },
      {
        // Integration tests run against the tests' own database (test/test-database.ts), one file
        // at a time; global setup creates, migrates and seeds it first.
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.int.test.ts"],
          globalSetup: ["./test/prepare-test-database.ts"],
          setupFiles: ["./test/integration-setup.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
