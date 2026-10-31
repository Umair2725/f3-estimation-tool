import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle, only for the container image (the Dockerfile sets
  // NEXT_OUTPUT_STANDALONE=1). Local `npm start` uses the normal build.
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  cacheComponents: true,
  // The export reads Folio3's Excel template at runtime (specs/excel-export).
  outputFileTracingIncludes: {
    "/estimates/[id]/export": ["./docs/templates/Empty_Estimation_Sheet.xlsx"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
