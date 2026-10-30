import { logger as defaultLogger, type Logger } from "@/lib/logger";

/** What the health check needs from the database; mocked in tests. */
export type DatabaseProbe = {
  ping(): Promise<void>;
  hasExtension(name: string): Promise<boolean>;
};

type ComponentStatus = { status: "ok" } | { status: "error"; message: string };

export type HealthBody = {
  status: "ok" | "error";
  version: string;
  time: string;
  database: ComponentStatus;
};

export type HealthResult = { httpStatus: 200 | 503; body: HealthBody };

export const REQUIRED_EXTENSION = "vector";
const UNAVAILABLE = "database unavailable";
const EXTENSION_MISSING = "required extension missing";

class TimeoutError extends Error {}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function checkDatabase(
  getProbe: () => DatabaseProbe,
  timeoutMs: number,
  log: Logger,
): Promise<ComponentStatus> {
  try {
    const hasExtension = await withTimeout(
      (async () => {
        const probe = getProbe();
        await probe.ping();
        return probe.hasExtension(REQUIRED_EXTENSION);
      })(),
      timeoutMs,
    );
    if (!hasExtension) {
      log.error("health check: required database extension missing", {
        extension: REQUIRED_EXTENSION,
      });
      return { status: "error", message: EXTENSION_MISSING };
    }
    return { status: "ok" };
  } catch (err) {
    // Full detail goes to the server log only; the response stays generic.
    log.error("health check: database check failed", { err });
    return { status: "error", message: UNAVAILABLE };
  }
}

export async function checkHealth(options: {
  getProbe: () => DatabaseProbe;
  version: string;
  timeoutMs?: number;
  now?: () => Date;
  log?: Logger;
}): Promise<HealthResult> {
  const {
    getProbe,
    version,
    timeoutMs = 3000,
    now = () => new Date(),
    log = defaultLogger,
  } = options;
  const database = await checkDatabase(getProbe, timeoutMs, log);
  const ok = database.status === "ok";
  return {
    httpStatus: ok ? 200 : 503,
    body: { status: ok ? "ok" : "error", version, time: now().toISOString(), database },
  };
}
