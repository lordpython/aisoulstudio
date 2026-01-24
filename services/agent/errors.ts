/**
 * Agent Error Types
 * 
 * Standardized error classes for agent tools to enable
 * better error handling and decision making in the orchestrator.
 */

export class AgentToolError extends Error {
    constructor(message: string, public readonly toolName: string, public readonly code: string = "UNKNOWN_ERROR") {
        super(message);
        this.name = "AgentToolError";
    }
}

export class ValidationError extends AgentToolError {
    constructor(message: string, toolName: string) {
        super(message, toolName, "VALIDATION_ERROR");
        this.name = "ValidationError";
    }
}

export class ServiceError extends AgentToolError {
    constructor(message: string, toolName: string, public readonly serviceName: string) {
        super(message, toolName, "SERVICE_ERROR");
        this.name = "ServiceError";
    }
}

export class RateLimitError extends AgentToolError {
    constructor(message: string, toolName: string, public readonly serviceName: string, public readonly retryAfter?: number) {
        super(message, toolName, "RATE_LIMIT_ERROR");
        this.name = "RateLimitError";
    }
}

export class ResourceNotFoundError extends AgentToolError {
    constructor(message: string, toolName: string, public readonly resourceId: string) {
        super(message, toolName, "RESOURCE_NOT_FOUND");
        this.name = "ResourceNotFoundError";
    }
}
