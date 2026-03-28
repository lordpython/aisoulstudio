/**
 * Route layout wrapper component
 * Requirements: 2.2 - Handle document title updates per route
 */

import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRouteByPath } from './routes';
import { Sidebar } from '@/components/layout/Sidebar';
import { useLanguage } from '@/i18n/useLanguage';
import { cn } from '@/lib/utils';

/**
 * Layout wrapper that applies to all routes
 * - Updates document title based on current route
 * - Provides consistent layout structure with Sidebar
 */
export function RouteLayout() {
  const location = useLocation();
  const { t } = useTranslation();
  const { isRTL } = useLanguage();

  useEffect(() => {
    const routeConfig = getRouteByPath(location.pathname);
    if (routeConfig) {
      document.title = `${t(routeConfig.title)} | Aisoul Studio`;
    } else {
      document.title = 'Aisoul Studio';
    }
  }, [location.pathname, t]);

  return (
    <div className={cn('flex min-h-screen', isRTL && 'flex-row-reverse')}>
      {/* Fixed-width sidebar strip */}
      <aside
        className={cn(
          'w-[60px] shrink-0 h-screen sticky top-0 z-30',
          'bg-[oklch(0.04_0.01_240)]',
          isRTL
            ? 'border-l border-[oklch(0.14_0.03_240)]'
            : 'border-r border-[oklch(0.14_0.03_240)]',
        )}
      >
        <Sidebar />
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
