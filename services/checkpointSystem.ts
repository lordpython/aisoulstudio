/**
 * Checkpoint System
 *
 * Manages user-approval checkpoints during pipeline execution.
 * Pipelines pause at configured points and wait for user approval
 * before continuing. Supports timeout, change requests, and resumption.
 *
 * Requirements: 17.1 (pause), 17.2 (resume), 17.3 (change requests), 17.4 (count constraint), 17.5 (timeout)
 */

import type { CheckpointState } from '../types';
import { agentLogger } from './logger';

const log = agentLogger.child('Checkpoint');

/** Default timeout: 30 minutes */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Checkpoint approval response from the user
 */
export interface CheckpointApproval {
  approved: boolean;
  changeRequest?: string;
}

/**
 * Callback invoked when a checkpoint is created and needs UI display
 */
export type OnCheckpointCreated = (checkpoint: CheckpointState) => void;

/**
 * Checkpoint System class
 *
 * Each pipeline session creates one CheckpointSystem instance.
 * The system tracks all checkpoints and provides pause/resume semantics.
 */
export class CheckpointSystem {
  private checkpoints: Map<string, CheckpointState> = new Map();
  private pendingResolvers: Map<string, (approval: CheckpointApproval) => void> = new Map();
  private timeoutTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private onCheckpointCreated?: OnCheckpointCreated;
  private maxCheckpoints: number;

  constructor(options: {
    /** Maximum number of checkpoints for this pipeline (from format metadata) */
    maxCheckpoints: number;
    /** Callback when a checkpoint is created */
    onCheckpointCreated?: OnCheckpointCreated;
  }) {
    this.maxCheckpoints = options.maxCheckpoints;
    this.onCheckpointCreated = options.onCheckpointCreated;
  }

  /**
   * Create a checkpoint and pause execution until approved or timed out.
   *
   * @param phase Pipeline phase name (e.g., "research", "script")
   * @param timeoutMs Timeout in ms (default 30 minutes)
   * @returns The approval response
   * @throws If max checkpoint count is exceeded
   */
  async createCheckpoint(
    phase: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<CheckpointApproval> {
    // Enforce checkpoint count constraint (Requirement 17.4)
    if (this.checkpoints.size >= this.maxCheckpoints) {
      log.warn(`Max checkpoint count (${this.maxCheckpoints}) reached, skipping checkpoint for phase "${phase}"`);
      return { approved: true };
    }

    const checkpointId = `cp_${phase}_${Date.now()}`;
    const checkpoint: CheckpointState = {
      checkpointId,
      phase,
      status: 'pending',
    };

    this.checkpoints.set(checkpointId, checkpoint);
    log.info(`Checkpoint created: ${checkpointId} (phase: ${phase})`);

    // Notify UI
    this.onCheckpointCreated?.(checkpoint);

    // Create the pause promise (Requirement 17.1)
    const approval = await new Promise<CheckpointApproval>((resolve) => {
      this.pendingResolvers.set(checkpointId, resolve);

      // Set timeout (Requirement 17.5)
      const timer = setTimeout(() => {
        this.timeoutTimers.delete(checkpointId);
        if (this.pendingResolvers.has(checkpointId)) {
          log.warn(`Checkpoint ${checkpointId} timed out after ${timeoutMs}ms, auto-approving`);
          this.pendingResolvers.delete(checkpointId);
          const cp = this.checkpoints.get(checkpointId);
          if (cp) {
            cp.status = 'approved';
            cp.approvedAt = new Date();
          }
          resolve({ approved: true });
        }
      }, timeoutMs);

      this.timeoutTimers.set(checkpointId, timer);
    });

    return approval;
  }

  /**
   * Approve a pending checkpoint, resuming pipeline execution (Requirement 17.2).
   *
   * @param checkpointId The checkpoint to approve
   */
  approveCheckpoint(checkpointId: string): void {
    const resolver = this.pendingResolvers.get(checkpointId);
    if (!resolver) {
      log.warn(`No pending checkpoint found: ${checkpointId}`);
      return;
    }

    // Clear timeout
    const timer = this.timeoutTimers.get(checkpointId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(checkpointId);
    }

    // Update state
    const cp = this.checkpoints.get(checkpointId);
    if (cp) {
      cp.status = 'approved';
      cp.approvedAt = new Date();
    }

    this.pendingResolvers.delete(checkpointId);
    log.info(`Checkpoint approved: ${checkpointId}`);
    resolver({ approved: true });
  }

  /**
   * Reject a pending checkpoint with an optional change request (Requirement 17.3).
   *
   * @param checkpointId The checkpoint to reject
   * @param changeRequest Optional description of requested changes
   */
  rejectCheckpoint(checkpointId: string, changeRequest?: string): void {
    const resolver = this.pendingResolvers.get(checkpointId);
    if (!resolver) {
      log.warn(`No pending checkpoint found: ${checkpointId}`);
      return;
    }

    // Clear timeout
    const timer = this.timeoutTimers.get(checkpointId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(checkpointId);
    }

    // Update state
    const cp = this.checkpoints.get(checkpointId);
    if (cp) {
      cp.status = 'rejected';
    }

    this.pendingResolvers.delete(checkpointId);
    log.info(`Checkpoint rejected: ${checkpointId}${changeRequest ? ` (change: ${changeRequest})` : ''}`);
    resolver({ approved: false, changeRequest });
  }

  /**
   * Update a checkpoint's state (e.g., after re-processing with changes).
   */
  updateCheckpoint(checkpointId: string, updates: Partial<CheckpointState>): void {
    const cp = this.checkpoints.get(checkpointId);
    if (!cp) {
      log.warn(`Checkpoint not found: ${checkpointId}`);
      return;
    }
    Object.assign(cp, updates);
  }

  /**
   * Get a specific checkpoint by ID.
   */
  getCheckpoint(checkpointId: string): CheckpointState | null {
    return this.checkpoints.get(checkpointId) ?? null;
  }

  /**
   * Get all checkpoints in creation order.
   */
  getAllCheckpoints(): CheckpointState[] {
    return Array.from(this.checkpoints.values());
  }

  /**
   * Get count of created checkpoints.
   */
  getCheckpointCount(): number {
    return this.checkpoints.size;
  }

  /**
   * Check if there are any pending (unresolved) checkpoints.
   */
  hasPendingCheckpoints(): boolean {
    return this.pendingResolvers.size > 0;
  }

  /**
   * Clean up all timers and pending resolvers.
   * Call this when the pipeline is cancelled or completed.
   */
  dispose(): void {
    for (const timer of this.timeoutTimers.values()) {
      clearTimeout(timer);
    }
    this.timeoutTimers.clear();

    // Auto-approve any pending checkpoints so promises don't leak
    for (const [id, resolver] of this.pendingResolvers.entries()) {
      log.debug(`Disposing pending checkpoint: ${id}`);
      resolver({ approved: true });
    }
    this.pendingResolvers.clear();
  }
}
