type Level = "debug" | "info" | "warn" | "error";
type FieldValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, FieldValue>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Field names that may carry user content, credentials, or images. Their values are never written.
const SENSITIVE_KEY =
  /(text|prompt|output|content|body|headline|article|caption|note|name|email|phone|token|secret|password|authorization|cookie|key|image|selfie|photo|url|path|birthday|lat|lng|address|ip)/i;
// Keys that look sensitive by name but are safe metadata.
const ALLOWED_KEYS = new Set([
  "requestId",
  "routeId",
  "method",
  "status",
  "durationMs",
  "errorName",
  "jobId",
  "attempt",
]);
const MAX_STRING = 200;

function currentLevel(): Level {
  const v = process.env.LOG_LEVEL;
  return v === "debug" || v === "info" || v === "warn" || v === "error" ? v : "info";
}

export function sanitizeFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (!ALLOWED_KEYS.has(key) && SENSITIVE_KEY.test(key) && !key.endsWith("Id") && !key.endsWith("Count")) {
      out[key] = "[redacted]";
    } else if (typeof value === "string" && value.length > MAX_STRING) {
      out[key] = `${value.slice(0, MAX_STRING)}…[truncated]`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function write(level: Level, event: string, fields: LogFields = {}): void {
  if (LEVELS[level] < LEVELS[currentLevel()]) return;
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...sanitizeFields(fields) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

/**
 * Structured, metadata-only logger. Pass ids, statuses, counts, and timings, never user text,
 * images, prompts, model output, or tokens. Sensitive-looking keys are redacted as a backstop.
 */
export const log = {
  debug: (event: string, fields?: LogFields) => write("debug", event, fields),
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};
