/**
 * Unsaved Changes Guard
 * Requirements: 10.3 - Warn users before navigating away from unsaved work
 * 
 * This component provides:
 * 1. A hook to track unsaved changes
 * 2. Browser beforeunload event handling
 * 3. React Router navigation blocking with confirmation dialog
 */

import React, { useEffect, useCallback, useState } from 'react';
import { useBlocker, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/stores';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface UnsavedChangesGuardProps {
  /** Whether there are unsaved changes to protect */
  hasUnsavedChanges?: boolean;
  /** Custom message to show in the dialog */
  message?: string;
  /** Callback when user confirms leaving */
  onConfirmLeave?: () => void;
  /** Children to render */
  children?: React.ReactNode;
}

/**
 * Guard component that prevents navigation when there are unsaved changes
 */
export function UnsavedChangesGuard({
  hasUnsavedChanges: propHasUnsavedChanges,
  message,
  onConfirmLeave,
  children,
}: UnsavedChangesGuardProps) {
  const { t } = useTranslation();
  const location = useLocation();
  
  // Get unsaved changes state from store if not provided via props
  const storeHasUnsavedChanges = useAppStore((s) => s.navigationState.hasUnsavedChanges);
  const hasUnsavedChanges = propHasUnsavedChanges ?? storeHasUnsavedChanges;
  
  const setHasUnsavedChanges = useAppStore((s) => s.setHasUnsavedChanges);
  const setLastRoute = useAppStore((s) => s.setLastRoute);

  // Track current route
  useEffect(() => {
    setLastRoute(location.pathname);
  }, [location.pathname, setLastRoute]);

  // Block navigation when there are unsaved changes
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname
  );

  // Handle browser beforeunload event (refresh, close tab)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        // Modern browsers require returnValue to be set
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Handle confirm leave
  const handleConfirmLeave = useCallback(() => {
    setHasUnsavedChanges(false);
    onConfirmLeave?.();
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  }, [blocker, setHasUnsavedChanges, onConfirmLeave]);

  // Handle cancel (stay on page)
  const handleCancel = useCallback(() => {
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  }, [blocker]);

  const defaultMessage = t('common.unsavedChangesMessage', {
    defaultValue: 'You have unsaved changes. Are you sure you want to leave? Your changes will be lost.',
  });

  return (
    <>
      {children}
      
      {/* Confirmation Dialog */}
      <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {t('common.unsavedChanges', { defaultValue: 'Unsaved Changes' })}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {message || defaultMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={handleCancel}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              {t('common.stay', { defaultValue: 'Stay' })}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmLeave}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('common.leaveAnyway', { defaultValue: 'Leave Anyway' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Hook to manage unsaved changes state
 * Use this in components that need to track unsaved changes
 */
export function useUnsavedChanges() {
  const hasUnsavedChanges = useAppStore((s) => s.navigationState.hasUnsavedChanges);
  const setHasUnsavedChanges = useAppStore((s) => s.setHasUnsavedChanges);

  const markAsUnsaved = useCallback(() => {
    setHasUnsavedChanges(true);
  }, [setHasUnsavedChanges]);

  const markAsSaved = useCallback(() => {
    setHasUnsavedChanges(false);
  }, [setHasUnsavedChanges]);

  return {
    hasUnsavedChanges,
    markAsUnsaved,
    markAsSaved,
    setHasUnsavedChanges,
  };
}

export default UnsavedChangesGuard;
