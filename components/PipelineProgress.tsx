/**
 * Pipeline Progress Component
 *
 * Displays real-time progress for multi-format pipeline execution.
 * Shows concurrent task progress, estimated time remaining, and cancellation UI.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  Check,
  X,
  AlertTriangle,
  Clock,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExecutionProgress } from '@/services/parallelExecutionEngine';

export interface PipelineTask {
  id: string;
  name: string;
  type: 'research' | 'script' | 'visual' | 'audio' | 'assembly';
  status: 'queued' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  progress?: number; // 0-100 for individual task
}

export interface PipelineProgressProps {
  /** Current execution progress from the parallel engine */
  executionProgress: ExecutionProgress | null;
  /** Individual task details for concurrent display */
  tasks: PipelineTask[];
  /** Current phase name */
  currentPhase: string;
  /** Whether the pipeline is actively running */
  isRunning: boolean;
  /** Called when user clicks cancel */
  onCancel: () => void;
  /** Whether cancellation is in progress */
  isCancelling?: boolean;
  className?: string;
}

const TASK_TYPE_COLORS: Record<PipelineTask['type'], string> = {
  research: 'text-purple-400',
  script: 'text-cyan-400',
  visual: 'text-amber-400',
  audio: 'text-green-400',
  assembly: 'text-blue-400',
};

const TASK_TYPE_BG: Record<PipelineTask['type'], string> = {
  research: 'bg-purple-500/10',
  script: 'bg-cyan-500/10',
  visual: 'bg-amber-500/10',
  audio: 'bg-green-500/10',
  assembly: 'bg-blue-500/10',
};

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '';
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s remaining`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s remaining`;
}

export function PipelineProgress({
  executionProgress,
  tasks,
  currentPhase,
  isRunning,
  onCancel,
  isCancelling = false,
  className,
}: PipelineProgressProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const overallProgress = executionProgress
    ? executionProgress.totalTasks > 0
      ? Math.round(
          ((executionProgress.completedTasks + executionProgress.failedTasks) /
            executionProgress.totalTasks) *
            100,
        )
      : 0
    : 0;

  const estimatedTime = executionProgress?.estimatedTimeRemaining ?? 0;

  const handleCancel = useCallback(() => {
    if (showCancelConfirm) {
      onCancel();
      setShowCancelConfirm(false);
    } else {
      setShowCancelConfirm(true);
    }
  }, [showCancelConfirm, onCancel]);

  // Auto-dismiss cancel confirmation after 5 seconds
  useEffect(() => {
    if (!showCancelConfirm) return;
    const timer = setTimeout(() => setShowCancelConfirm(false), 5000);
    return () => clearTimeout(timer);
  }, [showCancelConfirm]);

  const inProgressTasks = tasks.filter((t) => t.status === 'in-progress');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const failedTasks = tasks.filter((t) => t.status === 'failed');

  return (
    <div
      className={cn('w-full max-w-2xl mx-auto', className)}
      role="status"
      aria-live="polite"
      aria-label={`Pipeline progress: ${overallProgress}% complete`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium text-zinc-100">
            {currentPhase || 'Pipeline'}
          </h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-xs text-zinc-500">
              {executionProgress
                ? `${executionProgress.completedTasks}/${executionProgress.totalTasks} tasks`
                : 'Initializing...'}
            </span>
            {estimatedTime > 0 && (
              <span className="flex items-center gap-1 font-mono text-xs text-zinc-600">
                <Clock className="w-3 h-3" />
                {formatTimeRemaining(estimatedTime)}
              </span>
            )}
          </div>
        </div>

        {/* Cancel button */}
        {isRunning && (
          <div className="relative">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isCancelling}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-sm border text-xs font-mono transition-colors duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                showCancelConfirm
                  ? 'bg-red-500/10 border-red-500/50 text-red-400'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200',
              )}
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Cancelling...</span>
                </>
              ) : showCancelConfirm ? (
                <>
                  <AlertTriangle className="w-3 h-3" />
                  <span>Confirm cancel?</span>
                </>
              ) : (
                <>
                  <X className="w-3 h-3" />
                  <span>Cancel</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Overall Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="font-mono text-zinc-500">Overall</span>
          <span className="font-mono text-zinc-400">{overallProgress}%</span>
        </div>
        <div
          className="h-1.5 bg-zinc-900 rounded-sm overflow-hidden"
          role="progressbar"
          aria-valuenow={overallProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <motion.div
            className="h-full bg-blue-500 rounded-sm"
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Concurrent Task List */}
      {tasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-3.5 h-3.5 text-zinc-500" />
            <span className="font-mono text-[11px] font-medium tracking-[0.15em] uppercase text-zinc-500">
              Tasks
            </span>
          </div>

          <div className="space-y-1.5">
            {tasks.map((task) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-sm border',
                  task.status === 'in-progress'
                    ? 'border-zinc-700 bg-zinc-900/80'
                    : task.status === 'completed'
                      ? 'border-zinc-800 bg-zinc-900/40'
                      : task.status === 'failed'
                        ? 'border-red-900/50 bg-red-950/20'
                        : 'border-zinc-800/50 bg-zinc-950/50',
                )}
              >
                {/* Status icon */}
                <div className="shrink-0">
                  {task.status === 'in-progress' ? (
                    <Loader2
                      className={cn(
                        'w-3.5 h-3.5 animate-spin',
                        TASK_TYPE_COLORS[task.type],
                      )}
                    />
                  ) : task.status === 'completed' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : task.status === 'failed' ? (
                    <X className="w-3.5 h-3.5 text-red-400" />
                  ) : task.status === 'cancelled' ? (
                    <X className="w-3.5 h-3.5 text-zinc-600" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-zinc-700" />
                  )}
                </div>

                {/* Task info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-[13px] font-medium truncate',
                        task.status === 'completed'
                          ? 'text-zinc-400'
                          : task.status === 'failed'
                            ? 'text-red-400'
                            : task.status === 'in-progress'
                              ? 'text-zinc-200'
                              : 'text-zinc-600',
                      )}
                    >
                      {task.name}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-mono px-1.5 py-0.5 rounded-sm',
                        TASK_TYPE_BG[task.type],
                        TASK_TYPE_COLORS[task.type],
                      )}
                    >
                      {task.type}
                    </span>
                  </div>
                </div>

                {/* Task progress */}
                {task.status === 'in-progress' && task.progress != null && (
                  <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                    {task.progress}%
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Summary stats */}
      {(completedTasks.length > 0 || failedTasks.length > 0) && (
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-zinc-800">
          {completedTasks.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
              <Check className="w-3 h-3" />
              {completedTasks.length} completed
            </span>
          )}
          {inProgressTasks.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-blue-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              {inProgressTasks.length} running
            </span>
          )}
          {failedTasks.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-red-400">
              <X className="w-3 h-3" />
              {failedTasks.length} failed
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default PipelineProgress;
