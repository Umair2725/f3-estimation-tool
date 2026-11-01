import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle, only for the container image (the Dockerfile sets
  // NEXT_OUTPUT_STANDALONE=1). Local `npm start` uses the normal build.
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  cacheComponents: true,
  // The export reads Folio3's Excel template at runtime (specs/excel-export).
  outputFileTracingIncludes: {
    "/estimates/[id]/export": ["./docs/templates/Empty_Estimation_Sheet.xlsx"],
    // The local embedding model's native runtime is loaded dynamically, so tracing misses it
    // (specs/feature-matching). Linux x64 CPU only: the container's platform, without the
    // CUDA and TensorRT providers.
    "/**": [
      "./node_modules/onnxruntime-common/**/*",
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v*/linux/x64/onnxruntime_binding.node",
      "./node_modules/onnxruntime-node/bin/napi-v*/linux/x64/libonnxruntime.so*",
    ],
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
