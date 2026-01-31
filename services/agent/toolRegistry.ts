/**
 * Tool Registry - Tool Group Management for Production Agent
 * 
 * Provides a centralized registry for organizing LangChain tools into logical groups
 * with dependency ordering for the Enhanced Production Agent.
 * 
 * Tool Group Dependencies:
 * IMPORT → CONTENT → MEDIA → ENHANCEMENT → EXPORT
 * 
 * Requirements: 12.1, 12.2, 12.4
 */

import { StructuredTool } from "@langchain/core/tools";

/**
 * Tool groups for organizing production agent capabilities.
 * Groups follow a dependency order: IMPORT → CONTENT → MEDIA → ENHANCEMENT → EXPORT
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
 * Defines the execution order of tool groups.
 * Tools in earlier groups must complete before tools in later groups can execute.
 */
export const TOOL_GROUP_ORDER: ToolGroup[] = [
  ToolGroup.IMPORT,
  ToolGroup.CONTENT,
  ToolGroup.MEDIA,
  ToolGroup.ENHANCEMENT,
  ToolGroup.EXPORT,
];

/**
 * Tool definition with group assignment and optional dependencies.
 */
export interface ToolDefinition {
  /** Unique tool name */
  name: string;
  /** Group this tool belongs to */
  group: ToolGroup;
  /** The LangChain StructuredTool instance */
  tool: StructuredTool;
  /** Optional list of tool names that must run before this tool */
  dependencies?: string[];
  /** Optional description override for system prompt */
  description?: string;
}

/**
 * Registry entry stored internally.
 */
interface RegistryEntry extends ToolDefinition {
  registeredAt: number;
}

/**
 * Tool Registry for managing production agent tools.
 * Provides registration, lookup, and dependency validation.
 */
class ToolRegistry {
  private tools: Map<string, RegistryEntry> = new Map();
  private groupIndex: Map<ToolGroup, Set<string>> = new Map();

  constructor() {
    // Initialize group index
    for (const group of Object.values(ToolGroup)) {
      this.groupIndex.set(group, new Set());
    }
  }

