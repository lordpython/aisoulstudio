/**
 * Tool Registry — minimal storage for the production agent's LangChain tools.
 *
 * Originally designed for dynamic dispatch with dependency-graph validation,
 * but the architecture moved to a fixed supervisor -> subagent pattern that
 * never needed any of that machinery. This module now keeps only the surface
 * that production actually consumes:
 *
 *   - register(definition)        — populate the registry at startup
 *   - getAllToolInstances()       — bind to the LangChain model
 *   - getSummary()                — log line at boot
 *   - clear() / size              — used by tests for isolation
 *
 * The dependency-graph methods (canExecute, validateExecutionOrder,
 * getExecutableTools, isValidGroupTransition, etc.) and TOOL_GROUP_ORDER
 * were deleted in this commit. None had production callers; all were
 * tested but never exercised at runtime. If dynamic tool sequencing
 * is ever needed, the registry can grow back — this is a strict reduction
 * of dead surface.
 */

import { StructuredTool } from "@langchain/core/tools";

/**
 * Tool groups for organizing production agent capabilities.
 * Used as a tag on each ToolDefinition for the boot-time summary log.
 */
export enum ToolGroup {
    /** Import tools for external content (YouTube, audio files) */
    IMPORT = "IMPORT",
    /** Content planning tools (plan, narrate, validate) */
    CONTENT = "CONTENT",
    /** Media generation tools (visuals, animate, music, sfx) */
    MEDIA = "MEDIA",
    /** Enhancement tools (background removal, style transfer, audio mixing) */
    ENHANCEMENT = "ENHANCEMENT",
    /** Export tools (subtitles, video export) */
    EXPORT = "EXPORT",
}

/**
 * Tool definition with group assignment.
 *
 * The `dependencies` field is preserved on the type for backward-compat
 * with createToolDefinition signatures, but the registry no longer enforces
 * dependency ordering — the supervisor's await chain is the source of truth.
 */
export interface ToolDefinition {
    /** Unique tool name */
    name: string;
    /** Group this tool belongs to */
    group: ToolGroup;
    /** The LangChain StructuredTool instance */
    tool: StructuredTool;
    /** Optional list of tool names that conceptually depend on this one. Informational only. */
    dependencies?: string[];
    /** Optional description override for system prompt */
    description?: string;
}

interface RegistryEntry extends ToolDefinition {
    registeredAt: number;
}

/**
 * Tool Registry — thin Map wrapper around StructuredTool instances.
 */
class ToolRegistry {
    private tools: Map<string, RegistryEntry> = new Map();

    /**
     * Register a tool with the registry.
     * @throws Error if a tool with the same name already exists.
     */
    register(definition: ToolDefinition): void {
        if (this.tools.has(definition.name)) {
            throw new Error(`Tool "${definition.name}" is already registered`);
        }

        this.tools.set(definition.name, {
            ...definition,
            registeredAt: Date.now(),
        });
    }

    /** Get every registered LangChain tool instance, for binding to a model. */
    getAllToolInstances(): StructuredTool[] {
        return Array.from(this.tools.values()).map(entry => entry.tool);
    }

    /** Boot-time log line summarizing registered tools by group. */
    getSummary(): Record<string, { count: number; tools: string[] }> {
        const summary: Record<string, { count: number; tools: string[] }> = {};
        for (const group of Object.values(ToolGroup)) {
            summary[group] = { count: 0, tools: [] };
        }
        for (const entry of this.tools.values()) {
            const bucket = summary[entry.group];
            if (bucket) {
                bucket.count++;
                bucket.tools.push(entry.name);
            }
        }
        return summary;
    }

    /** Drop every registered tool. Used by tests to reset between cases. */
    clear(): void {
        this.tools.clear();
    }

    /** Total number of registered tools. */
    get size(): number {
        return this.tools.size;
    }
}

/** Singleton instance for the production agent. */
export const toolRegistry = new ToolRegistry();

/**
 * Build a ToolDefinition for cleaner registration sites.
 */
export function createToolDefinition(
    name: string,
    group: ToolGroup,
    tool: StructuredTool,
    dependencies?: string[],
): ToolDefinition {
    return { name, group, tool, dependencies };
}
