/**
 * LoadingState - Consistent loading indicators
 *
 * Provides various loading state representations for different contexts.
 */

import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface LoadingStateProps {
  /** Loading message to display */
  message?: string;
  /** Variant of loading indicator */
  variant?: 'spinner' | 'dots' | 'pulse' | 'branded';
  /** Size of the loading indicator */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
  /** Whether to show as full page/area overlay */
  fullArea?: boolean;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

const textSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

/**
 * Loading indicator with multiple variants
 */
export function LoadingState({
  message,
  variant = 'spinner',
  size = 'md',
  className,
  fullArea = false,
}: LoadingStateProps) {
  const content = (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      {variant === 'spinner' && (
        <Loader2
          className={cn(sizeClasses[size], 'text-violet-400 animate-spin')}
          aria-hidden="true"
        />
      )}

      {variant === 'dots' && (
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className={cn(
                'rounded-full bg-violet-400',
                size === 'sm' ? 'w-1.5 h-1.5' : size === 'md' ? 'w-2 h-2' : 'w-3 h-3'
              )}
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: 0.8,
                delay: i * 0.15,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      )}

      {variant === 'pulse' && (
        <motion.div
          className={cn(
            'rounded-full bg-violet-500/20 border border-violet-500/30',
            sizeClasses[size]
          )}
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {variant === 'branded' && (
        <motion.div
          className={cn(
            'rounded-2xl bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-white/10 flex items-center justify-center',
            size === 'sm' ? 'w-10 h-10' : size === 'md' ? 'w-16 h-16' : 'w-20 h-20'
          )}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles
            className={cn(
              'text-violet-400',
              size === 'sm' ? 'w-5 h-5' : size === 'md' ? 'w-8 h-8' : 'w-10 h-10'
            )}
          />
        </motion.div>
      )}

      {message && (
        <span className={cn('text-white/60', textSizeClasses[size])}>{message}</span>
      )}
    </div>
  );

  if (fullArea) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-[200px]">
        {content}
      </div>
    );
  }

  return content;
}

/**
 * Inline loading spinner for buttons etc.
 */
export function InlineLoader({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn('w-4 h-4 animate-spin', className)}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton loading placeholder
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-white/10', className)}
      {...props}
    />
  );
}

export default LoadingState;
