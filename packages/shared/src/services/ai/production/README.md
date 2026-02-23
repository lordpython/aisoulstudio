# Production Agent Modular Structure

This directory contains the refactored production agent code, split from the monolithic `productionAgent.ts` file into manageable modules.

## Module Organization

### Core Modules

- **types.ts** (~200 lines)
  - Zod schemas for tool validation
  - TypeScript interfaces (ProductionState, StoryModeState, ProductionProgress)
  - Type definitions and helper functions

- **store.ts** (~70 lines)
  - State management for production sessions
  - Story mode session management
  - Session initialization and updates
  - Cloud autosave integration

- **utils.ts** (~180 lines)
  - Language detection from Unicode analysis
  - Session ID generation and validation
  - Step identifier creation for duplicate prevention
  - Helper utilities

- **prompts.ts** (~260 lines)
  - PRODUCTION_AGENT_PROMPT
  - System prompts and instructions for the agent

### Tool Modules

- **tools/contentTools.ts** (~520 lines)
  - planVideoTool - Create content plans with scenes
  - narrateScenesTool - Generate voice narration
  - generateVisualsTool - Generate images for scenes
  - planSFXTool - Plan ambient sound effects
  - validatePlanTool - Check content quality
  - adjustTimingTool - Fix timing mismatches

- **tools/mediaTools.ts** (~320 lines)
  - generateVideoTool - Veo 3.1 text-to-video generation
  - animateImageTool - DeAPI image-to-video animation
  - generateMusicTool - Suno music generation

- **tools/storyTools.ts** (~280 lines)
  - generateBreakdownTool - Story concept breakdown
  - createScreenplayTool - Screenplay generation
  - generateCharactersTool - Character profile creation
  - generateShotlistTool - Shot list generation

- **tools/statusTools.ts** (~80 lines)
  - getProductionStatusTool - Check production status
  - markCompleteTool - Mark production complete
  - verifyCharacterConsistencyTool - Verify character visual consistency

- **tools/index.ts** - Central tool exports

### Agent Core

- **toolRegistration.ts** (~240 lines)
  - Tool registration with tool registry
  - Dependency tracking
  - Tool group organization
  - productionTools array
  - toolMap for execution

- **agentCore.ts** (~620 lines)
  - Main agent loop (runProductionAgent)
  - Multi-agent entry point (runProductionAgentWithSubagents)
  - Tool execution with retry logic
  - Progress reporting
  - Error recovery and fallback handling
  - Result caching

- **index.ts** - Main entry point with all re-exports

## Benefits of Modularization

1. **Maintainability**: Each module has a single responsibility
2. **Testability**: Modules can be tested in isolation
3. **Reusability**: Utilities and types can be imported where needed
4. **Readability**: Smaller files are easier to understand (~200 lines avg vs 2700 lines)
5. **Collaboration**: Multiple developers can work on different modules
6. **Performance**: Faster IDE operations and better tree-shaking

## Migration Status

### ✅ Completed (100%)

| Module | Lines | Description |
|--------|-------|-------------|
| types.ts | ~200 | Schemas and interfaces |
| store.ts | ~70 | State management |
| utils.ts | ~180 | Helper functions |
| prompts.ts | ~260 | Agent system prompts |
| tools/contentTools.ts | ~520 | Content planning tools |
| tools/mediaTools.ts | ~320 | Media generation tools |
| tools/storyTools.ts | ~280 | Story mode tools |
| tools/statusTools.ts | ~80 | Status and utility tools |
| tools/index.ts | ~30 | Tool exports |
| toolRegistration.ts | ~240 | Tool registration |
| agentCore.ts | ~620 | Main agent execution |
| index.ts | ~120 | Main entry point |

**Total**: ~2920 lines extracted into 12 modules

## Usage

```typescript
// Import everything from the main entry point
import {
  runProductionAgent,
  ProductionState,
  ProductionProgress,
  productionTools,
  detectLanguageFromText,
} from './production';

// Or import from specific modules
import { ProductionState, ProductionProgress } from './production/types';
import { productionStore, initializeProductionSession } from './production/store';
import { detectLanguageFromText, validateContentPlanId } from './production/utils';
import { planVideoTool, narrateScenesTool } from './production/tools/contentTools';
import { runProductionAgent, runProductionAgentWithSubagents } from './production/agentCore';
```

## Architecture

```
production/
├── index.ts                 # Main entry point - re-exports all
├── types.ts                 # Zod schemas & TypeScript interfaces
├── store.ts                 # State management (Map-based)
├── utils.ts                 # Helper utilities
├── prompts.ts               # Agent system prompt
├── toolRegistration.ts      # Tool registry integration
├── agentCore.ts             # Main agent loop & execution
└── tools/
    ├── index.ts             # Tool module exports
    ├── contentTools.ts      # Content planning tools
    ├── mediaTools.ts        # Media generation tools
    ├── storyTools.ts        # Story mode tools
    └── statusTools.ts       # Status & utility tools
```

## Dependencies

The production modules depend on:
- `../../agent/toolRegistry` - Centralized tool registry
- `../../agent/intentDetection` - Intent analysis for routing
- `../../agent/errorRecovery` - Error handling and retry logic
- `../subagents/supervisorAgent` - Multi-agent orchestration
- Various service modules for actual functionality

## Testing

Each module can be tested in isolation:

```bash
# Run all production tests
npm test -- --grep "production"

# Run specific module tests
npm test -- --grep "production/types"
npm test -- --grep "production/agentCore"
```

## Future Improvements

1. Add comprehensive unit tests for each module
2. Add integration tests for the full agent flow
3. Consider splitting agentCore.ts further if it grows
4. Add performance monitoring and metrics
5. Consider lazy loading for rarely-used tools
