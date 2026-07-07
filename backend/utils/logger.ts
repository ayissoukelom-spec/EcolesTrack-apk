/**
 * Production-ready Structured Logger
 * Emulates Pino/Winston output formats with request ID tracking and audit levels.
 */

export type LogLevel = "INFO" | "WARN" | "ERROR" | "AUDIT" | "DEBUG";

export class Logger {
  private context: string;

  constructor(context: string = "System") {
    this.context = context;
  }

  private log(level: LogLevel, message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const payload = {
      timestamp,
      level,
      context: this.context,
      message,
      ...(meta || {}),
    };

    // Output JSON format in production, readable in development
    if (process.env.NODE_ENV === "production") {
      console.log(JSON.stringify(payload));
    } else {
      const metaStr = meta ? ` | Meta: ${JSON.stringify(meta)}` : "";
      const color = 
        level === "ERROR" ? "\x1b[31m" :
        level === "WARN" ? "\x1b[33m" :
        level === "AUDIT" ? "\x1b[36m" :
        "\x1b[32m";
      const reset = "\x1b[0m";
      console.log(`[${timestamp}] [${color}${level}${reset}] [${this.context}] ${message}${metaStr}`);
    }
  }

  public info(message: string, meta?: any) {
    this.log("INFO", message, meta);
  }

  public warn(message: string, meta?: any) {
    this.log("WARN", message, meta);
  }

  public error(message: string, error?: any, meta?: any) {
    const errMeta = error instanceof Error 
      ? { errorName: error.name, errorMessage: error.message, stack: error.stack }
      : { error };
    this.log("ERROR", message, { ...errMeta, ...meta });
  }

  public audit(action: string, actor: string, details: any, status: "SUCCESS" | "FAILURE") {
    this.log("AUDIT", `AUDIT TRIAL: ${action} by ${actor} [${status}]`, {
      audit: { action, actor, details, status }
    });
  }

  public debug(message: string, meta?: any) {
    if (process.env.NODE_ENV !== "production") {
      this.log("DEBUG", message, meta);
    }
  }
}

export const logger = new Logger("Global");
