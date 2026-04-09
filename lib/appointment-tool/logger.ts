const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;

type LogLevel = keyof typeof LEVELS;

const currentLevel = LEVELS[(process.env.LOG_LEVEL as LogLevel | undefined) ?? "info"];

function log(level: LogLevel, ...args: unknown[]) {
  if (LEVELS[level] > currentLevel) {
    return;
  }

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [appointment-tool:${level.toUpperCase()}]`;
  const consoleMethod =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleMethod(prefix, ...args);
}

export const appointmentToolLogger = {
  error: (...args: unknown[]) => log("error", ...args),
  warn: (...args: unknown[]) => log("warn", ...args),
  info: (...args: unknown[]) => log("info", ...args),
  debug: (...args: unknown[]) => log("debug", ...args),
};
