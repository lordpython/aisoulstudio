/**
 * Checkpoint Approval Component
 *
 * Displays a checkpoint gate for human-in-the-loop approval during
 * multi-format pipeline execution. Shows preview content, approve/reject
 * controls, and a countdown timer with timeout warnings.
 *
 * Requirements: 17.1, 17.2, 17.3, 17.5
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  X,
  Clock,
  Edit3,
  AlertTriangle,
  Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckpointApprovalProps {
  checkpointId: string;
  phase: string;
  title: string;
  description?: string;
  previewData?: React.ReactNode;
  timeoutMs?: number;
  onApprove: (checkpointId: string) => void;
  onRequestChanges: (checkpointId: string, changeRequest: string) => void;
  onTimeout?: (checkpointId: string) => void;
  className?: string;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_THRESHOLD_MS = 5 * 60 * 1000;

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function CheckpointApproval({
  checkpointId,
  phase,
  title,
  description,
  previewData,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onApprove,
  onRequestChanges,
  onTimeout,
  className,
}: CheckpointApprovalProps) {
  const [showChangeInput, setShowChangeInput] = useState(false);
  const [changeRequest, setChangeRequest] = useState('');
  const [remaining, setRemaining] = useState(timeoutMs);
  const [timedOut, setTimedOut] = useState(false);
  const startTimeRef = useRef(Date.now());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    startTimeRef.current = Date.now();
    setRemaining(timeoutMs);
    setTimedOut(false);

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const left = Math.max(0, timeoutMs - elapsed);
      setRemaining(left);

      if (left <= 0) {
        clearInterval(interval);
        setTimedOut(true);
        onTimeout?.(checkpointId);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [checkpointId, timeoutMs, onTimeout]);

  useEffect(() => {
    if (showChangeInput) {
      textareaRef.current?.focus();
    }
  }, [showChangeInput]);

  const handleApprove = useCallback(() => {
    onApprove(checkpointId);
  }, [checkpointId, onApprove]);

  const handleSubmitChanges = useCallback(() => {
    const trimmed = changeRequest.trim();
    if (!trimmed) return;
    onRequestChanges(checkpointId, trimmed);
  }, [checkpointId, changeRequest, onRequestChanges]);

  const handleToggleChangeInput = useCallback(() => {
    setShowChangeInput((prev) => !prev);
    setChangeRequest('');
  }, []);

  const isWarning = remaining <= WARNING_THRESHOLD_MS && remaining > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('w-full max-w-2xl mx-auto', className)}
      role="dialog"
      aria-label={`Checkpoint approval: ${title}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] font-medium tracking-[0.15em] uppercase text-zinc-500">
              {phase}
            </span>
          </div>
          <h2 className="text-lg font-medium text-zinc-100">{title}</h2>
          {description && (
            <p className="text-[13px] text-zinc-400 mt-1">{description}</p>
          )}
        </div>

        <div
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-sm border font-mono text-xs',
            timedOut
              ? 'border-zinc-700 bg-zinc-900/60 text-zinc-500'
              : isWarning
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                : 'border-zinc-700 text-zinc-400',
          )}
          aria-label={`Time remaining: ${formatCountdown(remaining)}`}
          aria-live="polite"
        >
          <Clock className="w-3 h-3" />
          <span>{timedOut ? 'Timed out' : formatCountdown(remaining)}</span>
        </div>
      </div>

      {/* Warning banner */}
      <AnimatePresence>
        {isWarning && !timedOut && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-mono text-amber-300">
                Checkpoint will auto-save in {formatCountdown(remaining)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auto-saved notification */}
      <AnimatePresence>
        {timedOut && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-zinc-600 bg-zinc-800/80">
              <Save className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="text-xs font-mono text-zinc-300">
                State auto-saved. Approval timed out.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview content */}
      {previewData && (
        <div className="mb-4 px-3 py-3 rounded-sm border border-zinc-700 bg-zinc-900/80">
          <span className="font-mono text-[10px] font-medium tracking-[0.15em] uppercase text-zinc-500 block mb-2">
            Preview
          </span>
          <div className="text-[13px] text-zinc-300">{previewData}</div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={timedOut}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-sm border text-xs font-mono transition-colors duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
            'hover:bg-emerald-500/20 hover:border-emerald-500/70',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500',
          )}
          aria-label={`Approve checkpoint`}
        >
          <Check className="w-3 h-3" />
          <span>Approve</span>
        </button>

        <button
          type="button"
          onClick={handleToggleChangeInput}
          disabled={timedOut}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-sm border text-xs font-mono transition-colors duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            showChangeInput
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
              : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500',
          )}
          aria-label="Request changes"
          aria-expanded={showChangeInput}
        >
          <Edit3 className="w-3 h-3" />
          <span>{showChangeInput ? 'Cancel' : 'Request Changes'}</span>
        </button>
      </div>

      {/* Change request textarea */}
      <AnimatePresence>
        {showChangeInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              <label
                htmlFor={`change-request-${checkpointId}`}
                className="font-mono text-[10px] font-medium tracking-[0.15em] uppercase text-zinc-500"
              >
                Describe requested changes
              </label>
              <textarea
                ref={textareaRef}
                id={`change-request-${checkpointId}`}
                value={changeRequest}
                onChange={(e) => setChangeRequest(e.target.value)}
                placeholder="Describe what should be changed..."
                rows={3}
                className={cn(
                  'w-full px-3 py-2 rounded-sm border border-zinc-700 bg-zinc-900/80',
                  'text-[13px] text-zinc-200 placeholder:text-zinc-600',
                  'font-mono resize-none',
                  'focus:outline-none focus:border-zinc-500',
                )}
              />
              <button
                type="button"
                onClick={handleSubmitChanges}
                disabled={!changeRequest.trim()}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-sm border text-xs font-mono transition-colors duration-200',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'border-amber-500/50 bg-amber-500/10 text-amber-400',
                  'hover:bg-amber-500/20 hover:border-amber-500/70',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500',
                )}
              >
                <X className="w-3 h-3" />
                <span>Submit Changes</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default CheckpointApproval;
