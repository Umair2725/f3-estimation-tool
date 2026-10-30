import type { Instrumentation } from "next";
import { logger } from "@/lib/logger";

// Writes every server-side request error to the JSON log (app-shell spec: errors are logged,
// never shown to the user). Request headers are left out on purpose: they can hold cookies.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  logger.error("request error", {
    err,
    digest,
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
