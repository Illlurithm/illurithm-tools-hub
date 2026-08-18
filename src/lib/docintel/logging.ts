/** Minimal structured logger + stage timing for the document engine. */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  at: number;
  level: LogLevel;
  stage: string;
  message: string;
  data?: Record<string, unknown>;
};

export class EngineLogger {
  private entries: LogEntry[] = [];
  private readonly verbose: boolean;

  constructor(verbose = import.meta.env.DEV) {
    this.verbose = verbose;
  }

  log(level: LogLevel, stage: string, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = { at: Date.now(), level, stage, message, ...(data ? { data } : {}) };
    this.entries.push(entry);
    if (this.verbose || level === "error" || level === "warn") {
      const line = `[docintel:${stage}] ${message}`;
      if (level === "error") console.error(line, data ?? "");
      else if (level === "warn") console.warn(line, data ?? "");
      else console.info(line, data ?? "");
    }
  }

  debug = (stage: string, message: string, data?: Record<string, unknown>) =>
    this.log("debug", stage, message, data);
  info = (stage: string, message: string, data?: Record<string, unknown>) =>
    this.log("info", stage, message, data);
  warn = (stage: string, message: string, data?: Record<string, unknown>) =>
    this.log("warn", stage, message, data);
  error = (stage: string, message: string, data?: Record<string, unknown>) =>
    this.log("error", stage, message, data);

  async time<T>(stage: string, run: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      const result = await run();
      this.info(stage, "completed", { ms: Math.round(performance.now() - started) });
      return result;
    } catch (error) {
      this.error(stage, error instanceof Error ? error.message : "stage failed", {
        ms: Math.round(performance.now() - started),
      });
      throw error;
    }
  }

  all() {
    return [...this.entries];
  }
}
