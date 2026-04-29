/**
 * Tool Registry Tests
 *
 * Covers the trimmed surface kept after removing the unused dependency-graph
 * machinery: register, getAllToolInstances, getSummary, clear, size, plus the
 * createToolDefinition helper.
 *
 * Tests run against the exported `toolRegistry` singleton; `clear()` in
 * beforeEach provides isolation between cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ToolGroup,
  toolRegistry,
  createToolDefinition,
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
  (t as unknown as { name: string }).name = name;
  return t;
}

function makeDefinition(
  name: string,
  group: ToolGroup,
  dependencies?: string[],
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
// toolRegistry — registration
// ---------------------------------------------------------------------------

describe('toolRegistry — registration', () => {
  beforeEach(() => {
    toolRegistry.clear();
  });

  it('registers a single tool and reports size', () => {
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    expect(toolRegistry.size).toBe(1);
  });

  it('rejects duplicate registration of the same tool name', () => {
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    expect(() =>
      toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT)),
    ).toThrow(/already registered/);
  });

  it('size remains accurate across multiple registrations', () => {
    toolRegistry.register(makeDefinition('a', ToolGroup.CONTENT));
    toolRegistry.register(makeDefinition('b', ToolGroup.MEDIA));
    toolRegistry.register(makeDefinition('c', ToolGroup.EXPORT));
    expect(toolRegistry.size).toBe(3);
  });

  it('clear empties the registry', () => {
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    toolRegistry.register(makeDefinition('gen_visuals', ToolGroup.MEDIA));
    toolRegistry.clear();
    expect(toolRegistry.size).toBe(0);
  });

  it('allows re-registration of the same name after clear', () => {
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    toolRegistry.clear();
    expect(() =>
      toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT)),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — readers consumed at runtime
// ---------------------------------------------------------------------------

describe('toolRegistry — runtime readers', () => {
  beforeEach(() => {
    toolRegistry.clear();
  });

  it('getAllToolInstances returns every registered LangChain tool', () => {
    toolRegistry.register(makeDefinition('a', ToolGroup.CONTENT));
    toolRegistry.register(makeDefinition('b', ToolGroup.MEDIA));
    toolRegistry.register(makeDefinition('c', ToolGroup.EXPORT));

    const instances = toolRegistry.getAllToolInstances();
    expect(instances).toHaveLength(3);
    // Every entry is a StructuredTool instance (mocked).
    for (const inst of instances) {
      expect(inst).toBeDefined();
    }
  });

  it('getAllToolInstances returns an empty array when nothing is registered', () => {
    expect(toolRegistry.getAllToolInstances()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// toolRegistry — getSummary
// ---------------------------------------------------------------------------

describe('toolRegistry.getSummary', () => {
  beforeEach(() => {
    toolRegistry.clear();
  });

  it('returns a zeroed summary when nothing is registered', () => {
    const summary = toolRegistry.getSummary();
    expect(Object.keys(summary).sort()).toEqual([
      'CONTENT',
      'ENHANCEMENT',
      'EXPORT',
      'IMPORT',
      'MEDIA',
    ]);
    for (const bucket of Object.values(summary)) {
      expect(bucket.count).toBe(0);
      expect(bucket.tools).toEqual([]);
    }
  });

  it('counts tools per group and lists their names', () => {
    toolRegistry.register(makeDefinition('plan_video', ToolGroup.CONTENT));
    toolRegistry.register(makeDefinition('narrate_scenes', ToolGroup.CONTENT));
    toolRegistry.register(makeDefinition('gen_visuals', ToolGroup.MEDIA));

    const summary = toolRegistry.getSummary();
    expect(summary.CONTENT?.count).toBe(2);
    expect(summary.CONTENT?.tools.sort()).toEqual(['narrate_scenes', 'plan_video']);
    expect(summary.MEDIA?.count).toBe(1);
    expect(summary.MEDIA?.tools).toEqual(['gen_visuals']);
    expect(summary.IMPORT?.count).toBe(0);
    expect(summary.ENHANCEMENT?.count).toBe(0);
    expect(summary.EXPORT?.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createToolDefinition helper
// ---------------------------------------------------------------------------

describe('createToolDefinition', () => {
  it('builds a ToolDefinition from name + group + tool', () => {
    const tool = makeTool('plan_video');
    const def = createToolDefinition('plan_video', ToolGroup.CONTENT, tool);
    expect(def).toEqual({
      name: 'plan_video',
      group: ToolGroup.CONTENT,
      tool,
      dependencies: undefined,
    });
  });

  it('preserves the optional dependencies field when supplied', () => {
    const tool = makeTool('gen_visuals');
    const def = createToolDefinition('gen_visuals', ToolGroup.MEDIA, tool, ['plan_video']);
    expect(def.dependencies).toEqual(['plan_video']);
  });
});
