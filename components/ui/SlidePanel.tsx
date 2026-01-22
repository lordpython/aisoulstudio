/**
 * SlidePanel - Slide-in side panel component
 *
 * A reusable slide-in panel for editing sidebars, scene editors, etc.
 * Includes focus trapping and RTL support.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export interface SlidePanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Callback when panel should close */
  onClose: () => void;
  /** Panel title */
  title: string;
  /** RTL layout */
  isRTL?: boolean;
  /** Panel width class */
  width?: string;
  /** Panel content */
  children: React.ReactNode;
  /** Additional class names for the panel */
  className?: string;
  /** Whether to show the close button */
  showCloseButton?: boolean;
  /** ID for the title element (for aria-labelledby) */
  titleId?: string;
}

/**
 * Slide-in panel with focus trapping
 *
 * @example
 * ```tsx
 * <SlidePanel
 *   isOpen={showEditor}
 *   onClose={() => setShowEditor(false)}
 *   title="Edit Scene"
 *   isRTL={isRTL}
 * >
 *   <SceneEditor ... />
 * </SlidePanel>
 * ```
 */
export function SlidePanel({
  isOpen,
  onClose,
  title,
  isRTL = false,
  width = 'max-w-md',
  children,
  className,
  showCloseButton = true,
  titleId,
}: SlidePanelProps) {
  const panelRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: onClose,
    returnFocusOnDeactivate: true,
  });

  const generatedTitleId = titleId || `slide-panel-title-${React.useId()}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex"
          style={{ justifyContent: isRTL ? 'flex-start' : 'flex-end' }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby={generatedTitleId}
        >
          <motion.div
            ref={panelRef}
            initial={{ x: isRTL ? '-100%' : '100%' }}
            animate={{ x: 0 }}
            exit={{ x: isRTL ? '-100%' : '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              'w-full bg-[#12121a] h-full overflow-y-auto p-4',
              width,
              isRTL ? 'border-e border-white/10' : 'border-s border-white/10',
              className
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className={cn(
                'flex items-center justify-between mb-6',
                isRTL && 'flex-row-reverse'
              )}
            >
              <h2 id={generatedTitleId} className="text-lg font-semibold text-white">
                {title}
              </h2>
              {showCloseButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  aria-label="Close panel"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </Button>
              )}
            </div>

            {/* Content */}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SlidePanel;
