/**
 * Production Agent - Re-export Wrapper
 *
 * This file maintains backward compatibility by re-exporting all functionality
 * from the modular production/ directory.
 *
 * For new code, prefer importing directly from './production':
 * @example
 * import { runProductionAgent, ProductionState } from './production';
 *
 * @deprecated Import from './production' instead for new code
 */

// Re-export everything from the modular production directory
export * from "./production";
