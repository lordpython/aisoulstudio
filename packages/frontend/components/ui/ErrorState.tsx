/**
 * ErrorState - Consistent error display
 *
 * Provides various error state representations for different contexts.
 */

import React from 'react';
import { AlertCircle, RefreshCw, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ErrorStateProps {
  /** Error title */
  title?: string;
  /** Error message to display */
  message: string;
  /** Variant of error display */
  variant?: 'inline' | 'card' | 'fullArea';
  /** Callback for retry action */
  onRetry?: () => void;
  /** Custom retry button text */
  retryText?: string;
  /** Additional actions */
  actions?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * Error state display with optional retry
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  variant = 'card',
  onRetry,
  retryText = 'Try again',
  actions,
  className,
}: ErrorStateProps) {
  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-red-400 text-sm',
          className
        )}
        role="alert"
      >
        <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-red-300 hover:text-red-200 underline underline-offset-2"
          >
            {retryText}
          </button>
        )}
      </div>
    );
  }

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl bg-red-500/10 border border-red-500/20 p-6',
        variant === 'fullArea' && 'max-w-md mx-auto',
        className
      )}
      role="alert"
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5 text-red-400" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-red-200 font-medium mb-1">{title}</h3>
          <p className="text-red-200/70 text-sm">{message}</p>

          {(onRetry || actions) && (
            <div className="mt-4 flex items-center gap-3">
              {onRetry && (
                <Button
                  onClick={onRetry}
                  size="sm"
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30"
                >
                  <RefreshCw className="w-3.5 h-3.5 me-2" aria-hidden="true" />
                  {retryText}
                </Button>
              )}
              {actions}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  if (variant === 'fullArea') {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-[300px] p-6">
        {content}
      </div>
    );
  }

  return content;
}

/**
 * Error boundary fallback component
 */
export interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary?: () => void;
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <ErrorState
      variant="fullArea"
      title="Application Error"
      message={error.message || 'An unexpected error occurred'}
      onRetry={resetErrorBoundary}
      retryText="Reload"
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.location.reload()}
          className="text-red-200/70 hover:text-red-200"
        >
          Refresh page
          <ChevronRight className="w-3.5 h-3.5 ms-1" aria-hidden="true" />
        </Button>
      }
    />
  );
}

export default ErrorState;
