/**
 * Agent Logger
 * 
 * Logging infrastructure for the Agent Director Service.
 * Extracted from agentDirectorService.ts for modularity.
 */

import { type ParseError, type ExtractionSuccess, type FallbackNotification } from '../jsonExtractor';

/**
 * Logging levels for the Agent Director Service.
 */
export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}

/**
 * Log entry structure for detailed logging.
 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
    duration?: number;
}

/**
 * Logger for the Agent Director Service.
 */
class AgentDirectorLogger {
    private logs: LogEntry[] = [];
    private maxLogs: number = 1000;
    private enabled: boolean = true;

    log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
        if (!this.enabled) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            context
        };

        this.logs.push(entry);

        // Trim old logs if necessary
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // Also output to console
        const prefix = `[AgentDirector] [${level.toUpperCase()}]`;
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(prefix, message, context || '');
                break;
            case LogLevel.INFO:
                console.log(prefix, message, context || '');
                break;
            case LogLevel.WARN:
                console.warn(prefix, message, context || '');
                break;
            case LogLevel.ERROR:
                console.error(prefix, message, context || '');
                break;
        }
    }

    debug(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevel.DEBUG, message, context);
    }

    info(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevel.INFO, message, context);
    }

    warn(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevel.WARN, message, context);
    }

    error(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevel.ERROR, message, context);
    }

    /**
     * Log detailed error information for JSON extraction failures.
     */
    logExtractionError(parseError: ParseError): void {
        this.error('JSON extraction failed', {
            type: parseError.type,
            message: parseError.message,
            contentLength: parseError.contentLength,
            contentPreview: parseError.originalContent.substring(0, 500),
            attemptedMethods: parseError.attemptedMethods,
            failureReasons: parseError.failureReasons,
            suggestions: parseError.suggestions
        });
    }

    /**
     * Log successful extraction with method tracking.
     */
    logExtractionSuccess(success: ExtractionSuccess): void {
        this.info('JSON extraction succeeded', {
            method: success.method,
            confidence: success.confidence,
            retryCount: success.retryCount,
            processingTimeMs: success.processingTimeMs
        });
    }

    /**
     * Log fallback processing usage.
     */
    logFallbackUsage(notification: FallbackNotification): void {
        this.warn('Fallback processing used', {
            message: notification.message,
            extractedPromptCount: notification.extractedPromptCount,
            reducedFunctionality: notification.reducedFunctionality
        });
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    getRecentLogs(count: number = 50): LogEntry[] {
        return this.logs.slice(-count);
    }

    clearLogs(): void {
        this.logs = [];
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }
}

// Singleton instance
export const agentLogger = new AgentDirectorLogger();
