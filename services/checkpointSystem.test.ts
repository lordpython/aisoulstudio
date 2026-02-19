/**
 * Checkpoint System Property Tests
 *
 * Property 31: Checkpoint Pause Behavior (Requirement 17.1)
 * Property 32: Checkpoint Approval Resumption (Requirement 17.2)
 * Property 33: Checkpoint Count Constraint (Requirement 17.4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CheckpointSystem, type CheckpointApproval } from './checkpointSystem';

describe('CheckpointSystem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Property 31: Checkpoint Pause Behavior', () => {
    it('should pause execution at checkpoint until approved', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 3 });
      let resolved = false;

      const promise = system.createCheckpoint('research').then((result) => {
        resolved = true;
        return result;
      });

      // Should not resolve immediately
      await vi.advanceTimersByTimeAsync(100);
      expect(resolved).toBe(false);
      expect(system.hasPendingCheckpoints()).toBe(true);

      // Approve the checkpoint
      const checkpoints = system.getAllCheckpoints();
      expect(checkpoints).toHaveLength(1);
      system.approveCheckpoint(checkpoints[0]!.checkpointId);

      const result = await promise;
      expect(resolved).toBe(true);
      expect(result.approved).toBe(true);
    });

    it('should create checkpoint with correct phase name', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 5 });

      const promise = system.createCheckpoint('script');
      await vi.advanceTimersByTimeAsync(0);

      const checkpoints = system.getAllCheckpoints();
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0]!.phase).toBe('script');
      expect(checkpoints[0]!.status).toBe('pending');

      // Clean up
      system.dispose();
      await promise;
    });

    it('should notify via onCheckpointCreated callback', async () => {
      const onCreated = vi.fn();
      const system = new CheckpointSystem({
        maxCheckpoints: 3,
        onCheckpointCreated: onCreated,
      });

      const promise = system.createCheckpoint('research');
      await vi.advanceTimersByTimeAsync(0);

      expect(onCreated).toHaveBeenCalledTimes(1);
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'research',
          status: 'pending',
        })
      );

      system.dispose();
      await promise;
    });
  });

  describe('Property 32: Checkpoint Approval Resumption', () => {
    it('should resume pipeline on approval', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 3 });
      const stages: string[] = [];

      stages.push('before_checkpoint');
      const checkpointPromise = system.createCheckpoint('review');

      // Simulate async approval after a delay
      setTimeout(() => {
        const cp = system.getAllCheckpoints()[0]!;
        system.approveCheckpoint(cp.checkpointId);
      }, 5000);

      await vi.advanceTimersByTimeAsync(5000);
      const result = await checkpointPromise;
      stages.push('after_checkpoint');

      expect(stages).toEqual(['before_checkpoint', 'after_checkpoint']);
      expect(result.approved).toBe(true);
    });

    it('should set approved status and timestamp on approval', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 3 });

      const promise = system.createCheckpoint('review');
      await vi.advanceTimersByTimeAsync(0);

      const cp = system.getAllCheckpoints()[0]!;
      system.approveCheckpoint(cp.checkpointId);

      await promise;

      const updated = system.getCheckpoint(cp.checkpointId);
      expect(updated!.status).toBe('approved');
      expect(updated!.approvedAt).toBeDefined();
    });

    it('should return change request on rejection', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 3 });

      const promise = system.createCheckpoint('script');
      await vi.advanceTimersByTimeAsync(0);

      const cp = system.getAllCheckpoints()[0]!;
      system.rejectCheckpoint(cp.checkpointId, 'Make it shorter');

      const result = await promise;
      expect(result.approved).toBe(false);
      expect(result.changeRequest).toBe('Make it shorter');
    });

    it('should set rejected status on rejection', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 3 });

      const promise = system.createCheckpoint('visuals');
      await vi.advanceTimersByTimeAsync(0);

      const cp = system.getAllCheckpoints()[0]!;
      system.rejectCheckpoint(cp.checkpointId);
      await promise;

      const updated = system.getCheckpoint(cp.checkpointId);
      expect(updated!.status).toBe('rejected');
    });

    it('should auto-approve on timeout (30 min default)', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 3 });

      const promise = system.createCheckpoint('research');

      // Advance past 30-minute timeout
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 100);

      const result = await promise;
      expect(result.approved).toBe(true);
    });

    it('should auto-approve on custom timeout', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 3 });

      const promise = system.createCheckpoint('quick_review', 5000);

      // Advance past 5-second custom timeout
      await vi.advanceTimersByTimeAsync(5100);

      const result = await promise;
      expect(result.approved).toBe(true);
    });

    it('should handle approve on non-existent checkpoint gracefully', () => {
      const system = new CheckpointSystem({ maxCheckpoints: 3 });
      // Should not throw
      expect(() => system.approveCheckpoint('non_existent')).not.toThrow();
    });
  });

  describe('Property 33: Checkpoint Count Constraint', () => {
    it('should enforce max checkpoint count', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 2 });

      // Create and immediately approve two checkpoints
      const p1 = system.createCheckpoint('phase1');
      await vi.advanceTimersByTimeAsync(0);
      system.approveCheckpoint(system.getAllCheckpoints()[0]!.checkpointId);
      await p1;

      const p2 = system.createCheckpoint('phase2');
      await vi.advanceTimersByTimeAsync(0);
      system.approveCheckpoint(system.getAllCheckpoints()[1]!.checkpointId);
      await p2;

      // Third checkpoint should auto-approve (max reached)
      const result = await system.createCheckpoint('phase3');
      expect(result.approved).toBe(true);

      // Should still only have 2 checkpoints in the system
      expect(system.getCheckpointCount()).toBe(2);
    });

    it('should track checkpoint count correctly', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 5 });

      expect(system.getCheckpointCount()).toBe(0);

      const p1 = system.createCheckpoint('phase1');
      await vi.advanceTimersByTimeAsync(0);
      expect(system.getCheckpointCount()).toBe(1);

      system.approveCheckpoint(system.getAllCheckpoints()[0]!.checkpointId);
      await p1;

      // Count still 1 (approved checkpoints stay in the map)
      expect(system.getCheckpointCount()).toBe(1);

      const p2 = system.createCheckpoint('phase2');
      await vi.advanceTimersByTimeAsync(0);
      expect(system.getCheckpointCount()).toBe(2);

      system.dispose();
      await p2;
    });

    it('should return correct pending status', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 3 });

      expect(system.hasPendingCheckpoints()).toBe(false);

      const p1 = system.createCheckpoint('phase1');
      await vi.advanceTimersByTimeAsync(0);
      expect(system.hasPendingCheckpoints()).toBe(true);

      system.approveCheckpoint(system.getAllCheckpoints()[0]!.checkpointId);
      await p1;
      expect(system.hasPendingCheckpoints()).toBe(false);
    });

    it('should dispose all pending checkpoints cleanly', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 5 });

      const promises = [
        system.createCheckpoint('phase1'),
        system.createCheckpoint('phase2'),
      ];
      await vi.advanceTimersByTimeAsync(0);

      expect(system.hasPendingCheckpoints()).toBe(true);

      system.dispose();

      // All promises should resolve (auto-approved on dispose)
      const results = await Promise.all(promises);
      expect(results.every(r => r.approved)).toBe(true);
      expect(system.hasPendingCheckpoints()).toBe(false);
    });
  });

  describe('updateCheckpoint', () => {
    it('should update checkpoint state', async () => {
      const system = new CheckpointSystem({ maxCheckpoints: 3 });

      const promise = system.createCheckpoint('research');
      await vi.advanceTimersByTimeAsync(0);

      const cp = system.getAllCheckpoints()[0]!;
      system.updateCheckpoint(cp.checkpointId, { phase: 'updated_phase' });

      const updated = system.getCheckpoint(cp.checkpointId);
      expect(updated!.phase).toBe('updated_phase');

      system.dispose();
      await promise;
    });

    it('should handle update on non-existent checkpoint gracefully', () => {
      const system = new CheckpointSystem({ maxCheckpoints: 3 });
      expect(() => system.updateCheckpoint('non_existent', { phase: 'test' })).not.toThrow();
    });
  });
});
