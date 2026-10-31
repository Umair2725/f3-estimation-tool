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
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["**/*.int.test.ts"],
        },
      },
      {
        // Integration tests run against the real database (DATABASE_URL), one file at a time.
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.int.test.ts"],
          setupFiles: ["./test/integration-setup.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
