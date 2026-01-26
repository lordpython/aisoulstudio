/**
 * QuickActions - Quick action button strip
 *
 * Displays a row of quick action buttons for common actions
 * like creating videos, generating music, etc.
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface QuickActionItem {
  icon: LucideIcon;
  label: string;
  prompt?: string;
  onClick?: () => void;
}

export interface QuickActionsProps {
  /** List of quick actions to display */
  actions: QuickActionItem[];
  /** Callback when an action is selected */
  onSelect?: (action: QuickActionItem) => void;
  /** RTL layout */
  isRTL?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Quick action button strip
 *
 * @example
 * ```tsx
 * <QuickActions
 *   actions={[
 *     { icon: Video, label: 'Create Video', prompt: 'Create a...' },
 *     { icon: Music, label: 'Generate Music', prompt: 'Generate...' },
 *   ]}
 *   onSelect={(action) => setInput(action.prompt)}
 * />
 * ```
 */
export function QuickActions({
  actions,
  onSelect,
  isRTL = false,
  className,
}: QuickActionsProps) {
  const handleClick = (action: QuickActionItem) => {
    if (action.onClick) {
      action.onClick();
    } else if (onSelect) {
      onSelect(action);
    }
  };

  return (
    <div className={cn('max-w-3xl mx-auto w-full px-4 pb-4', className)}>
      <div
        className={cn(
          'flex flex-wrap justify-center gap-2',
          isRTL && 'flex-row-reverse'
        )}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => handleClick(action)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/70 hover:text-white transition-all"
          >
            <action.icon className="w-4 h-4 text-violet-400" aria-hidden="true" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default QuickActions;
