/**
 * Logging Service
 *
 * Centralized logging with:
 * - Log levels (debug, info, warn, error)
 * - Contextual prefixes
 * - Environment-aware output (verbose in dev, minimal in prod)
 * - Structured log format
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  context: string;
  message: string;
  data?: unknown;
}

type LogCallback = (entry: LogEntry) => void;

class Logger {
  private level: LogLevel;
  private context: string;
  private callbacks: LogCallback[] = [];

  constructor(context: string = 'App', level?: LogLevel) {
    this.context = context;
    this.level = level ?? this.getDefaultLevel();
  }

  private getDefaultLevel(): LogLevel {
    // In production, only show warnings and errors
    // In development, show everything
    if (typeof window !== 'undefined') {
      return import.meta.env?.PROD ? LogLevel.WARN : LogLevel.DEBUG;
    }
    return process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (level < this.level) return;

    const entry: LogEntry = {
      level,
      timestamp: this.formatTimestamp(),
      context: this.context,
      message,
      data,
    };

    // Notify callbacks (for external logging services)
    this.callbacks.forEach(cb => cb(entry));

    // Console output
    const prefix = `[${this.context}]`;
    const args = data !== undefined ? [prefix, message, data] : [prefix, message];

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(...args);
        break;
      case LogLevel.INFO:
        console.info(...args);
        break;
      case LogLevel.WARN:
        console.warn(...args);
        break;
      case LogLevel.ERROR:
        console.error(...args);
        break;
    }
  }

  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, message, data);
  }

  /** Create a child logger with a sub-context */
  child(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`, this.level);
  }

  /** Set the minimum log level */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /** Add a callback for external logging services */
  addCallback(callback: LogCallback): void {
    this.callbacks.push(callback);
  }

  /** Remove a callback */
  removeCallback(callback: LogCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }
}

// Factory function to create loggers with different contexts
export function createLogger(context: string): Logger {
  return new Logger(context);
}

// Default application logger
export const logger = new Logger('App');

// Pre-configured loggers for common contexts
export const agentLogger = new Logger('Agent');
export const serverLogger = new Logger('Server');
export const exportLogger = new Logger('Export');
export const ffmpegLogger = new Logger('FFmpeg');
export const sunoLogger = new Logger('Suno');
export const geminiLogger = new Logger('Gemini');

export default logger;
