// Minimal JSON-lines logger. One line per event so CloudWatch and similar tools can parse it.

export type LogLevel = "debug" | "info" | "warn" | "error";

const rank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

type Context = Record<string, unknown>;
type Writer = (line: string, level: LogLevel) => void;

export type Logger = Record<LogLevel, (msg: string, context?: Context) => void>;

const defaultWriter: Writer = (line, level) => {
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
};

function serialize(value: unknown): unknown {
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack };
  return value;
}

function isLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && value in rank;
}

export function createLogger(options: { level?: string; write?: Writer } = {}): Logger {
  const min = isLevel(options.level) ? options.level : "info";
  const write = options.write ?? defaultWriter;

  const log =
    (level: LogLevel) =>
    (msg: string, context: Context = {}) => {
      if (rank[level] < rank[min]) return;
      const fields = Object.fromEntries(Object.entries(context).map(([k, v]) => [k, serialize(v)]));
      write(JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields }), level);
    };

  return { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
}

export const logger = createLogger({ level: process.env.LOG_LEVEL });
