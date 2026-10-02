import { getConfig } from "@/lib/config";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Структурный логгер в JSON — совместим со сборщиками логов (Loki, CloudWatch, Datadog).
 * Никаких секретов в логи: значения фильтруются по имени ключа.
 */
const REDACTED_KEYS = /(token|secret|password|cookie|apikey|api_key|authorization|database_url)/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[deep]";
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => sanitize(entry, depth + 1));
  if (value instanceof Error) {
    const extra: Record<string, unknown> = {};
    // Drizzle оборачивает ошибки драйвера: настоящая причина лежит в cause.
    const cause = (value as { cause?: unknown }).cause;
    if (cause && cause !== value) extra.cause = sanitize(cause, depth + 1);
    for (const key of ["code", "detail", "hint", "severity"] as const) {
      const field = (value as unknown as Record<string, unknown>)[key];
      if (field !== undefined && field !== null) extra[key] = sanitize(field, depth + 1);
    }
    return {
      name: value.name,
      message: value.message.length > 800 ? `${value.message.slice(0, 800)}…` : value.message,
      stack: value.stack?.split("\n").slice(0, 4).join("\n"),
      ...extra,
    };
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = REDACTED_KEYS.test(key) ? "[redacted]" : sanitize(entry, depth + 1);
    }
    return result;
  }
  return value;
}

function write(level: Level, message: string, context?: Record<string, unknown>): void {
  const threshold = LEVEL_WEIGHT[getConfig().LOG_LEVEL];
  if (LEVEL_WEIGHT[level] < threshold) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(context ? (sanitize(context) as Record<string, unknown>) : {}),
  };

  const line = JSON.stringify(payload);
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
  child: (base: Record<string, unknown>) => ({
    debug: (message: string, context?: Record<string, unknown>) => write("debug", message, { ...base, ...context }),
    info: (message: string, context?: Record<string, unknown>) => write("info", message, { ...base, ...context }),
    warn: (message: string, context?: Record<string, unknown>) => write("warn", message, { ...base, ...context }),
    error: (message: string, context?: Record<string, unknown>) => write("error", message, { ...base, ...context }),
  }),
};
