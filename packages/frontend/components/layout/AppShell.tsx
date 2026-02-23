import React, { useEffect } from 'react';
import { useLanguage } from '@/i18n/useLanguage';
import { cn } from '@/lib/utils';

export interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * SkipToContent - Accessibility link to skip navigation and jump to main content
 * Requirements: 9.1 - Add skip-to-content link
 */
const SkipToContent: React.FC = () => {
  const { t } = useLanguage();
  
  return (
    <a
      href="#main-content"
      className={cn(
        'sr-only focus:not-sr-only',
        'focus:fixed focus:top-4 focus:left-4 focus:z-[100]',
        'focus:px-4 focus:py-2 focus:rounded-lg',
        'focus:bg-primary focus:text-primary-foreground',
        'focus:outline-none focus:ring-2 focus:ring-primary-foreground',
        'transition-all duration-200'
      )}
    >
      {t('a11y.skipToContent')}
    </a>
  );
};

/**
 * AppShell is the root layout wrapper that handles:
 * - RTL/LTR direction based on current language
 * - HTML lang and dir attribute updates
 * - Base layout structure for the application
 * - Skip-to-content accessibility link
 * 
 * Requirements: 9.1 - Use semantic HTML elements
 * Requirements: 9.3 - Update lang and dir attributes on HTML element
 */
export const AppShell: React.FC<AppShellProps> = ({ children, className }) => {
  const { language, direction, isRTL } = useLanguage();

  // Update HTML document attributes when language changes
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('lang', language);
    html.setAttribute('dir', direction);
    
    // Update body class for RTL-specific styles
    if (isRTL) {
      document.body.classList.add('rtl');
    } else {
      document.body.classList.remove('rtl');
    }

    return () => {
      document.body.classList.remove('rtl');
    };
  }, [language, direction, isRTL]);

  return (
    <div
      className={cn(
        'min-h-screen bg-background text-foreground font-sans',
        isRTL && 'rtl',
        className
      )}
      dir={direction}
    >
      {/* Skip to content link for keyboard/screen reader users */}
      <SkipToContent />
      {children}
    </div>
  );
};

export default AppShell;
