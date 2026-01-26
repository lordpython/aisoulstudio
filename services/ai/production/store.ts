/**
 * Production Agent State Management
 * 
 * Manages production session state and story mode state.
 */

import { ProductionState, StoryModeState, createInitialState } from "./types";
import { agentLogger } from "../../logger";
import { cloudAutosave } from "../../cloudStorageService";

const log = agentLogger.child('Production');

/**
 * Store for intermediate results (in-memory for now)
 */
export const productionStore: Map<string, ProductionState> = new Map();

/**
 * Story Mode session store (in-memory) 
 */
export const storyModeStore: Map<string, StoryModeState> = new Map();

/**
 * Get a production session by ID
 */
export function getProductionSession(sessionId: string): ProductionState | null {
    return productionStore.get(sessionId) || null;
}

/**
 * Clear a production session
 */
export function clearProductionSession(sessionId: string): void {
    productionStore.delete(sessionId);
}

/**
 * Initialize a new production session with cloud autosave
 */
export async function initializeProductionSession(sessionId: string, initialState?: Partial<ProductionState>): Promise<void> {
    const state: ProductionState = {
        ...createInitialState(),
        ...initialState,
    };
    
    productionStore.set(sessionId, state);
    
    // Initialize cloud autosave session (fire-and-forget, non-blocking)
    cloudAutosave.initSession(sessionId).catch(err => {
        log.warn('Cloud autosave init failed (non-fatal):', err);
    });
}

/**
 * Update production session state
 */
export function updateProductionSession(sessionId: string, updates: Partial<ProductionState>): void {
    const state = productionStore.get(sessionId);
    if (state) {
        Object.assign(state, updates);
        productionStore.set(sessionId, state);
    }
}
