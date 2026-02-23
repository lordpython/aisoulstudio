/**
 * Agent Metrics
 * 
 * Performance metrics collection for the Agent Director Service.
 * Extracted from agentDirectorService.ts for modularity.
 */

import { ExtractionMethod } from '../jsonExtractor';

/**
 * Performance metrics for the Agent Director Service.
 */
export interface AgentDirectorMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageProcessingTimeMs: number;
    jsonExtractionSuccessRate: number;
    fallbackUsageRate: number;
    lastRequestTimestamp: string | null;
    extractionMethodBreakdown: Map<ExtractionMethod, number>;
}

/**
 * Metrics collector for the Agent Director Service.
 */
class AgentDirectorMetricsCollector {
    private metrics: AgentDirectorMetrics;

    constructor() {
        this.metrics = this.initializeMetrics();
    }

    private initializeMetrics(): AgentDirectorMetrics {
        return {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageProcessingTimeMs: 0,
            jsonExtractionSuccessRate: 0,
            fallbackUsageRate: 0,
            lastRequestTimestamp: null,
            extractionMethodBreakdown: new Map()
        };
    }

    recordRequest(success: boolean, processingTimeMs: number): void {
        this.metrics.totalRequests++;
        this.metrics.lastRequestTimestamp = new Date().toISOString();

        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
        }

        // Update average processing time
        const totalTime = this.metrics.averageProcessingTimeMs * (this.metrics.totalRequests - 1) + processingTimeMs;
        this.metrics.averageProcessingTimeMs = totalTime / this.metrics.totalRequests;
    }

    recordExtractionMethod(method: ExtractionMethod): void {
        const current = this.metrics.extractionMethodBreakdown.get(method) || 0;
        this.metrics.extractionMethodBreakdown.set(method, current + 1);
    }

    recordFallbackUsage(): void {
        // Update fallback usage rate
        const totalExtractions = Array.from(this.metrics.extractionMethodBreakdown.values())
            .reduce((sum, count) => sum + count, 0);
        const fallbackCount = this.metrics.extractionMethodBreakdown.get(ExtractionMethod.FALLBACK_TEXT) || 0;

        if (totalExtractions > 0) {
            this.metrics.fallbackUsageRate = fallbackCount / totalExtractions;
        }
    }

    updateExtractionSuccessRate(successCount: number, totalCount: number): void {
        if (totalCount > 0) {
            this.metrics.jsonExtractionSuccessRate = successCount / totalCount;
        }
    }

    getMetrics(): AgentDirectorMetrics {
        return {
            ...this.metrics,
            extractionMethodBreakdown: new Map(this.metrics.extractionMethodBreakdown)
        };
    }

    getMetricsSummary(): {
        successRate: number;
        averageTimeMs: number;
        fallbackRate: number;
        mostUsedMethod: ExtractionMethod | null;
    } {
        let mostUsedMethod: ExtractionMethod | null = null;
        let maxCount = 0;

        for (const [method, count] of this.metrics.extractionMethodBreakdown) {
            if (count > maxCount) {
                maxCount = count;
                mostUsedMethod = method;
            }
        }

        return {
            successRate: this.metrics.totalRequests > 0
                ? this.metrics.successfulRequests / this.metrics.totalRequests
                : 0,
            averageTimeMs: this.metrics.averageProcessingTimeMs,
            fallbackRate: this.metrics.fallbackUsageRate,
            mostUsedMethod
        };
    }

    reset(): void {
        this.metrics = this.initializeMetrics();
    }
}

// Singleton instance
export const agentMetrics = new AgentDirectorMetricsCollector();
