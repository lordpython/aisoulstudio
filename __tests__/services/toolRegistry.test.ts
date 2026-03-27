/**
 * Tool Registry Tests
 *
 * Covers:
 * - ToolGroup enum values and ordering
 * - TOOL_GROUP_ORDER constant correctness
 * - toolRegistry (singleton): register, registerAll, unregister, getTool, getToolInstance
 * - toolRegistry: getToolsByGroup, getToolInstancesByGroup, getAllTools, getAllToolInstances
 * - toolRegistry: getToolGroup, canExecute, validateExecutionOrder
 * - toolRegistry: getRequiredPrecedingGroups, getExecutableTools, getSummary, clear, size
 * - isValidGroupTransition: null start, forward, same, backward
 * - getNextGroup: all positions including last
 * - Edge cases: duplicate registration, unregister nonexistent, unknown tool names
 *
 * Note: ToolRegistry class is not publicly exported — tests use the exported
 * `toolRegistry` singleton, calling `toolRegistry.clear()` in beforeEach for isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ToolGroup,
  TOOL_GROUP_ORDER,
  toolRegistry,
  isValidGroupTransition,
  getNextGroup,
  createToolDefinition,
  getGroupDependencyDescription,
} from '../../packages/shared/src/services/agent/toolRegistry';
import type { ToolDefinition } from '../../packages/shared/src/services/agent/toolRegistry';

// Mock @langchain/core/tools so the module resolves without a real LangChain installation
vi.mock('@langchain/core/tools', () => ({
  StructuredTool: class MockStructuredTool {
    name: string;
    description: string;
    constructor(fields?: { name?: string; description?: string }) {
      this.name = fields?.name ?? 'mock-tool';
      this.description = fields?.description ?? 'mock description';
    }
    async _call() { return ''; }
    schema = {};
  },
}));

import { StructuredTool } from '@langchain/core/tools';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(name: string): StructuredTool {
  const t = new StructuredTool();
  (t as any).name = name;
  return t;
}

function makeDefinition(
  name: string,
  group: ToolGroup,
  dependencies?: string[]
): ToolDefinition {
  return { name, group, tool: makeTool(name), dependencies };
}

// ---------------------------------------------------------------------------
// ToolGroup enum
// ---------------------------------------------------------------------------

describe('ToolGroup enum', () => {
  it('defines IMPORT', () => {
    expect(ToolGroup.IMPORT).toBe('IMPORT');
  });

  it('defines CONTENT', () => {
    expect(ToolGroup.CONTENT).toBe('CONTENT');
  });

  it('defines MEDIA', () => {
    expect(ToolGroup.MEDIA).toBe('MEDIA');
  });

  it('defines ENHANCEMENT', () => {
    expect(ToolGroup.ENHANCEMENT).toBe('ENHANCEMENT');
  });

  it('defines EXPORT', () => {
    expect(ToolGroup.EXPORT).toBe('EXPORT');
  });

  it('has exactly 5 members', () => {
    expect(Object.values(ToolGroup)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// TOOL_GROUP_ORDER
// ---------------------------------------------------------------------------

describe('TOOL_GROUP_ORDER', () => {
  it('has 5 entries', () => {
    expect(TOOL_GROUP_ORDER).toHaveLength(5);
  });

  it('starts with IMPORT', () => {
    expect(TOOL_GROUP_ORDER[0]).toBe(ToolGroup.IMPORT);
  });

  it('ends with EXPORT', () => {
    expect(TOOL_GROUP_ORDER[TOOL_GROUP_ORDER.length - 1]).toBe(ToolGroup.EXPORT);
  });

  it('follows the dependency order: IMPORT → CONTENT → MEDIA → ENHANCEMENT → EXPORT', () => {
    expect(TOOL_GROUP_ORDER).toEqual([
      ToolGroup.IMPORT,
      ToolGroup.CONTENT,
      ToolGroup.MEDIA,
      ToolGroup.ENHANCEMENT,
      ToolGroup.EXPORT,
    ]);
  });

  it('contains all ToolGroup values', () => {
    for (const group of Object.values(ToolGroup)) {
      expect(TOOL_GROUP_ORDER).toContain(group);
    }
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — registration
// ---------------------------------------------------------------------------

describe('toolRegistry — registration', () => {
  beforeEach(() => {
    toolRegistry.clear();
  });

  it('registers a tool and increases size', () => {
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    expect(toolRegistry.size).toBe(1);
  });

  it('throws when registering a duplicate tool name', () => {
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    expect(() =>
      toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT))
    ).toThrow(/already registered/);
  });

  it('registerAll registers multiple tools', () => {
    toolRegistry.registerAll([
      makeDefinition('tool_a', ToolGroup.IMPORT),
      makeDefinition('tool_b', ToolGroup.CONTENT),
    ]);
    expect(toolRegistry.size).toBe(2);
  });

  it('registerAll throws on first duplicate encountered', () => {
    toolRegistry.register(makeDefinition('tool_a', ToolGroup.IMPORT));
    expect(() =>
      toolRegistry.registerAll([makeDefinition('tool_a', ToolGroup.IMPORT)])
    ).toThrow(/already registered/);
  });

  it('size is 0 after clearing', () => {
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    toolRegistry.clear();
    expect(toolRegistry.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — unregister
// ---------------------------------------------------------------------------

describe('toolRegistry — unregister', () => {
  beforeEach(() => {
    toolRegistry.clear();
  });

  it('unregisters an existing tool and returns true', () => {
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    expect(toolRegistry.unregister('plan_video')).toBe(true);
    expect(toolRegistry.size).toBe(0);
  });

  it('returns false when unregistering a nonexistent tool', () => {
    expect(toolRegistry.unregister('nonexistent')).toBe(false);
  });

  it('removes the tool from its group index', () => {
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    toolRegistry.unregister('plan_video');
    expect(toolRegistry.getToolsByGroup(ToolGroup.CONTENT)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — lookup
// ---------------------------------------------------------------------------

describe('toolRegistry — lookup', () => {
  beforeEach(() => {
    toolRegistry.clear();
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
  });

  it('getTool returns the definition for a registered tool', () => {
    const def = toolRegistry.getTool('plan_video');
    expect(def).toBeDefined();
    expect(def!.name).toBe('plan_video');
    expect(def!.group).toBe(ToolGroup.CONTENT);
  });

  it('getTool returns undefined for an unknown tool', () => {
    expect(toolRegistry.getTool('unknown_tool')).toBeUndefined();
  });

  it('getToolInstance returns the StructuredTool instance', () => {
    const instance = toolRegistry.getToolInstance('plan_video');
    expect(instance).toBeDefined();
  });

  it('getToolInstance returns undefined for an unknown tool', () => {
    expect(toolRegistry.getToolInstance('unknown_tool')).toBeUndefined();
  });

  it('getToolGroup returns the correct group', () => {
    expect(toolRegistry.getToolGroup('plan_video')).toBe(ToolGroup.CONTENT);
  });

  it('getToolGroup returns undefined for an unknown tool', () => {
    expect(toolRegistry.getToolGroup('unknown')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — group queries
// ---------------------------------------------------------------------------

describe('toolRegistry — group queries', () => {
  beforeEach(() => {
    toolRegistry.clear();
    toolRegistry.registerAll([
      makeDefinition('import_yt', ToolGroup.IMPORT),
      makeDefinition('plan_video', ToolGroup.CONTENT),
      makeDefinition('narrate', ToolGroup.CONTENT),
      makeDefinition('gen_visuals', ToolGroup.MEDIA),
    ]);
  });

  it('getToolsByGroup returns all tools in the group', () => {
    const tools = toolRegistry.getToolsByGroup(ToolGroup.CONTENT);
    const names = tools.map(t => t.name);
    expect(names).toContain('plan_video');
    expect(names).toContain('narrate');
    expect(tools).toHaveLength(2);
  });

  it('getToolsByGroup returns empty array for a group with no tools', () => {
    expect(toolRegistry.getToolsByGroup(ToolGroup.ENHANCEMENT)).toHaveLength(0);
  });

  it('getToolInstancesByGroup returns StructuredTool instances', () => {
    const instances = toolRegistry.getToolInstancesByGroup(ToolGroup.CONTENT);
    expect(instances).toHaveLength(2);
  });

  it('getAllTools returns all registered tool definitions', () => {
    expect(toolRegistry.getAllTools()).toHaveLength(4);
  });

  it('getAllToolInstances returns all StructuredTool instances', () => {
    expect(toolRegistry.getAllToolInstances()).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — canExecute
// ---------------------------------------------------------------------------

describe('toolRegistry — canExecute', () => {
  beforeEach(() => {
    toolRegistry.clear();
    toolRegistry.registerAll([
      makeDefinition('import_yt', ToolGroup.IMPORT),
      makeDefinition('plan_video', ToolGroup.CONTENT),
      makeDefinition('gen_visuals', ToolGroup.MEDIA),
      makeDefinition('export_video', ToolGroup.EXPORT),
    ]);
  });

  it('returns false for an unknown tool name', () => {
    expect(toolRegistry.canExecute('nonexistent', new Set())).toBe(false);
  });

  it('IMPORT tool can execute with no completed groups', () => {
    expect(toolRegistry.canExecute('import_yt', new Set())).toBe(true);
  });

  it('CONTENT tool can execute when IMPORT is complete', () => {
    expect(
      toolRegistry.canExecute('plan_video', new Set([ToolGroup.IMPORT]))
    ).toBe(true);
  });

  it('CONTENT tool cannot execute when preceding groups are incomplete', () => {
    // There IS an IMPORT tool registered, so IMPORT prerequisite is required
    expect(toolRegistry.canExecute('plan_video', new Set())).toBe(false);
  });

  it('MEDIA tool can execute when IMPORT and CONTENT are complete', () => {
    expect(
      toolRegistry.canExecute(
        'gen_visuals',
        new Set([ToolGroup.IMPORT, ToolGroup.CONTENT])
      )
    ).toBe(true);
  });

  it('MEDIA tool cannot execute when only IMPORT is complete', () => {
    expect(
      toolRegistry.canExecute('gen_visuals', new Set([ToolGroup.IMPORT]))
    ).toBe(false);
  });

  it('EXPORT tool can execute when all preceding groups are complete', () => {
    expect(
      toolRegistry.canExecute(
        'export_video',
        new Set([ToolGroup.IMPORT, ToolGroup.CONTENT, ToolGroup.MEDIA, ToolGroup.ENHANCEMENT])
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — canExecute: IMPORT optional when no import tools registered
// ---------------------------------------------------------------------------

describe('toolRegistry — canExecute, IMPORT group optional when empty', () => {
  it('CONTENT tool can execute with empty completedGroups when no IMPORT tools exist', () => {
    toolRegistry.clear();
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    // No IMPORT tools registered → IMPORT group is skipped in the prerequisite check
    expect(toolRegistry.canExecute('plan_video', new Set())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — canExecute with explicit dependencies
// ---------------------------------------------------------------------------

describe('toolRegistry — canExecute with explicit dependencies', () => {
  it('respects explicit dependency groups', () => {
    toolRegistry.clear();
    toolRegistry.registerAll([
      makeDefinition('plan_video', ToolGroup.CONTENT),
      makeDefinition('gen_visuals', ToolGroup.MEDIA, ['plan_video']),
    ]);

    // CONTENT not yet complete → gen_visuals cannot execute
    expect(toolRegistry.canExecute('gen_visuals', new Set())).toBe(false);

    // CONTENT complete → gen_visuals can execute
    expect(toolRegistry.canExecute('gen_visuals', new Set([ToolGroup.CONTENT]))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — validateExecutionOrder
// ---------------------------------------------------------------------------

describe('toolRegistry — validateExecutionOrder', () => {
  beforeEach(() => {
    toolRegistry.clear();
    toolRegistry.registerAll([
      makeDefinition('import_yt', ToolGroup.IMPORT),
      makeDefinition('plan_video', ToolGroup.CONTENT),
      makeDefinition('gen_visuals', ToolGroup.MEDIA),
      makeDefinition('remove_bg', ToolGroup.ENHANCEMENT),
      makeDefinition('export_video', ToolGroup.EXPORT),
    ]);
  });

  it('returns isValid:true for a correct sequential order', () => {
    const result = toolRegistry.validateExecutionOrder([
      'import_yt',
      'plan_video',
      'gen_visuals',
      'remove_bg',
      'export_video',
    ]);
    expect(result.isValid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('returns isValid:false when a tool appears after a later-group tool', () => {
    // gen_visuals (MEDIA) before plan_video (CONTENT) — violation
    const result = toolRegistry.validateExecutionOrder([
      'import_yt',
      'gen_visuals',
      'plan_video', // CONTENT after MEDIA is a violation
      'export_video',
    ]);
    expect(result.isValid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('ignores unknown tool names in the sequence', () => {
    const result = toolRegistry.validateExecutionOrder([
      'unknown_tool',
      'import_yt',
      'plan_video',
    ]);
    // Unknown tools are skipped, known tools are in valid order
    expect(result.isValid).toBe(true);
  });

  it('returns isValid:true for an empty sequence', () => {
    const result = toolRegistry.validateExecutionOrder([]);
    expect(result.isValid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('violation includes tool name and actualPosition', () => {
    const result = toolRegistry.validateExecutionOrder([
      'gen_visuals',
      'plan_video', // violation: CONTENT after MEDIA
    ]);
    const violation = result.violations[0];
    expect(violation).toBeDefined();
    expect(violation!.tool).toBe('plan_video');
    expect(typeof violation!.actualPosition).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — getRequiredPrecedingGroups
// ---------------------------------------------------------------------------

describe('toolRegistry — getRequiredPrecedingGroups', () => {
  beforeEach(() => {
    toolRegistry.clear();
    toolRegistry.registerAll([
      makeDefinition('import_yt', ToolGroup.IMPORT),
      makeDefinition('plan_video', ToolGroup.CONTENT),
      makeDefinition('gen_visuals', ToolGroup.MEDIA),
      makeDefinition('export_video', ToolGroup.EXPORT),
    ]);
  });

  it('returns empty array for IMPORT tool (first group)', () => {
    expect(toolRegistry.getRequiredPrecedingGroups('import_yt')).toEqual([]);
  });

  it('returns [IMPORT] for a CONTENT tool', () => {
    expect(toolRegistry.getRequiredPrecedingGroups('plan_video')).toEqual([ToolGroup.IMPORT]);
  });

  it('returns [IMPORT, CONTENT] for a MEDIA tool', () => {
    expect(toolRegistry.getRequiredPrecedingGroups('gen_visuals')).toEqual([
      ToolGroup.IMPORT,
      ToolGroup.CONTENT,
    ]);
  });

  it('returns all preceding groups for an EXPORT tool', () => {
    expect(toolRegistry.getRequiredPrecedingGroups('export_video')).toEqual([
      ToolGroup.IMPORT,
      ToolGroup.CONTENT,
      ToolGroup.MEDIA,
      ToolGroup.ENHANCEMENT,
    ]);
  });

  it('returns empty array for unknown tool name', () => {
    expect(toolRegistry.getRequiredPrecedingGroups('nonexistent')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — getExecutableTools
// ---------------------------------------------------------------------------

describe('toolRegistry — getExecutableTools', () => {
  it('returns only tools whose preceding groups are satisfied', () => {
    toolRegistry.clear();
    toolRegistry.registerAll([
      makeDefinition('plan_video', ToolGroup.CONTENT),
      makeDefinition('gen_visuals', ToolGroup.MEDIA),
    ]);

    // No IMPORT tools → IMPORT is optional; CONTENT should be executable
    const executable = toolRegistry.getExecutableTools(new Set());
    expect(executable).toContain('plan_video');
    expect(executable).not.toContain('gen_visuals');
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — getSummary
// ---------------------------------------------------------------------------

describe('toolRegistry — getSummary', () => {
  beforeEach(() => {
    toolRegistry.clear();
  });

  it('returns an entry for every ToolGroup', () => {
    const summary = toolRegistry.getSummary();
    for (const group of Object.values(ToolGroup)) {
      expect(summary).toHaveProperty(group);
    }
  });

  it('count is 0 for empty groups', () => {
    const summary = toolRegistry.getSummary();
    expect(summary[ToolGroup.IMPORT]!.count).toBe(0);
  });

  it('reflects registered tools in count and names', () => {
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    const summary = toolRegistry.getSummary();
    expect(summary[ToolGroup.CONTENT]!.count).toBe(1);
    expect(summary[ToolGroup.CONTENT]!.tools).toContain('plan_video');
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — clear
// ---------------------------------------------------------------------------

describe('toolRegistry — clear', () => {
  it('removes all tools', () => {
    toolRegistry.clear();
    toolRegistry.registerAll([
      makeDefinition('tool_a', ToolGroup.IMPORT),
      makeDefinition('tool_b', ToolGroup.CONTENT),
    ]);
    toolRegistry.clear();
    expect(toolRegistry.size).toBe(0);
  });

  it('resets group indices', () => {
    toolRegistry.clear();
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    toolRegistry.clear();
    expect(toolRegistry.getToolsByGroup(ToolGroup.CONTENT)).toHaveLength(0);
  });

  it('allows re-registration after clear', () => {
    toolRegistry.clear();
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    toolRegistry.clear();
    expect(() =>
      toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT))
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// isValidGroupTransition
// ---------------------------------------------------------------------------

describe('isValidGroupTransition', () => {
  it('allows starting with IMPORT from null', () => {
    expect(isValidGroupTransition(null, ToolGroup.IMPORT)).toBe(true);
  });

  it('allows starting with CONTENT from null', () => {
    expect(isValidGroupTransition(null, ToolGroup.CONTENT)).toBe(true);
  });

  it('disallows starting with MEDIA from null', () => {
    expect(isValidGroupTransition(null, ToolGroup.MEDIA)).toBe(false);
  });

  it('disallows starting with EXPORT from null', () => {
    expect(isValidGroupTransition(null, ToolGroup.EXPORT)).toBe(false);
  });

  it('allows forward transition (CONTENT → MEDIA)', () => {
    expect(isValidGroupTransition(ToolGroup.CONTENT, ToolGroup.MEDIA)).toBe(true);
  });

  it('allows staying in the same group (CONTENT → CONTENT)', () => {
    expect(isValidGroupTransition(ToolGroup.CONTENT, ToolGroup.CONTENT)).toBe(true);
  });

  it('disallows backward transition (MEDIA → CONTENT)', () => {
    expect(isValidGroupTransition(ToolGroup.MEDIA, ToolGroup.CONTENT)).toBe(false);
  });

  it('disallows backward transition (EXPORT → IMPORT)', () => {
    expect(isValidGroupTransition(ToolGroup.EXPORT, ToolGroup.IMPORT)).toBe(false);
  });

  it('allows full forward traversal IMPORT → EXPORT', () => {
    expect(isValidGroupTransition(ToolGroup.IMPORT, ToolGroup.CONTENT)).toBe(true);
    expect(isValidGroupTransition(ToolGroup.CONTENT, ToolGroup.MEDIA)).toBe(true);
    expect(isValidGroupTransition(ToolGroup.MEDIA, ToolGroup.ENHANCEMENT)).toBe(true);
    expect(isValidGroupTransition(ToolGroup.ENHANCEMENT, ToolGroup.EXPORT)).toBe(true);
  });

  it('allows skipping groups forward (IMPORT → MEDIA)', () => {
    expect(isValidGroupTransition(ToolGroup.IMPORT, ToolGroup.MEDIA)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getNextGroup
// ---------------------------------------------------------------------------

describe('getNextGroup', () => {
  it('returns CONTENT after IMPORT', () => {
    expect(getNextGroup(ToolGroup.IMPORT)).toBe(ToolGroup.CONTENT);
  });

  it('returns MEDIA after CONTENT', () => {
    expect(getNextGroup(ToolGroup.CONTENT)).toBe(ToolGroup.MEDIA);
  });

  it('returns ENHANCEMENT after MEDIA', () => {
    expect(getNextGroup(ToolGroup.MEDIA)).toBe(ToolGroup.ENHANCEMENT);
  });

  it('returns EXPORT after ENHANCEMENT', () => {
    expect(getNextGroup(ToolGroup.ENHANCEMENT)).toBe(ToolGroup.EXPORT);
  });

  it('returns null after EXPORT (last group)', () => {
    expect(getNextGroup(ToolGroup.EXPORT)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createToolDefinition helper
// ---------------------------------------------------------------------------

describe('createToolDefinition', () => {
  it('returns a ToolDefinition with the provided fields', () => {
    const tool = makeTool('my-tool');
    const def = createToolDefinition('my-tool', ToolGroup.MEDIA, tool, ['dep1']);
    expect(def.name).toBe('my-tool');
    expect(def.group).toBe(ToolGroup.MEDIA);
    expect(def.tool).toBe(tool);
    expect(def.dependencies).toEqual(['dep1']);
  });

  it('creates a definition without dependencies when not provided', () => {
    const def = createToolDefinition('no-deps', ToolGroup.CONTENT, makeTool('no-deps'));
    expect(def.dependencies).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getGroupDependencyDescription
// ---------------------------------------------------------------------------

describe('getGroupDependencyDescription', () => {
  it('returns a non-empty string', () => {
    const desc = getGroupDependencyDescription();
    expect(typeof desc).toBe('string');
    expect(desc.length).toBeGreaterThan(0);
  });

  it('mentions all group names', () => {
    const desc = getGroupDependencyDescription();
    expect(desc).toContain('IMPORT');
    expect(desc).toContain('CONTENT');
    expect(desc).toContain('MEDIA');
    expect(desc).toContain('ENHANCEMENT');
    expect(desc).toContain('EXPORT');
  });
});

// ---------------------------------------------------------------------------
// Singleton toolRegistry
// ---------------------------------------------------------------------------

describe('toolRegistry singleton', () => {
  it('is exported and has the expected interface', () => {
    expect(toolRegistry).toBeDefined();
    expect(typeof toolRegistry.register).toBe('function');
    expect(typeof toolRegistry.getTool).toBe('function');
    expect(typeof toolRegistry.clear).toBe('function');
    expect(typeof toolRegistry.size).toBe('number');
  });
});
