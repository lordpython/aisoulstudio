/**
 * ScreenLayout - Unified screen layout wrapper
 *
 * Provides consistent layout structure for all screens with:
 * - Header integration
 * - Main content area with focus management
 * - Footer area for inputs/actions
 * - Background effects
 */

import React, { useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { AmbientBackground } from '@/components/AmbientBackground';
import { Header } from '@/components/layout/Header';

export interface ScreenLayoutProps {
  /** Screen title for header */
  title: string;
  /** Show back button in header */
  showBackButton?: boolean;
  /** Custom back navigation handler */
  onBack?: () => void;
  /** Header action buttons */
  headerActions?: React.ReactNode;
  /** Main content */
  children: React.ReactNode;
  /** Footer content (e.g., input area) */
  footer?: React.ReactNode;
  /** Additional class names for main content */
  contentClassName?: string;
  /** Whether to show ambient background */
  showBackground?: boolean;
  /** Max width for content area */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  /** Center content vertically */
  centerContent?: boolean;
  /** ARIA label for main content */
  ariaLabel?: string;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  full: 'max-w-full',
};

/**
 * Unified screen layout with header, content, and footer areas
 *
 * @example
 * ```tsx
 * <ScreenLayout
 *   title="Studio"
 *   showBackButton
 *   headerActions={<Button>Export</Button>}
 *   footer={<ChatInput ... />}
 * >
 *   <ChatMessages ... />
 * </ScreenLayout>
 * ```
 */
export function ScreenLayout({
  title,
  showBackButton = false,
  onBack,
  headerActions,
  children,
  footer,
  contentClassName,
  showBackground = true,
  maxWidth = '3xl',
  centerContent = false,
  ariaLabel,
}: ScreenLayoutProps) {
  const { isRTL } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const mainContentRef = useRef<HTMLElement>(null);

  // Focus main content on navigation (Requirement 9.4)
  useEffect(() => {
    const timer = setTimeout(() => {
      mainContentRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/');
    }
  };

  return (
    <div className={cn('h-screen relative overflow-hidden flex flex-col', isRTL && 'rtl')}>
      {/* Background */}
      {showBackground && <AmbientBackground />}

      {/* Header */}
      <div className="p-4 shrink-0 z-20">
        <Header
          showBackButton={showBackButton}
          onBack={handleBack}
          title={title}
          actions={headerActions}
        />
      </div>

      {/* Main Content */}
      <main
        id="main-content"
        ref={mainContentRef}
        className={cn(
          'flex-1 overflow-hidden flex flex-col',
          centerContent && 'justify-center'
        )}
        tabIndex={-1}
        aria-label={ariaLabel || title}
      >
        <div className={cn("flex-1 overflow-y-auto", contentClassName?.includes('h-full') && 'flex flex-col')}>
          <div
            className={cn(
              'mx-auto',
              maxWidth !== 'full' && 'px-4',
              maxWidthClasses[maxWidth],
              contentClassName
            )}
          >
            {children}
          </div>
        </div>
      </main>

      {/* Footer */}
      {footer && footer}
    </div>
  );
}

export default ScreenLayout;