  /**
   * Register a tool with the registry.
   * @param definition Tool definition including name, group, and tool instance
   * @throws Error if tool with same name already exists
   */
  register(definition: ToolDefinition): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" is already registered`);
    }

    const entry: RegistryEntry = {
      ...definition,
      registeredAt: Date.now(),
    };

    this.tools.set(definition.name, entry);
    this.groupIndex.get(definition.group)?.add(definition.name);
  }

  /**
   * Register multiple tools at once.
   * @param definitions Array of tool definitions
   */
  registerAll(definitions: ToolDefinition[]): void {
    for (const def of definitions) {
      this.register(def);
    }
  }

  /**
   * Unregister a tool from the registry.
   * @param name Tool name to remove
   * @returns true if tool was removed, false if not found
   */
  unregister(name: string): boolean {
    const entry = this.tools.get(name);
    if (!entry) return false;

    this.groupIndex.get(entry.group)?.delete(name);
    this.tools.delete(name);
    return true;
  }

  /**
   * Get a tool by name.
   * @param name Tool name
   * @returns Tool definition or undefined if not found
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get the LangChain tool instance by name.
   * @param name Tool name
   * @returns StructuredTool instance or undefined
   */
  getToolInstance(name: string): StructuredTool | undefined {
    return this.tools.get(name)?.tool;
  }

  /**
   * Get all tools in a specific group.
   * @param group Tool group
   * @returns Array of tool definitions in the group
   */
  getToolsByGroup(group: ToolGroup): ToolDefinition[] {
    const toolNames = this.groupIndex.get(group) || new Set();
    return Array.from(toolNames)
      .map(name => this.tools.get(name)!)
      .filter(Boolean);
  }

  /**
   * Get all tool instances in a specific group.
   * @param group Tool group
   * @returns Array of StructuredTool instances
   */
  getToolInstancesByGroup(group: ToolGroup): StructuredTool[] {
    return this.getToolsByGroup(group).map(def => def.tool);
  }

  /**
   * Get all registered tools.
   * @returns Array of all tool definitions
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tool instances for binding to a model.
   * @returns Array of all StructuredTool instances
   */
  getAllToolInstances(): StructuredTool[] {
    return Array.from(this.tools.values()).map(entry => entry.tool);
  }

  /**
   * Get the group a tool belongs to.
   * @param name Tool name
   * @returns ToolGroup or undefined if tool not found
   */
  getToolGroup(name: string): ToolGroup | undefined {
    return this.tools.get(name)?.group;
  }

  /**
   * Check if a tool can execute based on group dependencies.
   * A tool can execute if all tools in preceding groups have completed.
   * 
   * @param toolName Name of the tool to check
   * @param completedGroups Set of groups that have completed execution
   * @returns true if the tool can execute, false otherwise
   */
  canExecute(toolName: string, completedGroups: Set<ToolGroup>): boolean {
    const entry = this.tools.get(toolName);
    if (!entry) return false;

    const toolGroupIndex = TOOL_GROUP_ORDER.indexOf(entry.group);
    
    // Check all preceding groups are complete
    for (let i = 0; i < toolGroupIndex; i++) {
      const precedingGroup = TOOL_GROUP_ORDER[i];
      if (!precedingGroup) continue;
      // Skip IMPORT group if no import tools were used (optional group)
      if (precedingGroup === ToolGroup.IMPORT && this.getToolsByGroup(ToolGroup.IMPORT).length === 0) {
        continue;
      }
      if (!completedGroups.has(precedingGroup)) {
        return false;
      }
    }

    // Check explicit dependencies
    if (entry.dependencies) {
      for (const dep of entry.dependencies) {
        const depEntry = this.tools.get(dep);
        if (depEntry && !completedGroups.has(depEntry.group)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validate that a sequence of tool names respects group dependencies.
   * 
   * @param toolSequence Array of tool names in execution order
   * @returns Validation result with isValid flag and any violations
   */
  validateExecutionOrder(toolSequence: string[]): {
    isValid: boolean;
    violations: Array<{
      tool: string;
      expectedAfter: ToolGroup[];
      actualPosition: number;
    }>;
  } {
    const violations: Array<{
      tool: string;
      expectedAfter: ToolGroup[];
      actualPosition: number;
    }> = [];

    const seenGroups = new Set<ToolGroup>();
    const groupFirstSeen = new Map<ToolGroup, number>();

    for (let i = 0; i < toolSequence.length; i++) {
      const toolName = toolSequence[i];
      if (!toolName) continue;
      const entry = this.tools.get(toolName);
      
      if (!entry) continue;

      const currentGroupIndex = TOOL_GROUP_ORDER.indexOf(entry.group);
      
      // Track first occurrence of each group
      if (!groupFirstSeen.has(entry.group)) {
        groupFirstSeen.set(entry.group, i);
      }

      // Check if any later group was seen before this tool's group
      for (let j = currentGroupIndex + 1; j < TOOL_GROUP_ORDER.length; j++) {
        const laterGroup = TOOL_GROUP_ORDER[j];
        if (!laterGroup) continue;
        if (seenGroups.has(laterGroup)) {
          violations.push({
            tool: toolName,
            expectedAfter: TOOL_GROUP_ORDER.slice(0, currentGroupIndex),
            actualPosition: i,
          });
          break;
        }
      }

      seenGroups.add(entry.group);
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  /**
   * Get the required preceding groups for a tool.
   * @param toolName Tool name
   * @returns Array of groups that must complete before this tool
   */
  getRequiredPrecedingGroups(toolName: string): ToolGroup[] {
    const entry = this.tools.get(toolName);
    if (!entry) return [];

    const toolGroupIndex = TOOL_GROUP_ORDER.indexOf(entry.group);
    return TOOL_GROUP_ORDER.slice(0, toolGroupIndex);
  }

  /**
   * Get tools that can execute given the current completed groups.
   * @param completedGroups Set of groups that have completed
   * @returns Array of tool names that can now execute
   */
  getExecutableTools(completedGroups: Set<ToolGroup>): string[] {
    const executable: string[] = [];
    
    for (const [name] of this.tools) {
      if (this.canExecute(name, completedGroups)) {
        executable.push(name);
      }
    }

    return executable;
  }

  /**
   * Get a summary of registered tools by group for logging/debugging.
   * @returns Object mapping group names to tool counts and names
   */
  getSummary(): Record<string, { count: number; tools: string[] }> {
    const summary: Record<string, { count: number; tools: string[] }> = {};

    for (const group of Object.values(ToolGroup)) {
      const tools = Array.from(this.groupIndex.get(group) || []);
      summary[group] = {
        count: tools.length,
        tools,
      };
    }

    return summary;
  }

  /**
   * Clear all registered tools.
   */
  clear(): void {
    this.tools.clear();
    for (const group of Object.values(ToolGroup)) {
      this.groupIndex.set(group, new Set());
    }
  }

  /**
   * Get the total number of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }
}

// Singleton instance for the production agent
export const toolRegistry = new ToolRegistry();

// --- Helper Functions ---

/**
 * Check if a tool group transition is valid (respects dependency order).
 * @param fromGroup Source group (or null if starting)
 * @param toGroup Target group
 * @returns true if transition is valid
 */
export function isValidGroupTransition(
  fromGroup: ToolGroup | null,
  toGroup: ToolGroup
): boolean {
  if (fromGroup === null) {
    // Starting fresh - can only start with IMPORT or CONTENT
    return toGroup === ToolGroup.IMPORT || toGroup === ToolGroup.CONTENT;
  }

  const fromIndex = TOOL_GROUP_ORDER.indexOf(fromGroup);
  const toIndex = TOOL_GROUP_ORDER.indexOf(toGroup);

  // Can stay in same group or move forward, but not backward
  return toIndex >= fromIndex;
}

/**
 * Get the next expected group after the current one.
 * @param currentGroup Current tool group
 * @returns Next group in order, or null if at the end
 */
export function getNextGroup(currentGroup: ToolGroup): ToolGroup | null {
  const currentIndex = TOOL_GROUP_ORDER.indexOf(currentGroup);
  if (currentIndex < 0 || currentIndex >= TOOL_GROUP_ORDER.length - 1) {
    return null;
  }
  return TOOL_GROUP_ORDER[currentIndex + 1] || null;
}

/**
 * Get human-readable description of tool group dependencies.
 * Useful for system prompts and documentation.
 */
export function getGroupDependencyDescription(): string {
  return `Tool Group Dependencies:
- IMPORT: External content import (YouTube, audio files) - Run first if importing
- CONTENT: Content planning (plan_video, narrate_scenes, validate_plan) - Core planning
- MEDIA: Asset generation (generate_visuals, animate_image, generate_music, plan_sfx)
- ENHANCEMENT: Post-processing (remove_background, restyle_image, mix_audio_tracks)
- EXPORT: Final output (generate_subtitles, export_final_video)

Execution Order: IMPORT → CONTENT → MEDIA → ENHANCEMENT → EXPORT
Note: IMPORT is optional - skip directly to CONTENT for topic-based videos.`;
}

/**
 * Create a tool definition helper for cleaner registration.
 */
export function createToolDefinition(
  name: string,
  group: ToolGroup,
  tool: StructuredTool,
  dependencies?: string[]
): ToolDefinition {
  return { name, group, tool, dependencies };
}
